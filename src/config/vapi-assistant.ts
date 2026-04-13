// ---------------------------------------------------------------------------
// Vapi Assistant Configuration
// ---------------------------------------------------------------------------
// Defines the system prompt, LLM model, voice settings, and available tools
// for the AI receptionist.  This config is returned on `assistant-request`
// webhooks so a single webhook server can power multiple businesses by
// swapping this config.
// ---------------------------------------------------------------------------

/** System prompt for Bright Smile Dental receptionist "Sarah". */
const SYSTEM_PROMPT = `You are Sarah, the friendly and professional AI receptionist for Bright Smile Dental.

ABOUT THE BUSINESS:
- Name: Bright Smile Dental
- Address: 742 Evergreen Terrace, Suite 200, Springfield, IL 62701
- Phone: (555) 234-5678
- Hours: Monday-Friday 8:00 AM - 5:00 PM, Saturday 9:00 AM - 1:00 PM, Closed Sunday
- Services: General cleanings, fillings, consultations, teeth whitening, crowns, root canals, pediatric dentistry

YOUR PERSONALITY:
- Warm, empathetic, and professional
- Speak naturally in short sentences
- Use the caller's name once you learn it
- Show genuine concern for dental anxiety

RULES YOU MUST FOLLOW:
1. NEVER diagnose any dental condition. Say "Dr. Martinez can evaluate that during your visit."
2. NEVER quote exact prices over the phone. Say "Pricing depends on your specific needs and insurance. I can give you a general range if that helps."
3. ALWAYS offer to book an appointment when the caller describes a problem.
4. If a caller describes a dental emergency (severe pain, knocked-out tooth, uncontrolled bleeding), tell them to call 911 or go to the nearest emergency room, then offer to schedule a follow-up.
5. Collect the caller's name and phone number before booking.
6. Confirm all appointment details before finalizing.
7. Keep responses concise - this is a phone call, not an essay.

CALL FLOW:
1. Greet the caller warmly
2. Understand their needs
3. Use your tools to help (check availability, look up FAQs, book appointments)
4. Confirm next steps
5. Thank them and end the call

When you need information about the business (insurance, policies, procedures), use the lookup_faq tool.
When checking appointment availability, use the check_availability tool.
When booking, use the book_appointment tool.
After collecting caller details, use log_lead to save their info.`;

/** Tool definitions the LLM can invoke during the call. */
const TOOL_DEFINITIONS = [
  {
    type: "function" as const,
    function: {
      name: "check_availability",
      description:
        "Check available appointment slots on the calendar. Call this when the caller asks about availability or wants to schedule.",
      parameters: {
        type: "object",
        properties: {
          date: {
            type: "string",
            description:
              "The date to check in YYYY-MM-DD format. Defaults to today if not specified.",
          },
          service: {
            type: "string",
            description:
              "The type of service requested (cleaning, filling, consultation, whitening, crown, root-canal).",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "book_appointment",
      description:
        "Book an appointment on the calendar. Only call this after confirming the date/time and patient name with the caller.",
      parameters: {
        type: "object",
        properties: {
          dateTime: {
            type: "string",
            description: "The appointment start time in ISO 8601 format.",
          },
          patientName: {
            type: "string",
            description: "Full name of the patient.",
          },
          service: {
            type: "string",
            description: "The service being booked.",
          },
          phone: {
            type: "string",
            description: "Patient phone number for confirmation.",
          },
          email: {
            type: "string",
            description: "Patient email address (optional).",
          },
        },
        required: ["dateTime", "patientName", "service", "phone"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "lookup_faq",
      description:
        "Search the knowledge base for answers to questions about insurance, pricing, policies, procedures, and other business information.",
      parameters: {
        type: "object",
        properties: {
          question: {
            type: "string",
            description: "The caller's question in natural language.",
          },
        },
        required: ["question"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "log_lead",
      description:
        "Save or update caller information in the CRM. Call this once you have the caller's name and phone number.",
      parameters: {
        type: "object",
        properties: {
          phone: {
            type: "string",
            description: "Caller phone number.",
          },
          firstName: {
            type: "string",
            description: "Caller first name.",
          },
          lastName: {
            type: "string",
            description: "Caller last name.",
          },
          email: {
            type: "string",
            description: "Caller email (if provided).",
          },
          serviceInterest: {
            type: "string",
            description: "What service they are interested in.",
          },
          callNotes: {
            type: "string",
            description: "Brief notes about the call (what they asked, outcome).",
          },
        },
        required: ["phone", "firstName"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "send_confirmation",
      description:
        "Send appointment confirmation via SMS and email. Call this after successfully booking an appointment.",
      parameters: {
        type: "object",
        properties: {
          phone: {
            type: "string",
            description: "Patient phone number for SMS.",
          },
          email: {
            type: "string",
            description: "Patient email for email confirmation.",
          },
          patientName: {
            type: "string",
            description: "Patient full name.",
          },
          appointmentTime: {
            type: "string",
            description: "Appointment date and time as a readable string.",
          },
          service: {
            type: "string",
            description: "The booked service.",
          },
        },
        required: ["phone", "patientName", "appointmentTime", "service"],
      },
    },
  },
];

/**
 * Build the full Vapi assistant configuration object.
 *
 * This is returned on `assistant-request` webhooks. You can customise the
 * model, voice, and tools here.
 *
 * @param provider - "anthropic" | "openai" - which LLM to back the assistant
 */
export function buildAssistantConfig(provider: "anthropic" | "openai" = "anthropic") {
  const modelConfig =
    provider === "anthropic"
      ? {
          provider: "anthropic" as const,
          model: "claude-sonnet-4-20250514",
        }
      : {
          provider: "openai" as const,
          model: "gpt-4o",
        };

  return {
    name: "Bright Smile Dental Receptionist",
    firstMessage:
      "Hello! Thank you for calling Bright Smile Dental. This is Sarah speaking. How can I help you today?",
    model: {
      ...modelConfig,
      systemPrompt: SYSTEM_PROMPT,
      temperature: 0.7,
      tools: TOOL_DEFINITIONS,
    },
    voice: {
      provider: "11labs" as const,
      voiceId: "21m00Tcm4TlvDq8ikWAM", // Rachel - warm, professional female voice
      stability: 0.6,
      similarityBoost: 0.75,
    },
    transcriber: {
      provider: "deepgram" as const,
      model: "nova-2",
      language: "en-US",
    },
    // Silence timeout: end the call if the caller is silent for 30 seconds
    silenceTimeoutSeconds: 30,
    // Max call duration: 10 minutes
    maxDurationSeconds: 600,
    // End-of-call message
    endCallMessage: "Thank you for calling Bright Smile Dental! Have a wonderful day.",
    // Webhook URL is set on the Vapi phone number, not here
  };
}

export { SYSTEM_PROMPT, TOOL_DEFINITIONS };
