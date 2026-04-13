import { z } from "zod";
import { logger } from "../utils/logger.js";

// ---------------------------------------------------------------------------
// Environment variable schema
// ---------------------------------------------------------------------------
// Every variable consumed by the application is validated here at startup.
// Optional variables are marked with .optional() and given defaults where
// sensible.  Required variables will cause a clear error if missing.
// ---------------------------------------------------------------------------

const envSchema = z.object({
  // --- Always required (core + embeddings) ---
  OPENAI_API_KEY: z.string().min(1, "OPENAI_API_KEY is required (used for embeddings)"),
  PINECONE_API_KEY: z.string().min(1, "PINECONE_API_KEY is required"),
  PINECONE_INDEX_NAME: z.string().default("ai-voice-agent"),

  // --- Required only when running the full server ---
  VAPI_API_KEY: z.string().min(1).optional(),
  VAPI_PHONE_NUMBER_ID: z.string().optional(),
  TWILIO_ACCOUNT_SID: z.string().min(1).optional(),
  TWILIO_AUTH_TOKEN: z.string().min(1).optional(),
  TWILIO_PHONE_NUMBER: z.string().min(1).optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  ELEVENLABS_API_KEY: z.string().optional(),
  GOOGLE_CALENDAR_ID: z.string().min(1).optional(),
  GOOGLE_SERVICE_ACCOUNT_KEY: z.string().min(1).optional(),
  HUBSPOT_API_KEY: z.string().min(1).optional(),
  RESEND_API_KEY: z.string().min(1).optional(),
  RESEND_FROM_EMAIL: z.string().min(1).optional(),
  N8N_WEBHOOK_URL: z.string().url().optional().or(z.literal("")),

  // Server
  PORT: z.string().default("3001"),
});

export type Env = z.infer<typeof envSchema>;

// ---------------------------------------------------------------------------
// Validate and export
// ---------------------------------------------------------------------------

function loadEnv(): Env {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");

    logger.error(`Environment validation failed:\n${issues}`);
    process.exit(1);
  }

  logger.info("Environment variables validated successfully");
  return result.data;
}

export const env = loadEnv();

// ---------------------------------------------------------------------------
// Runtime guard — call this when starting the full server to ensure all
// service keys are present. Scripts (seed, query) skip this automatically.
// ---------------------------------------------------------------------------

const serverRequiredKeys = [
  "VAPI_API_KEY",
  "TWILIO_ACCOUNT_SID",
  "TWILIO_AUTH_TOKEN",
  "TWILIO_PHONE_NUMBER",
  "GOOGLE_CALENDAR_ID",
  "GOOGLE_SERVICE_ACCOUNT_KEY",
  "HUBSPOT_API_KEY",
  "RESEND_API_KEY",
  "RESEND_FROM_EMAIL",
] as const;

export function requireServerEnv(): void {
  const missing = serverRequiredKeys.filter((key) => !env[key]);

  if (missing.length > 0) {
    logger.error(
      `Missing environment variables required for the server:\n${missing.map((k) => `  - ${k}`).join("\n")}`,
    );
    process.exit(1);
  }
}
