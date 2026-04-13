// ---------------------------------------------------------------------------
// Vapi Webhook Handlers
// ---------------------------------------------------------------------------
// Processes incoming webhook events from Vapi:
//   - assistant-request: return assistant config dynamically
//   - function-call: execute tool calls requested by the LLM
//   - end-of-call-report: handle post-call actions
//   - status-update: log call status changes
// ---------------------------------------------------------------------------

import type { Request, Response } from "express";
import { buildAssistantConfig } from "../config/vapi-assistant.js";
import { checkAvailability, bookAppointment } from "../tools/calendar.js";
import { lookupFaq } from "../tools/knowledge-base.js";
import { logLead } from "../tools/crm.js";
import { sendConfirmation } from "../tools/notifications.js";
import { triggerPostCallWorkflow } from "../services/n8n.js";
import { logger } from "../utils/logger.js";
import type {
  FunctionCallPayload,
  EndOfCallReport,
  ToolName,
  NotificationRequest,
} from "../utils/types.js";

// Business metadata used across handlers
const BUSINESS = {
  name: "Bright Smile Dental",
  address: "742 Evergreen Terrace, Suite 200, Springfield, IL 62701",
};

/**
 * Main webhook handler.
 * Vapi sends all webhook events to a single endpoint.
 */
export async function handleVapiWebhook(req: Request, res: Response): Promise<void> {
  const { message } = req.body;

  if (!message || !message.type) {
    res.status(400).json({ error: "Invalid webhook payload: missing message.type" });
    return;
  }

  const eventType = message.type as string;
  logger.info(`Received Vapi webhook: ${eventType}`);

  try {
    switch (eventType) {
      case "assistant-request":
        handleAssistantRequest(res);
        break;

      case "function-call":
        await handleFunctionCall(message, res);
        break;

      case "end-of-call-report":
        await handleEndOfCallReport(message, res);
        break;

      case "status-update":
        handleStatusUpdate(message, res);
        break;

      default:
        logger.info(`Unhandled webhook event type: ${eventType}`);
        res.status(200).json({ received: true });
    }
  } catch (error) {
    logger.error("Webhook handler error", {
      eventType,
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({ error: "Internal server error" });
  }
}

// ---------------------------------------------------------------------------
// Handler: assistant-request
// ---------------------------------------------------------------------------

/**
 * Return the assistant config when Vapi asks for it.
 * This allows dynamic assistant configuration per phone number.
 */
function handleAssistantRequest(res: Response): void {
  const provider = process.env.ANTHROPIC_API_KEY ? "anthropic" : "openai";
  const config = buildAssistantConfig(provider as "anthropic" | "openai");

  logger.info(`Returning assistant config (LLM provider: ${provider})`);
  res.status(200).json({ assistant: config });
}

// ---------------------------------------------------------------------------
// Handler: function-call
// ---------------------------------------------------------------------------

/**
 * Execute a tool call requested by the LLM during the conversation.
 * The result is sent back to Vapi, which feeds it back to the LLM.
 */
async function handleFunctionCall(
  message: Record<string, unknown>,
  res: Response,
): Promise<void> {
  const functionCall = message.functionCall as FunctionCallPayload | undefined;

  if (!functionCall) {
    res.status(400).json({ error: "Missing functionCall in message" });
    return;
  }

  const { name, parameters } = functionCall;
  logger.info(`Function call: ${name}`, { parameters });

  const result = await executeTool(name, parameters);

  // Vapi expects the result in this format
  res.status(200).json({ result });
}

/**
 * Route a tool call to the appropriate handler and return a serialisable result.
 */
async function executeTool(
  name: ToolName,
  params: Record<string, unknown>,
): Promise<string> {
  switch (name) {
    case "check_availability": {
      const result = await checkAvailability(
        params.date as string | undefined,
        params.service as string | undefined,
      );
      return result.message;
    }

    case "book_appointment": {
      const confirmation = await bookAppointment(
        params.dateTime as string,
        params.patientName as string,
        params.service as string,
        params.phone as string,
        params.email as string | undefined,
      );
      return `Appointment confirmed! ${confirmation.dateTime} for ${confirmation.service}. Confirmation ID: ${confirmation.eventId}`;
    }

    case "lookup_faq": {
      const result = await lookupFaq(params.question as string);
      return result.answer;
    }

    case "log_lead": {
      const result = await logLead({
        phone: params.phone as string,
        firstName: params.firstName as string,
        lastName: params.lastName as string | undefined,
        email: params.email as string | undefined,
        serviceInterest: params.serviceInterest as string | undefined,
        callNotes: params.callNotes as string | undefined,
      });
      return result.message;
    }

    case "send_confirmation": {
      const notificationReq: NotificationRequest = {
        phone: params.phone as string,
        email: params.email as string | undefined,
        patientName: params.patientName as string,
        appointmentTime: params.appointmentTime as string | undefined,
        service: params.service as string | undefined,
        businessName: BUSINESS.name,
        businessAddress: BUSINESS.address,
      };
      const result = await sendConfirmation(notificationReq);
      return result.message;
    }

    default: {
      logger.warn(`Unknown tool called: ${name}`);
      return "I'm sorry, I wasn't able to complete that action. Let me help you another way.";
    }
  }
}

// ---------------------------------------------------------------------------
// Handler: end-of-call-report
// ---------------------------------------------------------------------------

/**
 * Process the end-of-call report from Vapi.
 * Triggers post-call workflows (n8n, logging, etc.).
 */
async function handleEndOfCallReport(
  message: Record<string, unknown>,
  res: Response,
): Promise<void> {
  const report: EndOfCallReport = {
    summary: (message.summary as string) ?? "No summary available",
    transcript: (message.transcript as string) ?? "",
    durationSeconds: (message.durationSeconds as number) ?? 0,
    callerPhone: message.customer
      ? ((message.customer as Record<string, unknown>).number as string)
      : undefined,
    costUsd: message.cost as number | undefined,
  };

  logger.info("Call ended", {
    duration: `${report.durationSeconds}s`,
    callerPhone: report.callerPhone ?? "unknown",
    cost: report.costUsd ? `$${report.costUsd.toFixed(4)}` : "n/a",
  });

  // Trigger n8n workflow in the background (non-blocking)
  triggerPostCallWorkflow(report).catch((err) => {
    logger.error("Background n8n trigger failed", {
      error: err instanceof Error ? err.message : String(err),
    });
  });

  res.status(200).json({ received: true });
}

// ---------------------------------------------------------------------------
// Handler: status-update
// ---------------------------------------------------------------------------

/**
 * Log call status changes (ringing, in-progress, ended, etc.).
 */
function handleStatusUpdate(
  message: Record<string, unknown>,
  res: Response,
): void {
  const status = message.status as string | undefined;
  logger.info(`Call status update: ${status ?? "unknown"}`);
  res.status(200).json({ received: true });
}
