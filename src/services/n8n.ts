// ---------------------------------------------------------------------------
// n8n Webhook Service
// ---------------------------------------------------------------------------
// Triggers n8n workflows via webhook for post-call automation.
// ---------------------------------------------------------------------------

import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";
import type { EndOfCallReport } from "../utils/types.js";

/**
 * Trigger the n8n post-call workflow with call details.
 *
 * The n8n workflow can perform additional automations like:
 * - Updating a Google Sheet with call logs
 * - Sending a Slack notification to the office manager
 * - Creating a follow-up task in a project management tool
 *
 * This is a fire-and-forget call. If n8n is not configured, it is a no-op.
 */
export async function triggerPostCallWorkflow(report: EndOfCallReport): Promise<void> {
  const webhookUrl = env.N8N_WEBHOOK_URL;

  if (!webhookUrl) {
    logger.info("n8n webhook URL not configured, skipping post-call workflow trigger");
    return;
  }

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event: "call_ended",
        timestamp: new Date().toISOString(),
        summary: report.summary,
        transcript: report.transcript,
        durationSeconds: report.durationSeconds,
        callerPhone: report.callerPhone ?? "unknown",
        costUsd: report.costUsd ?? 0,
      }),
    });

    if (!response.ok) {
      logger.error(`n8n webhook returned ${response.status}: ${await response.text()}`);
      return;
    }

    logger.info("n8n post-call workflow triggered successfully");
  } catch (error) {
    // Non-critical: log and continue. The call is already complete.
    logger.error("Failed to trigger n8n workflow", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
