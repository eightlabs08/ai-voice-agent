// ---------------------------------------------------------------------------
// Tests: src/tools/notifications.ts
// ---------------------------------------------------------------------------

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NotificationRequest } from "../utils/types.js";

// ---------------------------------------------------------------------------
// Mock dependencies
// ---------------------------------------------------------------------------

vi.mock("../config/env.js", () => ({
  env: {
    TWILIO_ACCOUNT_SID: "ACtest123",
    TWILIO_AUTH_TOKEN: "auth-token-test",
    TWILIO_PHONE_NUMBER: "+15550000000",
    RESEND_API_KEY: "re_test_123456",
    RESEND_FROM_EMAIL: "onboarding@resend.dev",
  },
}));

vi.mock("../utils/logger.js", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

// Mock Twilio
const mockMessagesCreate = vi.fn();
vi.mock("twilio", () => ({
  default: vi.fn().mockReturnValue({
    messages: { create: mockMessagesCreate },
  }),
}));

// Mock Resend
const mockResendSend = vi.fn();
vi.mock("resend", () => ({
  Resend: vi.fn(function (this: any) {
    this.emails = { send: mockResendSend };
  }),
}));

// Import after mocks
const { sendSmsConfirmation, sendEmailConfirmation, sendConfirmation } = await import(
  "./notifications.js"
);

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const baseRequest: NotificationRequest = {
  phone: "+15551234567",
  patientName: "Jane Smith",
  businessName: "Bright Smile Dental",
  businessAddress: "742 Evergreen Terrace, Suite 200, Springfield, IL 62701",
};

const fullRequest: NotificationRequest = {
  ...baseRequest,
  email: "jane@example.com",
  appointmentTime: "Monday, January 15, 10:00 AM - 10:30 AM",
  service: "cleaning",
};

// ---------------------------------------------------------------------------
// sendSmsConfirmation tests
// ---------------------------------------------------------------------------

describe("sendSmsConfirmation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sends an SMS and returns success:true", async () => {
    mockMessagesCreate.mockResolvedValue({ sid: "SM-abc123" });

    const result = await sendSmsConfirmation(baseRequest);

    expect(mockMessagesCreate).toHaveBeenCalledOnce();
    expect(result.success).toBe(true);
    expect(result.message).toContain("SMS");
  });

  it("sends to the patient phone number", async () => {
    mockMessagesCreate.mockResolvedValue({ sid: "SM-001" });

    await sendSmsConfirmation(baseRequest);

    const callArgs = mockMessagesCreate.mock.calls[0][0];
    expect(callArgs.to).toBe("+15551234567");
  });

  it("sends from the Twilio phone number in env", async () => {
    mockMessagesCreate.mockResolvedValue({ sid: "SM-002" });

    await sendSmsConfirmation(baseRequest);

    const callArgs = mockMessagesCreate.mock.calls[0][0];
    expect(callArgs.from).toBe("+15550000000");
  });

  it("includes the patient name in the SMS body", async () => {
    mockMessagesCreate.mockResolvedValue({ sid: "SM-003" });

    await sendSmsConfirmation(fullRequest);

    const callArgs = mockMessagesCreate.mock.calls[0][0];
    expect(callArgs.body).toContain("Jane Smith");
  });

  it("includes the business name in the SMS body", async () => {
    mockMessagesCreate.mockResolvedValue({ sid: "SM-004" });

    await sendSmsConfirmation(baseRequest);

    const callArgs = mockMessagesCreate.mock.calls[0][0];
    expect(callArgs.body).toContain("Bright Smile Dental");
  });

  it("includes appointment time when provided", async () => {
    mockMessagesCreate.mockResolvedValue({ sid: "SM-005" });

    await sendSmsConfirmation(fullRequest);

    const callArgs = mockMessagesCreate.mock.calls[0][0];
    expect(callArgs.body).toContain("10:00 AM");
  });

  it("includes service when provided", async () => {
    mockMessagesCreate.mockResolvedValue({ sid: "SM-006" });

    await sendSmsConfirmation(fullRequest);

    const callArgs = mockMessagesCreate.mock.calls[0][0];
    expect(callArgs.body).toContain("cleaning");
  });

  it("does not crash when appointmentTime is absent", async () => {
    mockMessagesCreate.mockResolvedValue({ sid: "SM-007" });

    const result = await sendSmsConfirmation(baseRequest);

    expect(result.success).toBe(true);
  });

  it("returns success:false when Twilio throws", async () => {
    mockMessagesCreate.mockRejectedValue(new Error("Twilio auth failed"));

    const result = await sendSmsConfirmation(baseRequest);

    expect(result.success).toBe(false);
    expect(result.message).toContain("Could not send SMS");
  });

  it("does not throw when Twilio fails -- returns failure object", async () => {
    mockMessagesCreate.mockRejectedValue(new Error("Network timeout"));

    await expect(sendSmsConfirmation(baseRequest)).resolves.toMatchObject({
      success: false,
    });
  });

  it("includes business address in SMS body", async () => {
    mockMessagesCreate.mockResolvedValue({ sid: "SM-008" });

    await sendSmsConfirmation(fullRequest);

    const callArgs = mockMessagesCreate.mock.calls[0][0];
    expect(callArgs.body).toContain("742 Evergreen Terrace");
  });
});

// ---------------------------------------------------------------------------
// sendEmailConfirmation tests
// ---------------------------------------------------------------------------

describe("sendEmailConfirmation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns success:false immediately when email is not provided", async () => {
    const result = await sendEmailConfirmation(baseRequest);

    expect(mockResendSend).not.toHaveBeenCalled();
    expect(result.success).toBe(false);
    expect(result.message).toContain("No email");
  });

  it("sends an email and returns success:true", async () => {
    mockResendSend.mockResolvedValue({ id: "email-abc123" });

    const result = await sendEmailConfirmation(fullRequest);

    expect(mockResendSend).toHaveBeenCalledOnce();
    expect(result.success).toBe(true);
  });

  it("sends email to the patient email address", async () => {
    mockResendSend.mockResolvedValue({ id: "email-001" });

    await sendEmailConfirmation(fullRequest);

    const sendArgs = mockResendSend.mock.calls[0][0];
    expect(sendArgs.to).toBe("jane@example.com");
  });

  it("sends from the Resend from email in env", async () => {
    mockResendSend.mockResolvedValue({ id: "email-002" });

    await sendEmailConfirmation(fullRequest);

    const sendArgs = mockResendSend.mock.calls[0][0];
    expect(sendArgs.from).toBe("onboarding@resend.dev");
  });

  it("includes the business name in the subject line", async () => {
    mockResendSend.mockResolvedValue({ id: "email-003" });

    await sendEmailConfirmation(fullRequest);

    const sendArgs = mockResendSend.mock.calls[0][0];
    expect(sendArgs.subject).toContain("Bright Smile Dental");
  });

  it("includes the patient name in the email HTML", async () => {
    mockResendSend.mockResolvedValue({ id: "email-004" });

    await sendEmailConfirmation(fullRequest);

    const sendArgs = mockResendSend.mock.calls[0][0];
    expect(sendArgs.html).toContain("Jane Smith");
  });

  it("includes appointment time in HTML when provided", async () => {
    mockResendSend.mockResolvedValue({ id: "email-005" });

    await sendEmailConfirmation(fullRequest);

    const sendArgs = mockResendSend.mock.calls[0][0];
    expect(sendArgs.html).toContain("10:00 AM");
  });

  it("includes the service type in the HTML", async () => {
    mockResendSend.mockResolvedValue({ id: "email-006" });

    await sendEmailConfirmation(fullRequest);

    const sendArgs = mockResendSend.mock.calls[0][0];
    expect(sendArgs.html).toContain("cleaning");
  });

  it("includes business address in the email HTML", async () => {
    mockResendSend.mockResolvedValue({ id: "email-007" });

    await sendEmailConfirmation(fullRequest);

    const sendArgs = mockResendSend.mock.calls[0][0];
    expect(sendArgs.html).toContain("742 Evergreen Terrace");
  });

  it("returns success:false when Resend throws", async () => {
    mockResendSend.mockRejectedValue(new Error("Resend rate limit"));

    const result = await sendEmailConfirmation(fullRequest);

    expect(result.success).toBe(false);
    expect(result.message).toContain("Could not send email");
  });

  it("does not throw when Resend fails", async () => {
    mockResendSend.mockRejectedValue(new Error("Auth error"));

    await expect(sendEmailConfirmation(fullRequest)).resolves.toMatchObject({
      success: false,
    });
  });
});

// ---------------------------------------------------------------------------
// sendConfirmation (combined) tests
// ---------------------------------------------------------------------------

describe("sendConfirmation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sends both SMS and email when email is provided", async () => {
    mockMessagesCreate.mockResolvedValue({ sid: "SM-combined" });
    mockResendSend.mockResolvedValue({ id: "email-combined" });

    const result = await sendConfirmation(fullRequest);

    expect(result.sms).toBe(true);
    expect(result.email).toBe(true);
  });

  it("returns a message mentioning both channels when both succeed", async () => {
    mockMessagesCreate.mockResolvedValue({ sid: "SM-both" });
    mockResendSend.mockResolvedValue({ id: "email-both" });

    const result = await sendConfirmation(fullRequest);

    expect(result.message).toContain("SMS");
    expect(result.message).toContain("email");
  });

  it("only sends SMS when no email address is provided", async () => {
    mockMessagesCreate.mockResolvedValue({ sid: "SM-smsonly" });

    const result = await sendConfirmation(baseRequest);

    expect(result.sms).toBe(true);
    expect(result.email).toBe(false);
    expect(mockResendSend).not.toHaveBeenCalled();
  });

  it("returns message mentioning only SMS when email not provided", async () => {
    mockMessagesCreate.mockResolvedValue({ sid: "SM-smsonly2" });

    const result = await sendConfirmation(baseRequest);

    expect(result.message).toContain("SMS");
  });

  it("returns failure message when both SMS and email fail", async () => {
    mockMessagesCreate.mockRejectedValue(new Error("Twilio down"));
    mockResendSend.mockRejectedValue(new Error("Resend down"));

    const result = await sendConfirmation(fullRequest);

    expect(result.sms).toBe(false);
    expect(result.email).toBe(false);
    expect(result.message).toContain("unable to send");
  });

  it("returns partial success message when only email succeeds", async () => {
    mockMessagesCreate.mockRejectedValue(new Error("Twilio error"));
    mockResendSend.mockResolvedValue({ id: "email-partial" });

    const result = await sendConfirmation(fullRequest);

    expect(result.sms).toBe(false);
    expect(result.email).toBe(true);
    expect(result.message).toContain("email");
  });

  it("sends both confirmations in parallel", async () => {
    let smsStarted = false;
    let emailStarted = false;

    mockMessagesCreate.mockImplementation(
      () =>
        new Promise((resolve) => {
          smsStarted = true;
          setTimeout(() => resolve({ sid: "SM-par" }), 10);
        }),
    );
    mockResendSend.mockImplementation(
      () =>
        new Promise((resolve) => {
          emailStarted = true;
          setTimeout(() => resolve({ id: "email-par" }), 10);
        }),
    );

    const resultPromise = sendConfirmation(fullRequest);
    // Both should have started before either resolves
    expect(smsStarted).toBe(true);
    expect(emailStarted).toBe(true);
    await resultPromise;
  });
});
