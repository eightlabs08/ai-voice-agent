// ---------------------------------------------------------------------------
// Tests: src/server/webhooks.ts
// ---------------------------------------------------------------------------

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response } from "express";

// ---------------------------------------------------------------------------
// Mock all external dependencies before importing the module under test
// ---------------------------------------------------------------------------

vi.mock("../config/env.js", () => ({
  env: {
    ANTHROPIC_API_KEY: "sk-ant-test",
    OPENAI_API_KEY: "sk-test",
    GOOGLE_CALENDAR_ID: "cal-id",
    GOOGLE_SERVICE_ACCOUNT_KEY: "base64==",
    PINECONE_API_KEY: "pc-test",
    PINECONE_INDEX_NAME: "ai-voice-agent",
    HUBSPOT_API_KEY: "hs-test",
    RESEND_API_KEY: "re_test",
    RESEND_FROM_EMAIL: "from@test.com",
    TWILIO_ACCOUNT_SID: "ACtest",
    TWILIO_AUTH_TOKEN: "auth-test",
    TWILIO_PHONE_NUMBER: "+15550000000",
    VAPI_API_KEY: "vapi-test",
    PORT: "3001",
  },
}));

vi.mock("../utils/logger.js", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

vi.mock("../config/vapi-assistant.js", () => ({
  buildAssistantConfig: vi.fn(() => ({ name: "Test Assistant" })),
}));

const mockCheckAvailability = vi.fn();
const mockBookAppointment = vi.fn();
vi.mock("../tools/calendar.js", () => ({
  checkAvailability: mockCheckAvailability,
  bookAppointment: mockBookAppointment,
}));

const mockLookupFaq = vi.fn();
vi.mock("../tools/knowledge-base.js", () => ({
  lookupFaq: mockLookupFaq,
}));

const mockLogLead = vi.fn();
vi.mock("../tools/crm.js", () => ({
  logLead: mockLogLead,
}));

const mockSendConfirmation = vi.fn();
vi.mock("../tools/notifications.js", () => ({
  sendConfirmation: mockSendConfirmation,
}));

const mockTriggerPostCallWorkflow = vi.fn();
vi.mock("../services/n8n.js", () => ({
  triggerPostCallWorkflow: mockTriggerPostCallWorkflow,
}));

// Import after mocks are set up
const { handleVapiWebhook } = await import("./webhooks.js");

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeReqRes(body: unknown): { req: Request; res: Response; json: ReturnType<typeof vi.fn>; status: ReturnType<typeof vi.fn> } {
  const json = vi.fn();
  const statusFn = vi.fn().mockReturnValue({ json });
  const res = {
    status: statusFn,
    json,
  } as unknown as Response;

  // Chain: res.status(200).json({...})
  // We need status() to return an object with json()
  statusFn.mockImplementation(() => ({ json }));

  const req = { body } as Request;
  return { req, res, json, status: statusFn };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("handleVapiWebhook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTriggerPostCallWorkflow.mockResolvedValue(undefined);
  });

  // -------------------------------------------------------------------------
  // Invalid payloads
  // -------------------------------------------------------------------------

  it("returns 400 when body has no message", async () => {
    const { req, res, json, status } = makeReqRes({});
    await handleVapiWebhook(req, res);
    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringContaining("missing message.type") }),
    );
  });

  it("returns 400 when message has no type", async () => {
    const { req, res, json, status } = makeReqRes({ message: {} });
    await handleVapiWebhook(req, res);
    expect(status).toHaveBeenCalledWith(400);
  });

  // -------------------------------------------------------------------------
  // assistant-request
  // -------------------------------------------------------------------------

  it("returns 200 with assistant config on assistant-request", async () => {
    const { req, res, json, status } = makeReqRes({
      message: { type: "assistant-request" },
    });
    await handleVapiWebhook(req, res);
    expect(status).toHaveBeenCalledWith(200);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ assistant: expect.any(Object) }),
    );
  });

  it("calls buildAssistantConfig with provider determined by ANTHROPIC_API_KEY env var", async () => {
    const { buildAssistantConfig } = await import("../config/vapi-assistant.js");

    // The webhook reads process.env directly (not the mocked env object)
    // so we control the provider via process.env
    const original = process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";

    const { req, res } = makeReqRes({ message: { type: "assistant-request" } });
    await handleVapiWebhook(req, res);

    expect(buildAssistantConfig).toHaveBeenCalledWith("anthropic");
    process.env.ANTHROPIC_API_KEY = original;
  });

  // -------------------------------------------------------------------------
  // status-update
  // -------------------------------------------------------------------------

  it("returns 200 with received:true on status-update", async () => {
    const { req, res, json, status } = makeReqRes({
      message: { type: "status-update", status: "ringing" },
    });
    await handleVapiWebhook(req, res);
    expect(status).toHaveBeenCalledWith(200);
    expect(json).toHaveBeenCalledWith({ received: true });
  });

  it("handles status-update without a status field gracefully", async () => {
    const { req, res, json, status } = makeReqRes({
      message: { type: "status-update" },
    });
    await handleVapiWebhook(req, res);
    expect(status).toHaveBeenCalledWith(200);
  });

  // -------------------------------------------------------------------------
  // Unknown event type
  // -------------------------------------------------------------------------

  it("returns 200 with received:true for unknown event types", async () => {
    const { req, res, json, status } = makeReqRes({
      message: { type: "some-future-event" },
    });
    await handleVapiWebhook(req, res);
    expect(status).toHaveBeenCalledWith(200);
    expect(json).toHaveBeenCalledWith({ received: true });
  });

  // -------------------------------------------------------------------------
  // function-call: missing functionCall
  // -------------------------------------------------------------------------

  it("returns 400 when function-call message is missing functionCall", async () => {
    const { req, res, json, status } = makeReqRes({
      message: { type: "function-call" },
    });
    await handleVapiWebhook(req, res);
    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringContaining("Missing functionCall") }),
    );
  });

  // -------------------------------------------------------------------------
  // function-call: check_availability
  // -------------------------------------------------------------------------

  it("routes check_availability and returns the message", async () => {
    mockCheckAvailability.mockResolvedValue({
      available: true,
      slots: [],
      message: "We have 3 slots available.",
    });

    const { req, res, json, status } = makeReqRes({
      message: {
        type: "function-call",
        functionCall: {
          name: "check_availability",
          parameters: { date: "2026-05-01", service: "cleaning" },
        },
      },
    });

    await handleVapiWebhook(req, res);
    expect(mockCheckAvailability).toHaveBeenCalledWith("2026-05-01", "cleaning");
    expect(status).toHaveBeenCalledWith(200);
    expect(json).toHaveBeenCalledWith({ result: "We have 3 slots available." });
  });

  it("routes check_availability with no parameters", async () => {
    mockCheckAvailability.mockResolvedValue({
      available: false,
      slots: [],
      message: "Fully booked today.",
    });

    const { req, res, json } = makeReqRes({
      message: {
        type: "function-call",
        functionCall: { name: "check_availability", parameters: {} },
      },
    });

    await handleVapiWebhook(req, res);
    expect(mockCheckAvailability).toHaveBeenCalledWith(undefined, undefined);
    expect(json).toHaveBeenCalledWith({ result: "Fully booked today." });
  });

  // -------------------------------------------------------------------------
  // function-call: book_appointment
  // -------------------------------------------------------------------------

  it("routes book_appointment and returns a confirmation message", async () => {
    mockBookAppointment.mockResolvedValue({
      eventId: "evt-abc123",
      calendarLink: "https://calendar.google.com/evt-abc123",
      dateTime: "Monday, January 15, 10:00 AM - 10:30 AM",
      service: "cleaning",
      patientName: "Jane Smith",
    });

    const { req, res, json, status } = makeReqRes({
      message: {
        type: "function-call",
        functionCall: {
          name: "book_appointment",
          parameters: {
            dateTime: "2026-01-15T10:00:00Z",
            patientName: "Jane Smith",
            service: "cleaning",
            phone: "+15551234567",
          },
        },
      },
    });

    await handleVapiWebhook(req, res);
    expect(mockBookAppointment).toHaveBeenCalledWith(
      "2026-01-15T10:00:00Z",
      "Jane Smith",
      "cleaning",
      "+15551234567",
      undefined,
    );
    expect(status).toHaveBeenCalledWith(200);
    const callArg = json.mock.calls[0][0];
    expect(callArg.result).toContain("Appointment confirmed");
    expect(callArg.result).toContain("evt-abc123");
  });

  it("routes book_appointment with optional email", async () => {
    mockBookAppointment.mockResolvedValue({
      eventId: "evt-xyz",
      calendarLink: "",
      dateTime: "Tuesday, January 16, 2:00 PM - 2:30 PM",
      service: "whitening",
      patientName: "John Doe",
    });

    const { req, res } = makeReqRes({
      message: {
        type: "function-call",
        functionCall: {
          name: "book_appointment",
          parameters: {
            dateTime: "2026-01-16T14:00:00Z",
            patientName: "John Doe",
            service: "whitening",
            phone: "+15559999999",
            email: "john@example.com",
          },
        },
      },
    });

    await handleVapiWebhook(req, res);
    expect(mockBookAppointment).toHaveBeenCalledWith(
      "2026-01-16T14:00:00Z",
      "John Doe",
      "whitening",
      "+15559999999",
      "john@example.com",
    );
  });

  // -------------------------------------------------------------------------
  // function-call: lookup_faq
  // -------------------------------------------------------------------------

  it("routes lookup_faq and returns the answer", async () => {
    mockLookupFaq.mockResolvedValue({
      found: true,
      answer: "We accept Delta Dental and Aetna.",
      sources: ["insurance"],
    });

    const { req, res, json } = makeReqRes({
      message: {
        type: "function-call",
        functionCall: {
          name: "lookup_faq",
          parameters: { question: "What insurance do you accept?" },
        },
      },
    });

    await handleVapiWebhook(req, res);
    expect(mockLookupFaq).toHaveBeenCalledWith("What insurance do you accept?");
    expect(json).toHaveBeenCalledWith({ result: "We accept Delta Dental and Aetna." });
  });

  // -------------------------------------------------------------------------
  // function-call: log_lead
  // -------------------------------------------------------------------------

  it("routes log_lead and returns the message", async () => {
    mockLogLead.mockResolvedValue({
      contactId: "contact-123",
      isNew: true,
      message: "Created new contact record for Jane.",
    });

    const { req, res, json } = makeReqRes({
      message: {
        type: "function-call",
        functionCall: {
          name: "log_lead",
          parameters: {
            phone: "+15551234567",
            firstName: "Jane",
            lastName: "Smith",
            email: "jane@example.com",
            serviceInterest: "cleaning",
            callNotes: "Interested in whitening too",
          },
        },
      },
    });

    await handleVapiWebhook(req, res);
    expect(mockLogLead).toHaveBeenCalledWith({
      phone: "+15551234567",
      firstName: "Jane",
      lastName: "Smith",
      email: "jane@example.com",
      serviceInterest: "cleaning",
      callNotes: "Interested in whitening too",
    });
    expect(json).toHaveBeenCalledWith({ result: "Created new contact record for Jane." });
  });

  // -------------------------------------------------------------------------
  // function-call: send_confirmation
  // -------------------------------------------------------------------------

  it("routes send_confirmation and returns the message", async () => {
    mockSendConfirmation.mockResolvedValue({
      sms: true,
      email: true,
      message: "Great news! I have sent you a SMS confirmation and email confirmation with all the details.",
    });

    const { req, res, json } = makeReqRes({
      message: {
        type: "function-call",
        functionCall: {
          name: "send_confirmation",
          parameters: {
            phone: "+15551234567",
            email: "jane@example.com",
            patientName: "Jane Smith",
            appointmentTime: "Monday January 15, 10:00 AM",
            service: "cleaning",
          },
        },
      },
    });

    await handleVapiWebhook(req, res);
    expect(mockSendConfirmation).toHaveBeenCalledWith(
      expect.objectContaining({
        phone: "+15551234567",
        patientName: "Jane Smith",
        businessName: "Bright Smile Dental",
        businessAddress: expect.any(String),
      }),
    );
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ result: expect.stringContaining("confirmation") }),
    );
  });

  // -------------------------------------------------------------------------
  // function-call: unknown tool
  // -------------------------------------------------------------------------

  it("returns a fallback message for an unknown tool name", async () => {
    const { req, res, json, status } = makeReqRes({
      message: {
        type: "function-call",
        functionCall: {
          name: "nonexistent_tool",
          parameters: {},
        },
      },
    });

    await handleVapiWebhook(req, res);
    expect(status).toHaveBeenCalledWith(200);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ result: expect.stringContaining("wasn't able") }),
    );
  });

  // -------------------------------------------------------------------------
  // end-of-call-report
  // -------------------------------------------------------------------------

  it("returns 200 with received:true on end-of-call-report", async () => {
    const { req, res, json, status } = makeReqRes({
      message: {
        type: "end-of-call-report",
        summary: "Caller booked a cleaning.",
        transcript: "Hi - I need to book...",
        durationSeconds: 120,
        customer: { number: "+15551234567" },
        cost: 0.0034,
      },
    });

    await handleVapiWebhook(req, res);
    expect(status).toHaveBeenCalledWith(200);
    expect(json).toHaveBeenCalledWith({ received: true });
  });

  it("triggers the n8n workflow on end-of-call-report", async () => {
    const { req, res } = makeReqRes({
      message: {
        type: "end-of-call-report",
        summary: "Test summary",
        transcript: "Full transcript here",
        durationSeconds: 60,
      },
    });

    await handleVapiWebhook(req, res);
    expect(mockTriggerPostCallWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({
        summary: "Test summary",
        transcript: "Full transcript here",
        durationSeconds: 60,
      }),
    );
  });

  it("uses defaults when end-of-call-report fields are absent", async () => {
    const { req, res } = makeReqRes({
      message: { type: "end-of-call-report" },
    });

    await handleVapiWebhook(req, res);
    expect(mockTriggerPostCallWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({
        summary: "No summary available",
        transcript: "",
        durationSeconds: 0,
        callerPhone: undefined,
        costUsd: undefined,
      }),
    );
  });

  it("logs end-of-call-report even when n8n workflow fails", async () => {
    mockTriggerPostCallWorkflow.mockRejectedValue(new Error("n8n offline"));
    const { req, res, json, status } = makeReqRes({
      message: {
        type: "end-of-call-report",
        summary: "Call summary",
        transcript: "",
        durationSeconds: 30,
      },
    });

    await handleVapiWebhook(req, res);
    // Must still return 200 even when background task fails
    expect(status).toHaveBeenCalledWith(200);
    expect(json).toHaveBeenCalledWith({ received: true });
  });

  // -------------------------------------------------------------------------
  // Error handling
  // -------------------------------------------------------------------------

  it("returns 500 when a tool throws an unexpected error", async () => {
    mockCheckAvailability.mockRejectedValue(new Error("Unexpected crash"));

    const { req, res, json, status } = makeReqRes({
      message: {
        type: "function-call",
        functionCall: {
          name: "check_availability",
          parameters: {},
        },
      },
    });

    await handleVapiWebhook(req, res);
    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ error: "Internal server error" }),
    );
  });
});
