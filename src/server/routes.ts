// ---------------------------------------------------------------------------
// Express Route Definitions
// ---------------------------------------------------------------------------

import { Router, type Router as RouterType } from "express";
import { handleVapiWebhook } from "./webhooks.js";
import { logger } from "../utils/logger.js";

export const router: RouterType = Router();

// Health check endpoint for uptime monitoring and deployment probes
router.get("/health", (_req, res) => {
  res.status(200).json({
    status: "ok",
    service: "ai-voice-agent",
    timestamp: new Date().toISOString(),
  });
});

// Main Vapi webhook endpoint
// All Vapi events (assistant-request, function-call, end-of-call-report,
// status-update) are sent to this single POST endpoint.
router.post("/vapi/webhook", async (req, res) => {
  await handleVapiWebhook(req, res);
});

// Catch-all for unknown routes
router.use((_req, res) => {
  logger.warn(`404 - Route not found: ${_req.method} ${_req.path}`);
  res.status(404).json({ error: "Not found" });
});
