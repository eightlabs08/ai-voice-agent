// ---------------------------------------------------------------------------
// Google Calendar Tool
// ---------------------------------------------------------------------------
// Provides check_availability and book_appointment capabilities.
// Uses a Google service account for server-to-server auth.
// ---------------------------------------------------------------------------

import { google, type calendar_v3 } from "googleapis";
import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";
import type { TimeSlot, BookingConfirmation } from "../utils/types.js";

// Business hours configuration (easily customisable per business)
const BUSINESS_HOURS: Record<number, { open: number; close: number } | null> = {
  0: null, // Sunday - closed
  1: { open: 8, close: 17 }, // Monday
  2: { open: 8, close: 17 }, // Tuesday
  3: { open: 8, close: 17 }, // Wednesday
  4: { open: 8, close: 17 }, // Thursday
  5: { open: 8, close: 17 }, // Friday
  6: { open: 9, close: 13 }, // Saturday
};

const SLOT_DURATION_MINUTES = 30;

let calendarClient: calendar_v3.Calendar | null = null;

/**
 * Initialize the Google Calendar client using a service account.
 * The service account key is stored as a base64-encoded JSON string.
 */
function getCalendar(): calendar_v3.Calendar {
  if (calendarClient) return calendarClient;

  const keyJson = Buffer.from(env.GOOGLE_SERVICE_ACCOUNT_KEY, "base64").toString("utf-8");
  const credentials = JSON.parse(keyJson);

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/calendar"],
  });

  calendarClient = google.calendar({ version: "v3", auth });
  logger.info("Google Calendar client initialized");
  return calendarClient;
}

/**
 * Check available appointment slots for a given date.
 *
 * Looks at existing events on the calendar and returns 30-minute windows
 * that fall within business hours and are not already booked.
 */
export async function checkAvailability(
  dateStr?: string,
  service?: string,
): Promise<{ available: boolean; slots: TimeSlot[]; message: string }> {
  const calendar = getCalendar();

  // Default to today if no date specified
  const targetDate = dateStr ? new Date(dateStr) : new Date();
  const dayOfWeek = targetDate.getDay();
  const hours = BUSINESS_HOURS[dayOfWeek];

  if (!hours) {
    return {
      available: false,
      slots: [],
      message: `We are closed on ${targetDate.toLocaleDateString("en-US", { weekday: "long" })}. Our hours are Monday-Friday 8 AM to 5 PM and Saturday 9 AM to 1 PM.`,
    };
  }

  // Build the time range for the target day
  const dayStart = new Date(targetDate);
  dayStart.setHours(hours.open, 0, 0, 0);

  const dayEnd = new Date(targetDate);
  dayEnd.setHours(hours.close, 0, 0, 0);

  // Do not return slots in the past
  const now = new Date();
  const effectiveStart = dayStart > now ? dayStart : now;

  if (effectiveStart >= dayEnd) {
    return {
      available: false,
      slots: [],
      message: `No more available slots for today. Would you like to check another day?`,
    };
  }

  try {
    // Fetch existing events for the target day
    const response = await calendar.events.list({
      calendarId: env.GOOGLE_CALENDAR_ID,
      timeMin: dayStart.toISOString(),
      timeMax: dayEnd.toISOString(),
      singleEvents: true,
      orderBy: "startTime",
    });

    const busySlots = (response.data.items ?? []).map((event) => ({
      start: new Date(event.start?.dateTime ?? event.start?.date ?? ""),
      end: new Date(event.end?.dateTime ?? event.end?.date ?? ""),
    }));

    // Generate all possible 30-minute slots within business hours
    const availableSlots: TimeSlot[] = [];
    const cursor = new Date(effectiveStart);
    // Round up to the next 30-minute mark
    cursor.setMinutes(Math.ceil(cursor.getMinutes() / 30) * 30, 0, 0);

    while (cursor.getTime() + SLOT_DURATION_MINUTES * 60_000 <= dayEnd.getTime()) {
      const slotEnd = new Date(cursor.getTime() + SLOT_DURATION_MINUTES * 60_000);

      // Check if this slot overlaps with any existing event
      const isBusy = busySlots.some(
        (busy) => cursor < busy.end && slotEnd > busy.start,
      );

      if (!isBusy) {
        availableSlots.push({
          start: cursor.toISOString(),
          end: slotEnd.toISOString(),
          display: formatSlotDisplay(cursor, slotEnd),
        });
      }

      cursor.setMinutes(cursor.getMinutes() + SLOT_DURATION_MINUTES);
    }

    const serviceLabel = service ? ` for a ${service}` : "";

    if (availableSlots.length === 0) {
      return {
        available: false,
        slots: [],
        message: `Unfortunately, we are fully booked${serviceLabel} on ${targetDate.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}. Would you like to check another day?`,
      };
    }

    return {
      available: true,
      slots: availableSlots,
      message: `We have ${availableSlots.length} available slot${availableSlots.length > 1 ? "s" : ""}${serviceLabel} on ${targetDate.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}. Here are some options: ${availableSlots.slice(0, 4).map((s) => s.display.split(", ")[1]).join(", ")}.`,
    };
  } catch (error) {
    logger.error("Failed to check calendar availability", {
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      available: false,
      slots: [],
      message:
        "I am having trouble checking our calendar right now. Could I take your number and have someone call you back?",
    };
  }
}

/**
 * Book an appointment on Google Calendar.
 */
export async function bookAppointment(
  dateTime: string,
  patientName: string,
  service: string,
  phone: string,
  email?: string,
): Promise<BookingConfirmation> {
  const calendar = getCalendar();
  const startTime = new Date(dateTime);
  const endTime = new Date(startTime.getTime() + SLOT_DURATION_MINUTES * 60_000);

  const event = await calendar.events.insert({
    calendarId: env.GOOGLE_CALENDAR_ID,
    requestBody: {
      summary: `${service} - ${patientName}`,
      description: [
        `Patient: ${patientName}`,
        `Service: ${service}`,
        `Phone: ${phone}`,
        email ? `Email: ${email}` : "",
        "",
        "Booked by AI Receptionist (Sarah)",
      ]
        .filter(Boolean)
        .join("\n"),
      start: { dateTime: startTime.toISOString() },
      end: { dateTime: endTime.toISOString() },
      reminders: {
        useDefault: false,
        overrides: [
          { method: "email", minutes: 60 },
          { method: "popup", minutes: 30 },
        ],
      },
    },
  });

  const confirmation: BookingConfirmation = {
    eventId: event.data.id ?? "",
    calendarLink: event.data.htmlLink ?? "",
    dateTime: formatSlotDisplay(startTime, endTime),
    service,
    patientName,
  };

  logger.info("Appointment booked", {
    eventId: confirmation.eventId,
    patient: patientName,
    service,
    dateTime: startTime.toISOString(),
  });

  return confirmation;
}

/** Format a time slot as a human-readable string. */
function formatSlotDisplay(start: Date, end: Date): string {
  const dateOptions: Intl.DateTimeFormatOptions = {
    weekday: "long",
    month: "long",
    day: "numeric",
  };
  const timeOptions: Intl.DateTimeFormatOptions = {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  };
  const dateStr = start.toLocaleDateString("en-US", dateOptions);
  const startTime = start.toLocaleTimeString("en-US", timeOptions);
  const endTime = end.toLocaleTimeString("en-US", timeOptions);
  return `${dateStr}, ${startTime} - ${endTime}`;
}
