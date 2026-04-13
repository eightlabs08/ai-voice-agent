// ---------------------------------------------------------------------------
// Tests: src/services/vapi.ts
// ---------------------------------------------------------------------------

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("../config/env.js", () => ({
  env: {
    VAPI_API_KEY: "vapi-test-key",
    VAPI_PHONE_NUMBER_ID: "phone-id-123",
    ANTHROPIC_API_KEY: "sk-ant-test",
    OPENAI_API_KEY: "sk-openai-test",
    PINECONE_INDEX_NAME: "ai-voice-agent",
  },
}));

vi.mock("../utils/logger.js", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

vi.mock("../config/vapi-assistant.js", () => ({
  buildAssistantConfig: vi.fn(() => ({
    name: "Bright Smile Dental Receptionist",
    firstMessage: "Hello! This is Sarah.",
    model: {
      provider: "anthropic",
      model: "claude-sonnet-4-20250514",
      systemPrompt: "You are Sarah...",
      temperature: 0.7,
      tools: [],
    },
    voice: { provider: "11labs", voiceId: "voice-id-123" },
    transcriber: { provider: "deepgram", model: "nova-2", language: "en-US" },
    silenceTimeoutSeconds: 30,
    maxDurationSeconds: 600,
    endCallMessage: "Thank you for calling!",
  })),
}));

// Mock Vapi client
const mockAssistantsCreate = vi.fn();
const mockCallsCreate = vi.fn();

vi.mock("@vapi-ai/server-sdk", () => {
  const VapiClient = vi.fn(function (this: unknown) {
    Object.assign(this as object, {
      assistants: { create: mockAssistantsCreate },
      calls: { create: mockCallsCreate },
    });
  });
  return { VapiClient };
});

// Import after mocks
const { getVapiClient, createAssistant, triggerTestCall } = await import("./vapi.js");

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("getVapiClient", () => {
  it("returns a VapiClient instance", () => {
    const client = getVapiClient();
    expect(client).toBeDefined();
  });

  it("returns the same client instance on repeated calls (singleton)", () => {
    const client1 = getVapiClient();
    const client2 = getVapiClient();
    expect(client1).toBe(client2);
  });
});

describe("createAssistant", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls vapi.assistants.create and returns the assistant ID", async () => {
    mockAssistantsCreate.mockResolvedValue({ id: "asst-abc123" });

    const id = await createAssistant("anthropic");

    expect(mockAssistantsCreate).toHaveBeenCalledOnce();
    expect(id).toBe("asst-abc123");
  });

  it("passes the assistant name from the config", async () => {
    mockAssistantsCreate.mockResolvedValue({ id: "asst-001" });

    await createAssistant("anthropic");

    const callArgs = mockAssistantsCreate.mock.calls[0][0];
    expect(callArgs.name).toBe("Bright Smile Dental Receptionist");
  });

  it("passes firstMessage from the config", async () => {
    mockAssistantsCreate.mockResolvedValue({ id: "asst-002" });

    await createAssistant("anthropic");

    const callArgs = mockAssistantsCreate.mock.calls[0][0];
    expect(callArgs.firstMessage).toBe("Hello! This is Sarah.");
  });

  it("passes model settings from the config", async () => {
    mockAssistantsCreate.mockResolvedValue({ id: "asst-003" });

    await createAssistant("anthropic");

    const callArgs = mockAssistantsCreate.mock.calls[0][0];
    expect(callArgs.model.provider).toBe("anthropic");
    expect(callArgs.model.model).toBe("claude-sonnet-4-20250514");
    expect(callArgs.model.temperature).toBe(0.7);
  });

  it("wraps systemPrompt in model.messages as a system role message", async () => {
    mockAssistantsCreate.mockResolvedValue({ id: "asst-004" });

    await createAssistant("anthropic");

    const callArgs = mockAssistantsCreate.mock.calls[0][0];
    expect(callArgs.model.messages).toEqual([
      { role: "system", content: "You are Sarah..." },
    ]);
  });

  it("passes voice and transcriber settings", async () => {
    mockAssistantsCreate.mockResolvedValue({ id: "asst-005" });

    await createAssistant("anthropic");

    const callArgs = mockAssistantsCreate.mock.calls[0][0];
    expect(callArgs.voice.provider).toBe("11labs");
    expect(callArgs.transcriber.provider).toBe("deepgram");
  });

  it("passes silenceTimeoutSeconds and maxDurationSeconds", async () => {
    mockAssistantsCreate.mockResolvedValue({ id: "asst-006" });

    await createAssistant("anthropic");

    const callArgs = mockAssistantsCreate.mock.calls[0][0];
    expect(callArgs.silenceTimeoutSeconds).toBe(30);
    expect(callArgs.maxDurationSeconds).toBe(600);
  });

  it("passes endCallMessage from the config", async () => {
    mockAssistantsCreate.mockResolvedValue({ id: "asst-007" });

    await createAssistant("anthropic");

    const callArgs = mockAssistantsCreate.mock.calls[0][0];
    expect(callArgs.endCallMessage).toBe("Thank you for calling!");
  });

  it("defaults to anthropic provider when not specified", async () => {
    const { buildAssistantConfig } = await import("../config/vapi-assistant.js");
    mockAssistantsCreate.mockResolvedValue({ id: "asst-default" });

    await createAssistant();

    expect(buildAssistantConfig).toHaveBeenCalledWith("anthropic");
  });

  it("propagates errors from vapi.assistants.create", async () => {
    mockAssistantsCreate.mockRejectedValue(new Error("Vapi API auth error"));

    await expect(createAssistant("anthropic")).rejects.toThrow("Vapi API auth error");
  });
});

describe("triggerTestCall", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates an outbound call and returns the call ID", async () => {
    mockCallsCreate.mockResolvedValue({ id: "call-xyz789" });

    const callId = await triggerTestCall("+15551234567", "asst-abc123");

    expect(callId).toBe("call-xyz789");
  });

  it("passes the phone number ID, assistant ID, and to phone number", async () => {
    mockCallsCreate.mockResolvedValue({ id: "call-001" });

    await triggerTestCall("+15559876543", "asst-test");

    const callArgs = mockCallsCreate.mock.calls[0][0];
    expect(callArgs.phoneNumberId).toBe("phone-id-123");
    expect(callArgs.assistantId).toBe("asst-test");
    expect(callArgs.customer.number).toBe("+15559876543");
  });

  it("throws when VAPI_PHONE_NUMBER_ID is not configured", async () => {
    // Temporarily remove phone number ID from env
    const { env } = await import("../config/env.js");
    const originalPhoneId = (env as Record<string, string | undefined>).VAPI_PHONE_NUMBER_ID;
    (env as Record<string, string | undefined>).VAPI_PHONE_NUMBER_ID = undefined;

    await expect(triggerTestCall("+15550000000", "asst-123")).rejects.toThrow(
      "VAPI_PHONE_NUMBER_ID",
    );

    (env as Record<string, string | undefined>).VAPI_PHONE_NUMBER_ID = originalPhoneId;
  });

  it("propagates errors from vapi.calls.create", async () => {
    mockCallsCreate.mockRejectedValue(new Error("Call creation failed"));

    await expect(triggerTestCall("+15550000000", "asst-123")).rejects.toThrow(
      "Call creation failed",
    );
  });
});
