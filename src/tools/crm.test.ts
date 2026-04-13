// ---------------------------------------------------------------------------
// Tests: src/tools/crm.ts
// ---------------------------------------------------------------------------

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock dependencies
// ---------------------------------------------------------------------------

vi.mock("../config/env.js", () => ({
  env: {
    HUBSPOT_API_KEY: "hs-test-key",
  },
}));

vi.mock("../utils/logger.js", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

// Mock HubSpot client
const mockDoSearch = vi.fn();
const mockCreate = vi.fn();
const mockUpdate = vi.fn();

vi.mock("@hubspot/api-client", () => {
  const Client = vi.fn(function (this: unknown) {
    Object.assign(this as object, {
      crm: {
        contacts: {
          searchApi: { doSearch: mockDoSearch },
          basicApi: { create: mockCreate, update: mockUpdate },
        },
      },
    });
  });
  return { Client };
});

// Import after mocks
const { logLead } = await import("./crm.js");

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("logLead", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // Create new contact
  // -------------------------------------------------------------------------

  it("creates a new contact when no existing contact is found", async () => {
    mockDoSearch.mockResolvedValue({ total: 0, results: [] });
    mockCreate.mockResolvedValue({ id: "contact-new-123" });

    const result = await logLead({ phone: "+15551234567", firstName: "Jane" });

    expect(mockCreate).toHaveBeenCalledOnce();
    expect(result.isNew).toBe(true);
    expect(result.contactId).toBe("contact-new-123");
    expect(result.message).toContain("Jane");
    expect(result.message).toContain("Created");
  });

  it("sends phone number as a property when creating a new contact", async () => {
    mockDoSearch.mockResolvedValue({ total: 0, results: [] });
    mockCreate.mockResolvedValue({ id: "contact-456" });

    await logLead({ phone: "+15551234567", firstName: "John" });

    const createCall = mockCreate.mock.calls[0][0];
    expect(createCall.properties.phone).toBe("+15551234567");
  });

  it("includes firstName, lastName, email when creating new contact", async () => {
    mockDoSearch.mockResolvedValue({ total: 0, results: [] });
    mockCreate.mockResolvedValue({ id: "contact-789" });

    await logLead({
      phone: "+15551234567",
      firstName: "Alice",
      lastName: "Wonder",
      email: "alice@example.com",
    });

    const createCall = mockCreate.mock.calls[0][0];
    expect(createCall.properties.firstname).toBe("Alice");
    expect(createCall.properties.lastname).toBe("Wonder");
    expect(createCall.properties.email).toBe("alice@example.com");
  });

  it("sets hs_lead_status to NEW when serviceInterest is provided", async () => {
    mockDoSearch.mockResolvedValue({ total: 0, results: [] });
    mockCreate.mockResolvedValue({ id: "contact-abc" });

    await logLead({
      phone: "+15551234567",
      firstName: "Bob",
      serviceInterest: "whitening",
    });

    const createCall = mockCreate.mock.calls[0][0];
    expect(createCall.properties.hs_lead_status).toBe("NEW");
  });

  it("does NOT set hs_lead_status when serviceInterest is absent", async () => {
    mockDoSearch.mockResolvedValue({ total: 0, results: [] });
    mockCreate.mockResolvedValue({ id: "contact-def" });

    await logLead({ phone: "+15551234567", firstName: "Carol" });

    const createCall = mockCreate.mock.calls[0][0];
    expect(createCall.properties.hs_lead_status).toBeUndefined();
  });

  it("sets notes_last_contacted when callNotes are present", async () => {
    mockDoSearch.mockResolvedValue({ total: 0, results: [] });
    mockCreate.mockResolvedValue({ id: "contact-ghi" });

    await logLead({
      phone: "+15551234567",
      firstName: "Dan",
      callNotes: "Interested in braces",
    });

    const createCall = mockCreate.mock.calls[0][0];
    expect(createCall.properties.notes_last_contacted).toBeDefined();
  });

  it("sets notes_last_contacted when serviceInterest is present", async () => {
    mockDoSearch.mockResolvedValue({ total: 0, results: [] });
    mockCreate.mockResolvedValue({ id: "contact-jkl" });

    await logLead({
      phone: "+15551234567",
      firstName: "Eve",
      serviceInterest: "crown",
    });

    const createCall = mockCreate.mock.calls[0][0];
    expect(createCall.properties.notes_last_contacted).toBeDefined();
  });

  it("does not set notes_last_contacted when no notes or service interest", async () => {
    mockDoSearch.mockResolvedValue({ total: 0, results: [] });
    mockCreate.mockResolvedValue({ id: "contact-mno" });

    await logLead({ phone: "+15551234567", firstName: "Frank" });

    const createCall = mockCreate.mock.calls[0][0];
    expect(createCall.properties.notes_last_contacted).toBeUndefined();
  });

  it("passes empty associations array when creating a contact", async () => {
    mockDoSearch.mockResolvedValue({ total: 0, results: [] });
    mockCreate.mockResolvedValue({ id: "contact-pqr" });

    await logLead({ phone: "+15551234567", firstName: "Grace" });

    const createCall = mockCreate.mock.calls[0][0];
    expect(createCall.associations).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // Update existing contact
  // -------------------------------------------------------------------------

  it("updates an existing contact when phone number matches", async () => {
    mockDoSearch.mockResolvedValue({
      total: 1,
      results: [{ id: "existing-contact-123" }],
    });
    mockUpdate.mockResolvedValue({});

    const result = await logLead({ phone: "+15551234567", firstName: "Jane" });

    expect(mockUpdate).toHaveBeenCalledOnce();
    expect(mockCreate).not.toHaveBeenCalled();
    expect(result.isNew).toBe(false);
    expect(result.contactId).toBe("existing-contact-123");
    expect(result.message).toContain("Updated");
  });

  it("passes the existing contact id to the update call", async () => {
    mockDoSearch.mockResolvedValue({
      total: 1,
      results: [{ id: "contact-xyz" }],
    });
    mockUpdate.mockResolvedValue({});

    await logLead({ phone: "+15551234567", firstName: "Jane" });

    const updateArgs = mockUpdate.mock.calls[0];
    expect(updateArgs[0]).toBe("contact-xyz");
  });

  // -------------------------------------------------------------------------
  // Search error (treat as new contact)
  // -------------------------------------------------------------------------

  it("creates a new contact when search throws (treat as new)", async () => {
    mockDoSearch.mockRejectedValue(new Error("HubSpot search failed"));
    mockCreate.mockResolvedValue({ id: "contact-fallback" });

    const result = await logLead({ phone: "+15551234567", firstName: "Heidi" });

    expect(mockCreate).toHaveBeenCalledOnce();
    expect(result.isNew).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Error handling - create/update fails
  // -------------------------------------------------------------------------

  it("returns a fallback message when create throws", async () => {
    mockDoSearch.mockResolvedValue({ total: 0, results: [] });
    mockCreate.mockRejectedValue(new Error("HubSpot rate limit"));

    const result = await logLead({ phone: "+15551234567", firstName: "Ivan" });

    expect(result.contactId).toBe("");
    expect(result.isNew).toBe(false);
    expect(result.message).toContain("follow up");
  });

  it("returns a fallback message when update throws", async () => {
    mockDoSearch.mockResolvedValue({
      total: 1,
      results: [{ id: "contact-existing" }],
    });
    mockUpdate.mockRejectedValue(new Error("Auth error"));

    const result = await logLead({ phone: "+15551234567", firstName: "Judy" });

    expect(result.contactId).toBe("");
    expect(result.message).toContain("follow up");
  });

  // -------------------------------------------------------------------------
  // Edge cases
  // -------------------------------------------------------------------------

  it("handles contact with only required fields (phone + firstName)", async () => {
    mockDoSearch.mockResolvedValue({ total: 0, results: [] });
    mockCreate.mockResolvedValue({ id: "contact-min" });

    const result = await logLead({ phone: "+15550000000", firstName: "Min" });

    expect(result.contactId).toBe("contact-min");
    expect(result.isNew).toBe(true);
  });

  it("searches for existing contact using the caller phone number", async () => {
    mockDoSearch.mockResolvedValue({ total: 0, results: [] });
    mockCreate.mockResolvedValue({ id: "contact-search" });

    await logLead({ phone: "+15559876543", firstName: "Search Test" });

    const searchCall = mockDoSearch.mock.calls[0][0];
    expect(searchCall.filterGroups[0].filters[0].value).toBe("+15559876543");
    expect(searchCall.filterGroups[0].filters[0].propertyName).toBe("phone");
  });
});
