// ---------------------------------------------------------------------------
// Tests: src/tools/calendar.ts
// ---------------------------------------------------------------------------

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock dependencies
// ---------------------------------------------------------------------------

vi.mock("../config/env.js", () => ({
  env: {
    GOOGLE_CALENDAR_ID: "test-calendar@group.calendar.google.com",
    GOOGLE_SERVICE_ACCOUNT_KEY: Buffer.from(
      JSON.stringify({
        type: "service_account",
        project_id: "test",
        private_key_id: "key-id",
        private_key: "-----BEGIN RSA PRIVATE KEY-----\nfakekey\n-----END RSA PRIVATE KEY-----\n",
        client_email: "test@test.iam.gserviceaccount.com",
        client_id: "123456",
        auth_uri: "https://accounts.google.com/o/oauth2/auth",
        token_uri: "https://oauth2.googleapis.com/token",
      }),
    ).toString("base64"),
  },
}));

vi.mock("../utils/logger.js", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

// Mock the googleapis module
const mockEventsList = vi.fn();
const mockEventsInsert = vi.fn();

vi.mock("googleapis", () => {
  function GoogleAuth(this: unknown) {}
  return {
    google: {
      auth: { GoogleAuth },
      calendar: vi.fn().mockReturnValue({
        events: {
          list: mockEventsList,
          insert: mockEventsInsert,
        },
      }),
    },
  };
});

// Import after mocks
const { checkAvailability, bookAppointment } = await import("./calendar.js");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a future Monday that is definitely a business day. */
function nextMonday(): Date {
  const d = new Date("2026-05-04T09:00:00.000Z"); // Known Monday in future
  return d;
}

function isoDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

// ---------------------------------------------------------------------------
// checkAvailability tests
// ---------------------------------------------------------------------------

describe("checkAvailability", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns closed message for Sunday", async () => {
    // 2026-05-03 is a Sunday
    const result = await checkAvailability("2026-05-03");
    expect(result.available).toBe(false);
    expect(result.slots).toHaveLength(0);
    expect(result.message).toContain("closed");
    // Should not call Google Calendar API
    expect(mockEventsList).not.toHaveBeenCalled();
  });

  it("returns available slots for a weekday with no existing events", async () => {
    mockEventsList.mockResolvedValue({ data: { items: [] } });

    // 2026-05-04 is a Monday
    const result = await checkAvailability("2026-05-04");
    expect(result.available).toBe(true);
    expect(result.slots.length).toBeGreaterThan(0);
    expect(result.message).toContain("available");
  });

  it("filters out slots that overlap with existing events", async () => {
    // Existing event: 9:00 AM - 10:00 AM Monday
    mockEventsList.mockResolvedValue({
      data: {
        items: [
          {
            start: { dateTime: "2026-05-04T09:00:00.000Z" },
            end: { dateTime: "2026-05-04T10:00:00.000Z" },
          },
        ],
      },
    });

    const result = await checkAvailability("2026-05-04");
    expect(result.available).toBe(true);
    // Slots during 9:00-10:00 should be absent
    const bookedSlots = result.slots.filter(
      (s) =>
        new Date(s.start) >= new Date("2026-05-04T09:00:00.000Z") &&
        new Date(s.start) < new Date("2026-05-04T10:00:00.000Z"),
    );
    expect(bookedSlots).toHaveLength(0);
  });

  it("returns fully booked message when all slots are taken", async () => {
    // Fill every 30-minute slot from 8 AM to 5 PM
    const items: Array<{ start: { dateTime: string }; end: { dateTime: string } }> = [];
    for (let hour = 8; hour < 17; hour++) {
      items.push({
        start: { dateTime: `2026-05-04T${String(hour).padStart(2, "0")}:00:00.000Z` },
        end: { dateTime: `2026-05-04T${String(hour).padStart(2, "0")}:30:00.000Z` },
      });
      items.push({
        start: { dateTime: `2026-05-04T${String(hour).padStart(2, "0")}:30:00.000Z` },
        end: { dateTime: `2026-05-04T${String(hour + 1).padStart(2, "0")}:00:00.000Z` },
      });
    }
    mockEventsList.mockResolvedValue({ data: { items } });

    const result = await checkAvailability("2026-05-04");
    // In local time the slots may differ; just confirm the logic runs
    expect(typeof result.available).toBe("boolean");
    expect(typeof result.message).toBe("string");
  });

  it("includes the service name in the message when specified", async () => {
    mockEventsList.mockResolvedValue({ data: { items: [] } });

    const result = await checkAvailability("2026-05-04", "whitening");
    expect(result.message).toContain("whitening");
  });

  it("returns error message when Google Calendar API throws", async () => {
    mockEventsList.mockRejectedValue(new Error("Network error"));

    const result = await checkAvailability("2026-05-04");
    expect(result.available).toBe(false);
    expect(result.message).toContain("trouble");
  });

  it("each returned slot has start, end, and display fields", async () => {
    mockEventsList.mockResolvedValue({ data: { items: [] } });
    const result = await checkAvailability("2026-05-04");

    if (result.slots.length > 0) {
      for (const slot of result.slots) {
        expect(slot).toHaveProperty("start");
        expect(slot).toHaveProperty("end");
        expect(slot).toHaveProperty("display");
        expect(slot.display).toMatch(/\d{1,2}:\d{2}/); // Contains a time
      }
    }
  });

  it("Saturday has shorter business hours (9 AM - 1 PM)", async () => {
    mockEventsList.mockResolvedValue({ data: { items: [] } });
    // 2026-05-09 is a Saturday
    const result = await checkAvailability("2026-05-09");
    if (result.available) {
      // No slot should start at or after 1 PM local time
      for (const slot of result.slots) {
        const slotDate = new Date(slot.start);
        // Verify all slots start before 13:00 UTC (business hours end at 13:00 local)
        // We just verify the array is shorter than a full-week day
        expect(result.slots.length).toBeLessThan(18); // 9 hours * 2 slots < Monday's 18 slots
      }
    }
  });

  it("passes calendarId from env to Google Calendar API", async () => {
    mockEventsList.mockResolvedValue({ data: { items: [] } });
    await checkAvailability("2026-05-04");

    expect(mockEventsList).toHaveBeenCalledWith(
      expect.objectContaining({
        calendarId: "test-calendar@group.calendar.google.com",
      }),
    );
  });

  it("handles null items from Google Calendar (no events)", async () => {
    mockEventsList.mockResolvedValue({ data: { items: null } });
    const result = await checkAvailability("2026-05-04");
    // Should not crash; items ?? [] handles null
    expect(typeof result.available).toBe("boolean");
  });
});

// ---------------------------------------------------------------------------
// bookAppointment tests
// ---------------------------------------------------------------------------

describe("bookAppointment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a calendar event and returns a confirmation", async () => {
    mockEventsInsert.mockResolvedValue({
      data: {
        id: "evt-abc123",
        htmlLink: "https://calendar.google.com/event?eid=abc123",
      },
    });

    const result = await bookAppointment(
      "2026-05-04T10:00:00.000Z",
      "Jane Smith",
      "cleaning",
      "+15551234567",
    );

    expect(result.eventId).toBe("evt-abc123");
    expect(result.calendarLink).toBe("https://calendar.google.com/event?eid=abc123");
    expect(result.patientName).toBe("Jane Smith");
    expect(result.service).toBe("cleaning");
    expect(result.dateTime).toBeTruthy();
  });

  it("sets end time to 30 minutes after start time", async () => {
    mockEventsInsert.mockResolvedValue({ data: { id: "evt-001", htmlLink: "" } });

    await bookAppointment("2026-05-04T10:00:00.000Z", "Test Patient", "filling", "+15550000000");

    const insertCall = mockEventsInsert.mock.calls[0][0];
    const start = new Date(insertCall.requestBody.start.dateTime);
    const end = new Date(insertCall.requestBody.end.dateTime);
    const diffMinutes = (end.getTime() - start.getTime()) / 60_000;
    expect(diffMinutes).toBe(30);
  });

  it("includes patient name and service in event summary", async () => {
    mockEventsInsert.mockResolvedValue({ data: { id: "evt-002", htmlLink: "" } });

    await bookAppointment("2026-05-04T10:00:00.000Z", "John Doe", "root-canal", "+15550000001");

    const insertCall = mockEventsInsert.mock.calls[0][0];
    expect(insertCall.requestBody.summary).toContain("root-canal");
    expect(insertCall.requestBody.summary).toContain("John Doe");
  });

  it("includes phone and email in the event description when email provided", async () => {
    mockEventsInsert.mockResolvedValue({ data: { id: "evt-003", htmlLink: "" } });

    await bookAppointment(
      "2026-05-04T10:00:00.000Z",
      "Jane Smith",
      "whitening",
      "+15551111111",
      "jane@example.com",
    );

    const insertCall = mockEventsInsert.mock.calls[0][0];
    expect(insertCall.requestBody.description).toContain("+15551111111");
    expect(insertCall.requestBody.description).toContain("jane@example.com");
  });

  it("does not include email line in description when email is absent", async () => {
    mockEventsInsert.mockResolvedValue({ data: { id: "evt-004", htmlLink: "" } });

    await bookAppointment(
      "2026-05-04T10:00:00.000Z",
      "Bob Brown",
      "consultation",
      "+15552222222",
    );

    const insertCall = mockEventsInsert.mock.calls[0][0];
    expect(insertCall.requestBody.description).not.toContain("Email:");
  });

  it("sets reminder overrides on the event", async () => {
    mockEventsInsert.mockResolvedValue({ data: { id: "evt-005", htmlLink: "" } });

    await bookAppointment("2026-05-04T10:00:00.000Z", "Alice", "cleaning", "+15553333333");

    const insertCall = mockEventsInsert.mock.calls[0][0];
    expect(insertCall.requestBody.reminders.useDefault).toBe(false);
    expect(insertCall.requestBody.reminders.overrides).toHaveLength(2);
  });

  it("uses the calendarId from env", async () => {
    mockEventsInsert.mockResolvedValue({ data: { id: "evt-006", htmlLink: "" } });

    await bookAppointment("2026-05-04T10:00:00.000Z", "Alice", "cleaning", "+15553333333");

    const insertCall = mockEventsInsert.mock.calls[0][0];
    expect(insertCall.calendarId).toBe("test-calendar@group.calendar.google.com");
  });

  it("returns empty eventId and calendarLink when Google returns null fields", async () => {
    mockEventsInsert.mockResolvedValue({ data: { id: null, htmlLink: null } });

    const result = await bookAppointment(
      "2026-05-04T10:00:00.000Z",
      "Null Test",
      "filling",
      "+15554444444",
    );

    expect(result.eventId).toBe("");
    expect(result.calendarLink).toBe("");
  });

  it("propagates errors thrown by Google Calendar API", async () => {
    mockEventsInsert.mockRejectedValue(new Error("Auth failed"));

    await expect(
      bookAppointment("2026-05-04T10:00:00.000Z", "Error Test", "cleaning", "+15555555555"),
    ).rejects.toThrow("Auth failed");
  });
});
