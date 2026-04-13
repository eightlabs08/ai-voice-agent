// ---------------------------------------------------------------------------
// Test Script: Trigger an Outbound Test Call
// ---------------------------------------------------------------------------
// Initiates a test call via Vapi to verify the full pipeline is working.
// Usage: npm run test-call
//
// Prerequisites:
//   - VAPI_PHONE_NUMBER_ID must be set (a Twilio number connected to Vapi)
//   - An assistant must be created first (npm run setup)
//   - The webhook server must be running (npm run dev)
// ---------------------------------------------------------------------------

import "dotenv/config";
import { createAssistant, triggerTestCall } from "../src/services/vapi.js";

const TEST_PHONE_NUMBER = process.argv[2];

async function main() {
  if (!TEST_PHONE_NUMBER) {
    console.log("Usage: npm run test-call -- +15551234567");
    console.log("\nProvide the phone number to call in E.164 format.");
    process.exit(1);
  }

  console.log("Setting up test call...\n");

  // Create a fresh assistant for the test
  const provider = process.env.ANTHROPIC_API_KEY ? "anthropic" : "openai";
  console.log(`Creating assistant (LLM: ${provider})...`);
  const assistantId = await createAssistant(provider as "anthropic" | "openai");
  console.log(`Assistant ID: ${assistantId}`);

  // Trigger the call
  console.log(`\nCalling ${TEST_PHONE_NUMBER}...`);
  const callId = await triggerTestCall(TEST_PHONE_NUMBER, assistantId);

  console.log("\n--- Test Call Initiated ---");
  console.log(`Call ID: ${callId}`);
  console.log(`To: ${TEST_PHONE_NUMBER}`);
  console.log("\nThe AI receptionist (Sarah) will call the number above.");
  console.log("Watch your server logs for webhook events.");
}

main().catch((error) => {
  console.error("Test call failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
