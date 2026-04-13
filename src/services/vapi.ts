// ---------------------------------------------------------------------------
// Vapi Service
// ---------------------------------------------------------------------------
// Wraps the Vapi server SDK for creating assistants and triggering calls.
// ---------------------------------------------------------------------------

import { VapiClient } from "@vapi-ai/server-sdk";
import { env } from "../config/env.js";
import { buildAssistantConfig } from "../config/vapi-assistant.js";
import { logger } from "../utils/logger.js";

let client: VapiClient | null = null;

/** Get (or create) the singleton Vapi client. */
export function getVapiClient(): VapiClient {
  if (!client) {
    client = new VapiClient({ token: env.VAPI_API_KEY });
    logger.info("Vapi client initialized");
  }
  return client;
}

/**
 * Create a new Vapi assistant with the Bright Smile Dental config.
 * Returns the created assistant's ID.
 */
export async function createAssistant(
  provider: "anthropic" | "openai" = "anthropic",
): Promise<string> {
  const vapi = getVapiClient();
  const config = buildAssistantConfig(provider);

  const assistant = await vapi.assistants.create({
    name: config.name,
    firstMessage: config.firstMessage,
    model: {
      provider: config.model.provider as "anthropic" | "openai",
      model: config.model.model as any,
      messages: [{ role: "system", content: config.model.systemPrompt }],
      temperature: config.model.temperature,
      tools: config.model.tools as any,
    },
    voice: {
      provider: config.voice.provider as "11labs",
      voiceId: config.voice.voiceId,
    },
    transcriber: {
      provider: config.transcriber.provider as "deepgram",
      model: config.transcriber.model as any,
      language: config.transcriber.language as any,
    },
    silenceTimeoutSeconds: config.silenceTimeoutSeconds,
    maxDurationSeconds: config.maxDurationSeconds,
    endCallMessage: config.endCallMessage,
  });

  logger.info(`Vapi assistant created with ID: ${assistant.id}`);
  return assistant.id;
}

/**
 * Trigger an outbound test call to the given phone number.
 * Requires VAPI_PHONE_NUMBER_ID to be set.
 */
export async function triggerTestCall(
  toPhoneNumber: string,
  assistantId: string,
): Promise<string> {
  const vapi = getVapiClient();
  const phoneNumberId = env.VAPI_PHONE_NUMBER_ID;

  if (!phoneNumberId) {
    throw new Error("VAPI_PHONE_NUMBER_ID is not set. Cannot trigger outbound calls.");
  }

  const call = await vapi.calls.create({
    phoneNumberId,
    assistantId,
    customer: {
      number: toPhoneNumber,
    },
  });

  logger.info(`Test call initiated: ${call.id} -> ${toPhoneNumber}`);
  return call.id;
}
