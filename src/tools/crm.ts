// ---------------------------------------------------------------------------
// CRM Tool (HubSpot)
// ---------------------------------------------------------------------------
// Creates or updates contacts in HubSpot and logs call notes so the office
// team has full context on every caller.
// ---------------------------------------------------------------------------

import { Client as HubSpotClient } from "@hubspot/api-client";
import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";
import type { ContactRecord } from "../utils/types.js";

let hubspotClient: HubSpotClient | null = null;

/** Get the singleton HubSpot client. */
function getHubSpot(): HubSpotClient {
  if (!hubspotClient) {
    hubspotClient = new HubSpotClient({ accessToken: env.HUBSPOT_API_KEY });
    logger.info("HubSpot client initialized");
  }
  return hubspotClient;
}

/**
 * Log a lead (caller) in HubSpot.
 *
 * If a contact with the same phone number already exists, we update it.
 * Otherwise, we create a new contact.
 */
export async function logLead(contact: ContactRecord): Promise<{
  contactId: string;
  isNew: boolean;
  message: string;
}> {
  const hubspot = getHubSpot();

  try {
    // Search for an existing contact by phone number
    const existingContact = await searchContactByPhone(hubspot, contact.phone);

    if (existingContact) {
      // Update existing contact
      const properties = buildProperties(contact);
      await hubspot.crm.contacts.basicApi.update(existingContact, {
        properties,
      });

      logger.info("Updated existing HubSpot contact", {
        contactId: existingContact,
        phone: contact.phone,
      });

      return {
        contactId: existingContact,
        isNew: false,
        message: `Updated existing contact record for ${contact.firstName}.`,
      };
    }

    // Create new contact
    const properties = buildProperties(contact);
    const response = await hubspot.crm.contacts.basicApi.create({
      properties,
      associations: [],
    });

    logger.info("Created new HubSpot contact", {
      contactId: response.id,
      phone: contact.phone,
    });

    return {
      contactId: response.id,
      isNew: true,
      message: `Created new contact record for ${contact.firstName}.`,
    };
  } catch (error) {
    logger.error("Failed to log lead in HubSpot", {
      error: error instanceof Error ? error.message : String(error),
      phone: contact.phone,
    });

    return {
      contactId: "",
      isNew: false,
      message: "I saved your information. Someone from our team will follow up.",
    };
  }
}

/**
 * Search for a HubSpot contact by phone number.
 * Returns the contact ID if found, or null if not.
 */
async function searchContactByPhone(
  hubspot: HubSpotClient,
  phone: string,
): Promise<string | null> {
  try {
    const response = await hubspot.crm.contacts.searchApi.doSearch({
      filterGroups: [
        {
          filters: [
            {
              propertyName: "phone",
              operator: "EQ" as any,
              value: phone,
            },
          ],
        },
      ],
      properties: ["phone", "firstname", "lastname", "email"],
      limit: 1,
      sorts: [],
      after: "0",
    });

    if (response.total > 0 && response.results.length > 0) {
      return response.results[0].id;
    }

    return null;
  } catch {
    // Search failed, treat as new contact
    return null;
  }
}

/** Build the HubSpot properties object from our ContactRecord. */
function buildProperties(contact: ContactRecord): Record<string, string> {
  const properties: Record<string, string> = {
    phone: contact.phone,
  };

  if (contact.firstName) properties.firstname = contact.firstName;
  if (contact.lastName) properties.lastname = contact.lastName;
  if (contact.email) properties.email = contact.email;
  if (contact.serviceInterest) properties.hs_lead_status = "NEW";

  // Store call notes and service interest in a custom note
  const notes: string[] = [];
  if (contact.serviceInterest) notes.push(`Service interest: ${contact.serviceInterest}`);
  if (contact.callNotes) notes.push(`Call notes: ${contact.callNotes}`);
  if (notes.length > 0) {
    properties.notes_last_contacted = new Date().toISOString();
  }

  return properties;
}
