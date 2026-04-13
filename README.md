# AI Voice Agent

A production-ready AI receptionist that handles inbound phone calls for small businesses. Built with Vapi, Deepgram, Claude/GPT-4o, ElevenLabs, and a full tool stack (Google Calendar, Pinecone RAG, HubSpot CRM, Twilio SMS, Resend email).

**Watch the full architecture walkthrough: [YouTube Video]**

---

## Architecture

```
                          +------------------+
    Caller (PSTN/SIP)     |                  |
         |                |   Vapi           |
         +--------------->|   (Orchestrator) |
         |                |                  |
         |                +--------+---------+
         |                         |
         |            +------------+-------------+
         |            |            |              |
         |      +-----v----+ +----v-----+ +------v------+
         |      | Deepgram | |  Claude  | | ElevenLabs  |
         |      |  (STT)   | | /GPT-4o  | |   (TTS)     |
         |      +----------+ | (LLM)    | +-------------+
         |                   +----+-----+
         |                        |
         |               Tool Calls (function-call webhook)
         |                        |
         |         +--------------+--------------+
         |         |         |         |         |
         |    +----v---+ +--v---+ +---v--+ +----v-----+
         |    |Calendar| |  RAG | | CRM  | | Workflows|
         |    |Google  | |Pinecone|HubSpot| |   n8n    |
         |    +--------+ +------+ +------+ +----------+
         |
         +<--- Response (voice) ---+
                                   |
                    Post-call: SMS (Twilio) + Email (Resend)
```

## How It Works

1. A caller dials your Twilio phone number
2. Twilio routes the call to Vapi, which orchestrates the conversation
3. Deepgram converts speech to text in real-time
4. The LLM (Claude or GPT-4o) processes the text with your system prompt and available tools
5. When the LLM needs information or wants to take action, it calls tools via webhooks to your server
6. ElevenLabs converts the LLM response back to natural speech
7. After the call, SMS and email confirmations are sent automatically

---

## End-to-End Setup Guide

This guide walks you through every step from zero to a working AI receptionist taking real phone calls. Budget about 30-45 minutes for the full setup.

### What You Will Need

| Service | Free Tier? | Estimated Cost |
|---------|-----------|----------------|
| [Vapi](https://vapi.ai) | $10 free credit | ~$0.05/min |
| [Twilio](https://twilio.com) | $15.50 free credit | ~$1/mo phone + $0.014/min |
| [OpenAI](https://platform.openai.com) | Pay-as-you-go | ~$0.01/call (embeddings) |
| [Anthropic](https://console.anthropic.com) | Pay-as-you-go | ~$0.03/call (Claude) |
| [ElevenLabs](https://elevenlabs.io) | Free tier available | ~$0.03/min |
| [Pinecone](https://pinecone.io) | Free tier (100K vectors) | $0 |
| [HubSpot](https://developers.hubspot.com) | Free CRM | $0 |
| [Resend](https://resend.com) | 3,000 emails/mo free | $0 |
| [Google Cloud](https://console.cloud.google.com) | Free tier | $0 |
| [ngrok](https://ngrok.com) | Free tier | $0 |

**Total to get started: $0 (using free tiers and credits)**

---

### Step 1: Clone and Install

```bash
git clone https://github.com/theaihow/ai-voice-agent.git
cd ai-voice-agent
pnpm install
cp .env.example .env
```

Now open `.env` in your editor. You will fill in each value as you complete the steps below.

---

### Step 2: Set Up Twilio (Phone Number)

Twilio gives your AI a real phone number that people can call.

1. Go to [twilio.com/try-twilio](https://www.twilio.com/try-twilio) and create an account
2. Verify your phone number (Twilio requires this for trial accounts)
3. From the Twilio Console dashboard, find your **Account SID** and **Auth Token** at the top of the page
4. Go to **Phone Numbers > Manage > Buy a number**
   - Search for a number in your area
   - Make sure "Voice" capability is checked
   - Click "Buy" (costs ~$1.15/month)
5. Note your new phone number (e.g., `+15551234567`)

Add to your `.env`:
```
TWILIO_ACCOUNT_SID=your_twilio_account_sid
TWILIO_AUTH_TOKEN=your_auth_token_here
TWILIO_PHONE_NUMBER=+15551234567
```

> **Note:** Do NOT configure the Twilio phone number's webhook yet. Vapi will handle that connection.

---

### Step 3: Set Up Vapi (Voice AI Orchestrator)

Vapi coordinates the entire call flow -- it connects Twilio, Deepgram, the LLM, and ElevenLabs.

1. Go to [vapi.ai](https://vapi.ai) and create an account (you get $10 free credit)
2. Go to **Dashboard > Organization > API Keys**
   - Click "Create API Key"
   - Copy the key (starts with something like `vapi-...`)
3. Go to **Phone Numbers** in the left sidebar
   - Click **"Import"** (top right)
   - Select **"Twilio"** as the provider
   - Paste your Twilio Account SID and Auth Token
   - Select the phone number you bought in Step 2
   - Click **"Import"**
4. After importing, click on the phone number
   - Copy the **Phone Number ID** from the URL or the details panel
   - You will set the webhook URL later (Step 8)

Add to your `.env`:
```
VAPI_API_KEY=vapi-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
VAPI_PHONE_NUMBER_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

---

### Step 4: Set Up OpenAI (Embeddings + Optional LLM)

OpenAI is used for creating embeddings (converting text to vectors for the knowledge base). It can also be used as the LLM if you prefer GPT-4o over Claude.

1. Go to [platform.openai.com](https://platform.openai.com)
2. Click your profile icon > **"View API keys"**
3. Click **"Create new secret key"**
4. Copy the key (starts with `sk-`)

Add to your `.env`:
```
OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

---

### Step 5: Set Up Anthropic (Claude LLM)

Claude is the default LLM brain for the receptionist. It follows instructions precisely, which matters when you have strict business rules.

1. Go to [console.anthropic.com](https://console.anthropic.com)
2. Go to **Settings > API Keys**
3. Click **"Create Key"**
4. Copy the key

Add to your `.env`:
```
ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

> **Tip:** You can use either Claude OR GPT-4o. The project defaults to Claude. To switch to GPT-4o, change the provider in `src/config/vapi-assistant.ts`.

---

### Step 6: Set Up ElevenLabs (Voice)

ElevenLabs gives the AI a natural-sounding voice.

1. Go to [elevenlabs.io](https://elevenlabs.io) and create an account
2. Click your profile icon > **"Profile + API key"**
3. Click the eye icon to reveal your API key and copy it

Add to your `.env`:
```
ELEVENLABS_API_KEY=xi_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

> **Note:** The project uses the "Rachel" voice by default (voice ID `21m00Tcm4TlvDq8ikWAM`). You can change this in `src/config/vapi-assistant.ts` or clone your own voice in the ElevenLabs dashboard.

---

### Step 7: Set Up Google Calendar (Appointment Booking)

This lets the AI check available slots and book appointments directly on a Google Calendar.

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Click the project dropdown at the top > **"New Project"**
   - Name it "AI Voice Agent"
   - Click **"Create"**
3. Make sure your new project is selected in the dropdown
4. Go to **APIs & Services > Library**
   - Search for "Google Calendar API"
   - Click on it > Click **"Enable"**
5. Go to **APIs & Services > Credentials**
   - Click **"Create Credentials" > "Service Account"**
   - Name it "ai-voice-agent"
   - Click **"Create and Continue"**
   - Skip the optional role and user access steps
   - Click **"Done"**
6. Click on the service account you just created
   - Go to the **"Keys"** tab
   - Click **"Add Key" > "Create New Key"**
   - Select **"JSON"**
   - Click **"Create"** -- this downloads a JSON file
7. Note the **service account email** (looks like `ai-voice-agent@your-project.iam.gserviceaccount.com`)
8. Go to [Google Calendar](https://calendar.google.com)
   - Create a new calendar (or use an existing one) for appointments
   - Go to calendar **Settings > Share with specific people**
   - Add the service account email from step 7
   - Set permission to **"Make changes to events"**
   - Click **"Send"**
   - While in settings, scroll down to find **"Calendar ID"** (looks like `abc123@group.calendar.google.com`)
9. Base64-encode the JSON key file you downloaded:

```bash
# macOS
cat ~/Downloads/your-project-xxxxx.json | base64

# Linux
cat ~/Downloads/your-project-xxxxx.json | base64 -w 0
```

Add to your `.env`:
```
GOOGLE_CALENDAR_ID=abc123xyz@group.calendar.google.com
GOOGLE_SERVICE_ACCOUNT_KEY=eyJ0eXBlIjoic2VydmljZV9hY2NvdW50Ii...  (the long base64 string)
```

---

### Step 8: Set Up Pinecone (Knowledge Base / RAG)

Pinecone is the knowledge base for your AI receptionist. It stores your business FAQs as vector embeddings so the AI can look up accurate answers during calls instead of making things up.

**What goes in Pinecone?**

Your business's FAQ content -- things like:
- "Do you accept Delta Dental insurance?" -> Yes, we accept Delta Dental, Cigna, Aetna...
- "What are your Saturday hours?" -> Saturday 9:00 AM to 1:00 PM
- "How much does a cleaning cost?" -> $100 to $200 depending on insurance...
- "Where are you located?" -> 742 Evergreen Terrace, Suite 200...

The sample project includes 20 pre-written FAQs for a dental office in `knowledge/bright-smile-dental.md`. When you run `pnpm seed`, the script automatically:

1. Reads the FAQ markdown file
2. Splits it into individual Q&A pairs
3. Converts each Q&A into a vector embedding using OpenAI's `text-embedding-3-small` model
4. Uploads those vectors to your Pinecone index

Then during a live call, when a caller asks "Do you take my insurance?", the AI:
1. Converts the question into a vector
2. Searches Pinecone for the closest matching FAQ
3. Reads the matched answer back to the caller

This is called RAG (Retrieval Augmented Generation) -- it grounds the AI's answers in your real business data instead of hallucinating.

**Setup:**

1. Go to [app.pinecone.io](https://app.pinecone.io) and create a free account
   - The free tier gives you 100K vectors -- more than enough (each FAQ uses 1 vector)
2. After signing in, go to **API Keys** in the left sidebar
3. Copy your API key

Add to your `.env`:
```
PINECONE_API_KEY=pcsk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
PINECONE_INDEX_NAME=ai-voice-agent
```

> **You do NOT need to create the index or upload anything manually.** The `pnpm seed` command (Step 11) handles everything -- it creates the index and uploads your FAQs automatically.

**Customizing for your business:**

To replace the dental FAQs with your own business content, edit `knowledge/bright-smile-dental.md`. Follow this format:

```markdown
## Category Name

**Q: Your question here?**
Your answer here. Can be multiple sentences. Include specific details
like prices, hours, addresses, and policies.

**Q: Another question?**
Another answer with specific details.
```

After editing, run `pnpm seed` again to update the knowledge base.

---

### Step 9: Set Up HubSpot (CRM)

HubSpot stores caller information and leads automatically.

1. Go to [app.hubspot.com](https://app.hubspot.com) and create a free account
2. Go to **Settings (gear icon) > Integrations > Private Apps**
3. Click **"Create a private app"**
   - Name it "AI Voice Agent"
   - Go to the **"Scopes"** tab
   - Search for and enable these scopes:
     - `crm.objects.contacts.read`
     - `crm.objects.contacts.write`
   - Click **"Create app"**
   - Click **"Continue creating"** in the confirmation dialog
4. Copy the **Access Token** shown on the screen

Add to your `.env`:
```
HUBSPOT_API_KEY=pat-na1-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

---

### Step 10: Set Up Resend (Email Notifications)

Resend sends confirmation emails after appointments are booked. It has a generous free tier (3,000 emails/month) and the simplest setup of any email API.

1. Go to [resend.com](https://resend.com) and create an account
2. Go to **API Keys** in the left sidebar
   - Click **"Create API Key"**
   - Name it "AI Voice Agent"
   - Set permission to **"Sending access"**
   - Click **"Add"**
   - Copy the key (starts with `re_`)
3. **For testing:** You can use the default `onboarding@resend.dev` sender immediately (no domain setup needed)
4. **For production:** Go to **Domains** in the left sidebar
   - Click **"Add Domain"**
   - Add your domain (e.g., `yourdomain.com`)
   - Add the DNS records Resend shows you (MX, TXT, DKIM)
   - Wait for verification (usually takes a few minutes)
   - Use `noreply@yourdomain.com` as your from address

Add to your `.env`:
```
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
RESEND_FROM_EMAIL=onboarding@resend.dev
```

> **Tip:** Start with `onboarding@resend.dev` for testing. Switch to your own domain email before going to production.

---

### Step 11: Seed the Knowledge Base

Now that Pinecone and OpenAI are configured, load the sample dental office FAQs into the vector database:

```bash
pnpm seed
```

You should see output like:
```
Parsed 20 FAQ entries from knowledge/bright-smile-dental.md
Creating Pinecone index "ai-voice-agent"...
Embedding and upserting 20 entries...
Knowledge base seeded successfully!
```

> **Customizing:** Edit `knowledge/bright-smile-dental.md` to replace with your own business FAQs, then run `pnpm seed` again.

---

### Step 12: Create the Vapi Assistant

This registers your AI receptionist with Vapi, including the system prompt, voice, and tool definitions:

```bash
pnpm run setup
```

You should see:
```
Vapi assistant created with ID: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

Save this assistant ID -- you will need it if you want to trigger test calls.

---

### Step 13: Start the Server

```bash
pnpm dev
```

You should see:
```
AI Voice Agent server running on port 3001
```

Verify it is working:
```bash
curl http://localhost:3001/health
```

Expected response:
```json
{"status":"ok","timestamp":"2026-04-12T..."}
```

---

### Step 14: Expose Your Server with ngrok

Vapi needs to reach your webhook endpoint over the internet. Use ngrok to create a tunnel:

1. Install ngrok if you have not already:
```bash
# macOS
brew install ngrok

# Or download from https://ngrok.com/download
```

2. Sign up at [ngrok.com](https://ngrok.com) and copy your authtoken from the dashboard

3. Authenticate ngrok:
```bash
ngrok config add-authtoken YOUR_AUTH_TOKEN
```

4. Start the tunnel:
```bash
ngrok http 3001
```

5. Copy the **Forwarding URL** (looks like `https://xxxx-xx-xx-xxx-xxx.ngrok-free.app`)

---

### Step 15: Connect Vapi to Your Webhook

1. Go to [dashboard.vapi.ai](https://dashboard.vapi.ai)
2. Go to **Phone Numbers** in the left sidebar
3. Click on your imported Twilio phone number
4. In the **"Server URL"** field, paste your ngrok URL with the webhook path:
```
https://xxxx-xx-xx-xxx-xxx.ngrok-free.app/vapi/webhook
```
5. Click **"Save"**

---

### Step 16: Make Your First Call

Pick up your phone and dial the Twilio number you bought in Step 2. You should hear Sarah greet you:

> "Hello! Thank you for calling Bright Smile Dental. This is Sarah speaking. How can I help you today?"

**Things to try:**
- "I need to book a cleaning for next Tuesday"
- "Do you accept Delta Dental insurance?"
- "What are your hours on Saturday?"
- "I have a toothache, can I come in today?"

**What to watch:**
- Your terminal will show webhook requests coming in as the AI calls tools
- Check your Google Calendar for new appointments
- Check your HubSpot CRM for new contacts
- Check your phone for SMS confirmation after booking

**Alternatively**, trigger an outbound test call (the AI calls you):
```bash
ppnpm test-call -- +1YOURMOBILENUMBER
```

---

### Step 17: Set Up n8n Workflows (Optional)

n8n automates post-call workflows like Slack notifications and Google Sheets logging.

1. Self-host n8n or sign up at [n8n.cloud](https://n8n.cloud)
2. In the n8n editor, go to **Workflows > Import from File**
3. Import `n8n/post-call-workflow.json`
4. Configure the credentials for Slack and Google Sheets inside the workflow
5. Click **"Activate"** to turn the workflow on
6. Copy the **Webhook URL** from the Webhook node

Add to your `.env`:
```
N8N_WEBHOOK_URL=https://your-n8n-instance.com/webhook/xxxxxxxx
```

Restart your server (`pnpm dev`) to pick up the new variable.

---

## Troubleshooting

### "Cannot connect to webhook" in Vapi

- Make sure ngrok is running and the URL is correct
- Verify your server is running on port 3001
- Check that the webhook path is `/vapi/webhook` (not just `/webhook`)
- Test manually: `curl https://your-ngrok-url/health`

### AI does not respond or hangs up immediately

- Check your terminal for error logs
- Verify your Anthropic or OpenAI API key is valid and has credits
- Make sure the ElevenLabs API key is set in your `.env`
- Check that the Vapi assistant was created successfully (`pnpm setup`)

### "Calendar API has not been used" error

- Go to Google Cloud Console > APIs & Services > Library
- Search for "Google Calendar API" and make sure it is enabled
- Wait 2-3 minutes after enabling (it takes a moment to propagate)

### Knowledge base returns empty results

- Run `pnpm seed` again to ensure FAQs are loaded
- Verify your Pinecone API key is correct
- Check that the Pinecone index name matches in `.env`

### SMS/email not sending

- Verify your Twilio phone number has SMS capabilities
- If using your own domain with Resend, make sure DNS records are verified
- If using `onboarding@resend.dev`, emails can only be sent to the email you signed up with (Resend restriction for testing)
- Check the Twilio dashboard and Resend Logs page for error details

### HubSpot contact not created

- Verify the private app has `crm.objects.contacts.read` and `crm.objects.contacts.write` scopes
- Check that the access token has not expired
- Look for errors in your terminal output

---

## Running Tests

```bash
# Run all tests
pnpm test

# Run tests in watch mode
ppnpm test:watch

# Run tests with coverage report
ppnpm test:coverage
```

The project has 237 tests covering all modules with 94%+ statement coverage.

---

## Cost Breakdown (Per Call)

| Service | Cost | Notes |
|---------|------|-------|
| Vapi | ~$0.05/min | Orchestration |
| Deepgram | ~$0.0059/min | Speech-to-text (Nova-2) |
| Claude Sonnet | ~$0.01-0.03/call | LLM processing |
| ElevenLabs | ~$0.03/min | Text-to-speech |
| Twilio | ~$0.014/min | Phone connection |
| Pinecone | Free tier | Up to 100K vectors |
| **Total** | **~$0.10-0.15/min** | Approximate |

A typical 3-minute call costs approximately **$0.30-$0.45**.

Compare that to a human receptionist at $20/hour. At 10 calls per hour, that is $2.00 per call versus $0.35. The AI works 24/7 and never calls in sick.

---

## Deployment

When you are ready to go to production, deploy to a cloud platform so you do not need ngrok running on your laptop.

### Railway

1. Push your code to GitHub
2. Connect your repo to [Railway](https://railway.app)
3. Add all environment variables from `.env.example`
4. Set build command: `corepack enable && pnpm install --frozen-lockfile && pnpm build`
5. Set start command: `pnpm start`
6. Use the Railway-provided URL as your Vapi webhook URL (replace the ngrok URL)

### Render

1. Push your code to GitHub
2. Create a new Web Service on [Render](https://render.com)
3. Set build command: `corepack enable && pnpm install --frozen-lockfile && pnpm build`
4. Set start command: `pnpm start`
5. Add all environment variables
6. Use the Render URL as your Vapi webhook URL

### Docker

```dockerfile
FROM node:20-alpine
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --prod --frozen-lockfile
COPY dist/ ./dist/
EXPOSE 3001
CMD ["node", "dist/index.js"]
```

```bash
# Build
pnpm build
docker build -t ai-voice-agent .

# Run
docker run -p 3001:3001 --env-file .env ai-voice-agent
```

---

## Project Structure

```
ai-voice-agent/
├── src/
│   ├── index.ts                    # Express server entry point
│   ├── config/
│   │   ├── env.ts                  # Environment validation with Zod
│   │   └── vapi-assistant.ts       # Vapi assistant config (system prompt + tools)
│   ├── server/
│   │   ├── routes.ts               # Express route definitions
│   │   └── webhooks.ts             # Vapi webhook handlers
│   ├── tools/
│   │   ├── calendar.ts             # Google Calendar integration
│   │   ├── knowledge-base.ts       # RAG queries via Pinecone
│   │   ├── crm.ts                  # HubSpot CRM integration
│   │   └── notifications.ts        # SMS + email confirmations
│   ├── services/
│   │   ├── vapi.ts                 # Vapi client + assistant management
│   │   ├── pinecone.ts             # Pinecone client + embeddings
│   │   └── n8n.ts                  # n8n webhook triggers
│   └── utils/
│       ├── logger.ts               # Structured logging (Winston)
│       └── types.ts                # Shared TypeScript types
├── scripts/
│   ├── setup-vapi-assistant.ts     # Create Vapi assistant
│   ├── seed-knowledge-base.ts      # Seed Pinecone with FAQs
│   └── test-call.ts                # Trigger a test call
├── knowledge/
│   └── bright-smile-dental.md      # Sample business FAQs
├── n8n/
│   └── post-call-workflow.json     # Importable n8n workflow
├── .env.example
├── package.json
├── tsconfig.json
└── README.md
```

## Customizing for Your Business

1. Edit `src/config/vapi-assistant.ts` to change the system prompt, business name, hours, and rules
2. Replace `knowledge/bright-smile-dental.md` with your own FAQ content
3. Run `pnpm seed` to update the knowledge base
4. Run `pnpm setup` to create a new assistant with the updated config

## License

MIT
