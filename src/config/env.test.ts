// ---------------------------------------------------------------------------
// Tests: src/config/env.ts
// ---------------------------------------------------------------------------
// We test the Zod schema validation logic directly, because the module-level
// `env` export calls `loadEnv()` (which calls process.exit on failure) on
// import.  We therefore test the schema in isolation rather than importing
// `env` so we avoid triggering process.exit inside the test runner.
// ---------------------------------------------------------------------------

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { z } from "zod";

// Minimal valid environment that satisfies all REQUIRED fields.
const VALID_ENV = {
  VAPI_API_KEY: "vapi-key-123",
  TWILIO_ACCOUNT_SID: "ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  TWILIO_AUTH_TOKEN: "auth-token-123",
  TWILIO_PHONE_NUMBER: "+15551234567",
  OPENAI_API_KEY: "sk-openai-key-123",
  GOOGLE_CALENDAR_ID: "calendar@group.calendar.google.com",
  GOOGLE_SERVICE_ACCOUNT_KEY: "base64encodedkey==",
  PINECONE_API_KEY: "pinecone-key-123",
  HUBSPOT_API_KEY: "hubspot-key-123",
  RESEND_API_KEY: "re_resend-key-123",
  RESEND_FROM_EMAIL: "onboarding@resend.dev",
};

// Replicate the schema here so we can test it without triggering process.exit.
const envSchema = z.object({
  VAPI_API_KEY: z.string().min(1, "VAPI_API_KEY is required"),
  VAPI_PHONE_NUMBER_ID: z.string().optional(),
  TWILIO_ACCOUNT_SID: z.string().min(1, "TWILIO_ACCOUNT_SID is required"),
  TWILIO_AUTH_TOKEN: z.string().min(1, "TWILIO_AUTH_TOKEN is required"),
  TWILIO_PHONE_NUMBER: z.string().min(1, "TWILIO_PHONE_NUMBER is required"),
  ANTHROPIC_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().min(1, "OPENAI_API_KEY is required (used for embeddings)"),
  ELEVENLABS_API_KEY: z.string().optional(),
  GOOGLE_CALENDAR_ID: z.string().min(1, "GOOGLE_CALENDAR_ID is required"),
  GOOGLE_SERVICE_ACCOUNT_KEY: z
    .string()
    .min(1, "GOOGLE_SERVICE_ACCOUNT_KEY is required (base64)"),
  PINECONE_API_KEY: z.string().min(1, "PINECONE_API_KEY is required"),
  PINECONE_INDEX_NAME: z.string().default("ai-voice-agent"),
  HUBSPOT_API_KEY: z.string().min(1, "HUBSPOT_API_KEY is required"),
  RESEND_API_KEY: z.string().min(1, "RESEND_API_KEY is required"),
  RESEND_FROM_EMAIL: z.string().min(1, "RESEND_FROM_EMAIL is required (e.g. onboarding@resend.dev)"),
  N8N_WEBHOOK_URL: z.string().url().optional(),
  PORT: z.string().default("3001"),
});

describe("env schema validation", () => {
  // -------------------------------------------------------------------------
  // Happy path
  // -------------------------------------------------------------------------

  it("accepts a fully valid environment", () => {
    const result = envSchema.safeParse(VALID_ENV);
    expect(result.success).toBe(true);
  });

  it("applies default PINECONE_INDEX_NAME when not set", () => {
    const result = envSchema.safeParse(VALID_ENV);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.PINECONE_INDEX_NAME).toBe("ai-voice-agent");
    }
  });

  it("accepts a custom PINECONE_INDEX_NAME", () => {
    const result = envSchema.safeParse({ ...VALID_ENV, PINECONE_INDEX_NAME: "custom-index" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.PINECONE_INDEX_NAME).toBe("custom-index");
    }
  });

  it("applies default PORT of 3001 when not set", () => {
    const result = envSchema.safeParse(VALID_ENV);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.PORT).toBe("3001");
    }
  });

  it("accepts a custom PORT", () => {
    const result = envSchema.safeParse({ ...VALID_ENV, PORT: "8080" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.PORT).toBe("8080");
    }
  });

  // -------------------------------------------------------------------------
  // Optional fields
  // -------------------------------------------------------------------------

  it("accepts environment without VAPI_PHONE_NUMBER_ID", () => {
    const env = { ...VALID_ENV };
    const result = envSchema.safeParse(env);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.VAPI_PHONE_NUMBER_ID).toBeUndefined();
    }
  });

  it("accepts environment without ANTHROPIC_API_KEY", () => {
    const result = envSchema.safeParse(VALID_ENV);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.ANTHROPIC_API_KEY).toBeUndefined();
    }
  });

  it("accepts environment without ELEVENLABS_API_KEY", () => {
    const result = envSchema.safeParse(VALID_ENV);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.ELEVENLABS_API_KEY).toBeUndefined();
    }
  });

  it("accepts environment without N8N_WEBHOOK_URL", () => {
    const result = envSchema.safeParse(VALID_ENV);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.N8N_WEBHOOK_URL).toBeUndefined();
    }
  });

  it("accepts a valid N8N_WEBHOOK_URL", () => {
    const result = envSchema.safeParse({
      ...VALID_ENV,
      N8N_WEBHOOK_URL: "https://n8n.example.com/webhook/abc123",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an invalid N8N_WEBHOOK_URL", () => {
    const result = envSchema.safeParse({
      ...VALID_ENV,
      N8N_WEBHOOK_URL: "not-a-url",
    });
    expect(result.success).toBe(false);
  });

  // -------------------------------------------------------------------------
  // Required fields - each must cause a failure when missing/empty
  // -------------------------------------------------------------------------

  const requiredFields = [
    "VAPI_API_KEY",
    "TWILIO_ACCOUNT_SID",
    "TWILIO_AUTH_TOKEN",
    "TWILIO_PHONE_NUMBER",
    "OPENAI_API_KEY",
    "GOOGLE_CALENDAR_ID",
    "GOOGLE_SERVICE_ACCOUNT_KEY",
    "PINECONE_API_KEY",
    "HUBSPOT_API_KEY",
    "RESEND_API_KEY",
    "RESEND_FROM_EMAIL",
  ] as const;

  for (const field of requiredFields) {
    it(`fails when ${field} is missing`, () => {
      const env = { ...VALID_ENV } as Record<string, string>;
      delete env[field];
      const result = envSchema.safeParse(env);
      expect(result.success).toBe(false);
    });

    it(`fails when ${field} is an empty string`, () => {
      const result = envSchema.safeParse({ ...VALID_ENV, [field]: "" });
      expect(result.success).toBe(false);
    });
  }

  // -------------------------------------------------------------------------
  // RESEND_FROM_EMAIL validation
  // -------------------------------------------------------------------------

  it("rejects an empty RESEND_FROM_EMAIL", () => {
    const result = envSchema.safeParse({
      ...VALID_ENV,
      RESEND_FROM_EMAIL: "",
    });
    expect(result.success).toBe(false);
  });

  it("accepts RESEND_FROM_EMAIL with subdomain", () => {
    const result = envSchema.safeParse({
      ...VALID_ENV,
      RESEND_FROM_EMAIL: "no-reply@mail.example.com",
    });
    expect(result.success).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Multiple missing fields produce multiple error messages
  // -------------------------------------------------------------------------

  it("reports all missing fields when multiple are absent", () => {
    const result = envSchema.safeParse({
      VAPI_API_KEY: "vapi-key",
      // all others missing
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.length).toBeGreaterThan(1);
    }
  });
});
