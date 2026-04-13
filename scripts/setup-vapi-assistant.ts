// ---------------------------------------------------------------------------
// Setup Script: Create Vapi Assistant
// ---------------------------------------------------------------------------
// Run once to create the AI receptionist assistant in your Vapi account.
// Usage: npm run setup
// ---------------------------------------------------------------------------

import "dotenv/config";
import { createAssistant } from "../src/services/vapi.js";

async function main() {
  console.log("Creating Vapi assistant for Bright Smile Dental...\n");

  // Choose LLM provider based on available API keys
  const provider = process.env.ANTHROPIC_API_KEY ? "anthropic" : "openai";
  console.log(`LLM provider: ${provider}`);

  try {
    const assistantId = await createAssistant(provider as "anthropic" | "openai");

    console.log("\n--- Setup Complete ---");
    console.log(`Assistant ID: ${assistantId}`);
    console.log("\nNext steps:");
    console.log("1. Go to https://dashboard.vapi.ai");
    console.log("2. Navigate to Phone Numbers");
    console.log("3. Assign this assistant to your Twilio phone number");
    console.log(`4. Set the webhook URL to: https://your-server.com/vapi/webhook`);
    console.log("5. Seed the knowledge base: npm run seed");
    console.log("6. Start the server: npm run dev");
  } catch (error) {
    console.error(
      "Failed to create assistant:",
      error instanceof Error ? error.message : error,
    );
    process.exit(1);
  }
}

main();
