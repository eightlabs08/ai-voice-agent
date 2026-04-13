// ---------------------------------------------------------------------------
// AI Voice Agent - Express Server Entry Point
// ---------------------------------------------------------------------------
// Starts the webhook server that receives events from Vapi and orchestrates
// tool calls (Google Calendar, Pinecone RAG, HubSpot CRM, notifications).
// ---------------------------------------------------------------------------

import "dotenv/config";
import express from "express";
import { env, requireServerEnv } from "./config/env.js";
import { router } from "./server/routes.js";
import { logger } from "./utils/logger.js";

// Validate all service keys are present before starting the server
requireServerEnv();

const app = express();

// Parse JSON bodies from Vapi webhooks
app.use(express.json());

// Request logging middleware
app.use((req, _res, next) => {
  if (req.path !== "/health") {
    logger.info(`${req.method} ${req.path}`);
  }
  next();
});

// Mount routes
app.use(router);

// Start server
const port = parseInt(env.PORT, 10);
app.listen(port, () => {
  logger.info(`AI Voice Agent server running on port ${port}`);
  logger.info(`Health check: http://localhost:${port}/health`);
  logger.info(`Vapi webhook: http://localhost:${port}/vapi/webhook`);
});
