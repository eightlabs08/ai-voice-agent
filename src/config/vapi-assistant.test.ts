// ---------------------------------------------------------------------------
// Tests: src/config/vapi-assistant.ts
// ---------------------------------------------------------------------------
// The module imports `env` at load time, which triggers process.exit if env
// vars are missing.  We stub that out before importing the module.
// ---------------------------------------------------------------------------

import { describe, it, expect, vi, beforeAll } from "vitest";

// Stub the env module so the module-level loadEnv() call does not exit.
vi.mock("../config/env.js", () => ({
  env: {
    ANTHROPIC_API_KEY: "sk-ant-test",
    OPENAI_API_KEY: "sk-openai-test",
    PINECONE_INDEX_NAME: "ai-voice-agent",
    PINECONE_API_KEY: "pinecone-test",
    GOOGLE_CALENDAR_ID: "test-calendar",
    GOOGLE_SERVICE_ACCOUNT_KEY: "base64key==",
    HUBSPOT_API_KEY: "hs-test",
    RESEND_API_KEY: "re_test",
    RESEND_FROM_EMAIL: "test@example.com",
    TWILIO_ACCOUNT_SID: "ACtest",
    TWILIO_AUTH_TOKEN: "auth-test",
    TWILIO_PHONE_NUMBER: "+15550000000",
    VAPI_API_KEY: "vapi-test",
    PORT: "3001",
  },
}));

// Stub the logger to suppress noise in test output.
vi.mock("../utils/logger.js", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

const { buildAssistantConfig, SYSTEM_PROMPT, TOOL_DEFINITIONS } = await import(
  "./vapi-assistant.js"
);

describe("buildAssistantConfig", () => {
  // -------------------------------------------------------------------------
  // Shape invariants (apply to both providers)
  // -------------------------------------------------------------------------

  it("returns an object with the expected top-level keys", () => {
    const config = buildAssistantConfig("anthropic");
    expect(config).toHaveProperty("name");
    expect(config).toHaveProperty("firstMessage");
    expect(config).toHaveProperty("model");
    expect(config).toHaveProperty("voice");
    expect(config).toHaveProperty("transcriber");
    expect(config).toHaveProperty("silenceTimeoutSeconds");
    expect(config).toHaveProperty("maxDurationSeconds");
    expect(config).toHaveProperty("endCallMessage");
  });

  it("sets the assistant name to Bright Smile Dental Receptionist", () => {
    const config = buildAssistantConfig("anthropic");
    expect(config.name).toBe("Bright Smile Dental Receptionist");
  });

  it("includes a friendly first message from Sarah", () => {
    const config = buildAssistantConfig("anthropic");
    expect(config.firstMessage).toContain("Sarah");
    expect(config.firstMessage).toContain("Bright Smile Dental");
  });

  it("sets silence timeout to 30 seconds", () => {
    const config = buildAssistantConfig("anthropic");
    expect(config.silenceTimeoutSeconds).toBe(30);
  });

  it("sets max call duration to 600 seconds (10 minutes)", () => {
    const config = buildAssistantConfig("anthropic");
    expect(config.maxDurationSeconds).toBe(600);
  });

  it("includes an end call message", () => {
    const config = buildAssistantConfig("anthropic");
    expect(config.endCallMessage).toBeTruthy();
    expect(config.endCallMessage).toContain("Bright Smile Dental");
  });

  // -------------------------------------------------------------------------
  // Voice config
  // -------------------------------------------------------------------------

  it("uses ElevenLabs as the voice provider", () => {
    const config = buildAssistantConfig("anthropic");
    expect(config.voice.provider).toBe("11labs");
  });

  it("sets voice stability and similarity boost", () => {
    const config = buildAssistantConfig("anthropic");
    expect(typeof config.voice.stability).toBe("number");
    expect(typeof config.voice.similarityBoost).toBe("number");
  });

  // -------------------------------------------------------------------------
  // Transcriber config
  // -------------------------------------------------------------------------

  it("uses Deepgram nova-2 as the transcriber", () => {
    const config = buildAssistantConfig("anthropic");
    expect(config.transcriber.provider).toBe("deepgram");
    expect(config.transcriber.model).toBe("nova-2");
    expect(config.transcriber.language).toBe("en-US");
  });

  // -------------------------------------------------------------------------
  // Anthropic provider
  // -------------------------------------------------------------------------

  it("sets provider to anthropic and uses claude-sonnet model", () => {
    const config = buildAssistantConfig("anthropic");
    expect(config.model.provider).toBe("anthropic");
    expect(config.model.model).toContain("claude");
  });

  it("embeds the system prompt in the model config for anthropic", () => {
    const config = buildAssistantConfig("anthropic");
    expect(config.model.systemPrompt).toBe(SYSTEM_PROMPT);
  });

  it("includes all tool definitions for anthropic", () => {
    const config = buildAssistantConfig("anthropic");
    expect(config.model.tools).toEqual(TOOL_DEFINITIONS);
  });

  it("sets a temperature for anthropic", () => {
    const config = buildAssistantConfig("anthropic");
    expect(typeof config.model.temperature).toBe("number");
    expect(config.model.temperature).toBeGreaterThan(0);
    expect(config.model.temperature).toBeLessThanOrEqual(1);
  });

  // -------------------------------------------------------------------------
  // OpenAI provider
  // -------------------------------------------------------------------------

  it("sets provider to openai and uses gpt-4o model", () => {
    const config = buildAssistantConfig("openai");
    expect(config.model.provider).toBe("openai");
    expect(config.model.model).toBe("gpt-4o");
  });

  it("embeds the system prompt in the model config for openai", () => {
    const config = buildAssistantConfig("openai");
    expect(config.model.systemPrompt).toBe(SYSTEM_PROMPT);
  });

  it("includes all tool definitions for openai", () => {
    const config = buildAssistantConfig("openai");
    expect(config.model.tools).toEqual(TOOL_DEFINITIONS);
  });

  // -------------------------------------------------------------------------
  // Default provider
  // -------------------------------------------------------------------------

  it("defaults to anthropic when no provider is specified", () => {
    const config = buildAssistantConfig();
    expect(config.model.provider).toBe("anthropic");
  });
});

describe("SYSTEM_PROMPT", () => {
  it("mentions the business name", () => {
    expect(SYSTEM_PROMPT).toContain("Bright Smile Dental");
  });

  it("mentions the AI receptionist name Sarah", () => {
    expect(SYSTEM_PROMPT).toContain("Sarah");
  });

  it("instructs to never diagnose dental conditions", () => {
    expect(SYSTEM_PROMPT).toContain("NEVER diagnose");
  });

  it("instructs to never quote exact prices", () => {
    expect(SYSTEM_PROMPT).toContain("NEVER quote exact prices");
  });

  it("includes tool usage instructions", () => {
    expect(SYSTEM_PROMPT).toContain("lookup_faq");
    expect(SYSTEM_PROMPT).toContain("check_availability");
    expect(SYSTEM_PROMPT).toContain("book_appointment");
  });

  it("includes business hours information", () => {
    expect(SYSTEM_PROMPT).toContain("Monday-Friday");
  });

  it("includes emergency instructions", () => {
    expect(SYSTEM_PROMPT).toContain("emergency");
  });
});

describe("TOOL_DEFINITIONS", () => {
  const toolNames = TOOL_DEFINITIONS.map((t) => t.function.name);

  it("defines exactly 5 tools", () => {
    expect(TOOL_DEFINITIONS).toHaveLength(5);
  });

  it("includes check_availability tool", () => {
    expect(toolNames).toContain("check_availability");
  });

  it("includes book_appointment tool", () => {
    expect(toolNames).toContain("book_appointment");
  });

  it("includes lookup_faq tool", () => {
    expect(toolNames).toContain("lookup_faq");
  });

  it("includes log_lead tool", () => {
    expect(toolNames).toContain("log_lead");
  });

  it("includes send_confirmation tool", () => {
    expect(toolNames).toContain("send_confirmation");
  });

  it("every tool has type function", () => {
    for (const tool of TOOL_DEFINITIONS) {
      expect(tool.type).toBe("function");
    }
  });

  it("every tool has a non-empty description", () => {
    for (const tool of TOOL_DEFINITIONS) {
      expect(tool.function.description).toBeTruthy();
      expect(tool.function.description.length).toBeGreaterThan(10);
    }
  });

  it("book_appointment requires dateTime, patientName, service, phone", () => {
    const bookTool = TOOL_DEFINITIONS.find((t) => t.function.name === "book_appointment");
    expect(bookTool).toBeDefined();
    expect(bookTool!.function.parameters.required).toContain("dateTime");
    expect(bookTool!.function.parameters.required).toContain("patientName");
    expect(bookTool!.function.parameters.required).toContain("service");
    expect(bookTool!.function.parameters.required).toContain("phone");
  });

  it("check_availability has no required parameters", () => {
    const checkTool = TOOL_DEFINITIONS.find((t) => t.function.name === "check_availability");
    expect(checkTool).toBeDefined();
    expect(checkTool!.function.parameters.required).toEqual([]);
  });

  it("log_lead requires phone and firstName", () => {
    const logLeadTool = TOOL_DEFINITIONS.find((t) => t.function.name === "log_lead");
    expect(logLeadTool).toBeDefined();
    expect(logLeadTool!.function.parameters.required).toContain("phone");
    expect(logLeadTool!.function.parameters.required).toContain("firstName");
  });

  it("lookup_faq requires question", () => {
    const faqTool = TOOL_DEFINITIONS.find((t) => t.function.name === "lookup_faq");
    expect(faqTool).toBeDefined();
    expect(faqTool!.function.parameters.required).toContain("question");
  });
});
