// ---------------------------------------------------------------------------
// Notifications Tool
// ---------------------------------------------------------------------------
// Sends post-call confirmations via SMS (Twilio) and email (Resend).
// ---------------------------------------------------------------------------

import twilio from "twilio";
import { Resend } from "resend";
import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";
import type { NotificationRequest } from "../utils/types.js";

let twilioClient: twilio.Twilio | null = null;
let resendClient: Resend | null = null;

/** Get the singleton Twilio client. */
function getTwilio(): twilio.Twilio {
  if (!twilioClient) {
    twilioClient = twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN);
    logger.info("Twilio client initialized");
  }
  return twilioClient;
}

/** Get the singleton Resend client. */
function getResend(): Resend {
  if (!resendClient) {
    resendClient = new Resend(env.RESEND_API_KEY);
    logger.info("Resend client initialized");
  }
  return resendClient;
}

/**
 * Send an appointment confirmation via SMS.
 */
export async function sendSmsConfirmation(
  request: NotificationRequest,
): Promise<{ success: boolean; message: string }> {
  const client = getTwilio();

  const body = [
    `Hi ${request.patientName}!`,
    `Your appointment at ${request.businessName} has been confirmed.`,
    "",
    request.appointmentTime ? `Date/Time: ${request.appointmentTime}` : "",
    request.service ? `Service: ${request.service}` : "",
    `Location: ${request.businessAddress}`,
    "",
    "Please arrive 10 minutes early. Reply HELP for assistance or call (555) 234-5678.",
  ]
    .filter(Boolean)
    .join("\n");

  try {
    await client.messages.create({
      body,
      from: env.TWILIO_PHONE_NUMBER,
      to: request.phone,
    });

    logger.info("SMS confirmation sent", { phone: request.phone });
    return { success: true, message: "SMS confirmation sent." };
  } catch (error) {
    logger.error("Failed to send SMS confirmation", {
      error: error instanceof Error ? error.message : String(error),
      phone: request.phone,
    });
    return { success: false, message: "Could not send SMS confirmation." };
  }
}

/**
 * Send an appointment confirmation via email.
 */
export async function sendEmailConfirmation(
  request: NotificationRequest,
): Promise<{ success: boolean; message: string }> {
  if (!request.email) {
    return { success: false, message: "No email address provided." };
  }

  const resend = getResend();

  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background-color: #2563eb; color: white; padding: 24px; text-align: center;">
        <h1 style="margin: 0; font-size: 24px;">${request.businessName}</h1>
        <p style="margin: 8px 0 0; opacity: 0.9;">Appointment Confirmation</p>
      </div>

      <div style="padding: 24px; background-color: #f9fafb;">
        <p>Hi ${request.patientName},</p>
        <p>Your appointment has been confirmed! Here are the details:</p>

        <div style="background-color: white; border-radius: 8px; padding: 20px; margin: 16px 0; border: 1px solid #e5e7eb;">
          ${request.appointmentTime ? `<p><strong>Date and Time:</strong> ${request.appointmentTime}</p>` : ""}
          ${request.service ? `<p><strong>Service:</strong> ${request.service}</p>` : ""}
          <p><strong>Location:</strong> ${request.businessAddress}</p>
          <p><strong>Phone:</strong> (555) 234-5678</p>
        </div>

        <h3>What to bring:</h3>
        <ul>
          <li>Photo ID</li>
          <li>Insurance card (if applicable)</li>
          <li>List of current medications</li>
          <li>Completed patient forms (if new patient)</li>
        </ul>

        <h3>Important reminders:</h3>
        <ul>
          <li>Please arrive 10-15 minutes early</li>
          <li>If you need to cancel or reschedule, please give us at least 24 hours notice</li>
          <li>Free parking is available in the building lot</li>
        </ul>

        <p>If you have any questions, feel free to call us at (555) 234-5678.</p>
        <p>We look forward to seeing you!</p>
        <p>Best regards,<br>${request.businessName} Team</p>
      </div>

      <div style="padding: 16px; text-align: center; font-size: 12px; color: #6b7280;">
        <p>${request.businessAddress}</p>
      </div>
    </div>
  `;

  try {
    await resend.emails.send({
      from: env.RESEND_FROM_EMAIL,
      to: request.email,
      subject: `Appointment Confirmed - ${request.businessName}`,
      html: htmlContent,
    });

    logger.info("Email confirmation sent", { email: request.email });
    return { success: true, message: "Email confirmation sent." };
  } catch (error) {
    logger.error("Failed to send email confirmation", {
      error: error instanceof Error ? error.message : String(error),
      email: request.email,
    });
    return { success: false, message: "Could not send email confirmation." };
  }
}

/**
 * Send both SMS and email confirmations.
 * This is the main entry point called by the webhook handler.
 */
export async function sendConfirmation(
  request: NotificationRequest,
): Promise<{ sms: boolean; email: boolean; message: string }> {
  const [smsResult, emailResult] = await Promise.all([
    sendSmsConfirmation(request),
    request.email
      ? sendEmailConfirmation(request)
      : Promise.resolve({ success: false, message: "No email provided." }),
  ]);

  const parts: string[] = [];
  if (smsResult.success) parts.push("SMS confirmation sent");
  if (emailResult.success) parts.push("email confirmation sent");

  const message =
    parts.length > 0
      ? `Great news! I have sent you a ${parts.join(" and ")} with all the details.`
      : "I was unable to send a confirmation right now, but your appointment is booked. Our office will follow up.";

  return {
    sms: smsResult.success,
    email: emailResult.success,
    message,
  };
}
