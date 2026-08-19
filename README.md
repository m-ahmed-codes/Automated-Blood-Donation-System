# 🩸 Blood Donor Matching System — Backend

> Autonomous emergency blood donor matching — no human coordinator required.
> Requesters send a message via **Telegram**; the system finds, ranks, and contacts donors via **WhatsApp (Twilio)** — fully hands-free.

---

## Stack

| Layer | Technology |
|---|---|
| **Runtime** | Node.js (v18+) with `--watch` |
| **HTTP Server** | Express.js |
| **Database** | Supabase (PostgreSQL) |
| **NLU / AI** | Google Gemini 2.0 Flash (`@google/genai`) |
| **Requester Channel** | Telegram Bot API (`node-telegram-bot-api`) |
| **Donor Channel** | Twilio WhatsApp Sandbox |
| **Proxy Support** | `undici` + `socks-proxy-agent` |

---

## How It Works

1. A **requester** messages the Telegram bot (e.g. *"Need 2 O+ donors at Civil Hospital urgently"*)
2. **Gemini** parses the message (handles English, Urdu, Roman Urdu) and extracts `blood_group`, `hospital`, `count`, `urgency`
3. If info is incomplete, the bot asks a warm follow-up question in the user's own language
4. Once complete, the system **ranks nearby eligible donors** by distance × response rate and launches a **wave** of outreach messages via Twilio WhatsApp
5. Donor replies ("haan aa raha hoon", "kal aa sakta hoon") are classified by Gemini and automatically update request state in Postgres
6. If a wave doesn't yield enough confirmations, a new wave is auto-escalated after a configurable timeout

---

## Architecture

```
Telegram (Requester)
    │
    ▼
POST /api/telegram
    │
    ├─ /start command ──────────────────────► Welcome message
    │
    └─ Text message ────────────────────────► intakeService.handleRequesterMessage()
                                                  │
                                                  ├─ PENDING_INFO: Gemini asks follow-up
                                                  └─ Complete → launchWave(requestId, 1)
                                                                    │
                                                              waveManager
                                                              rank → Twilio send → timer
                                                              → escalate if not fulfilled

WhatsApp (Donor reply via Twilio or Fake Console)
    │
    ▼
POST /api/webhook
    │
    └─ open outreach row? ──YES──► donorService.handleDonorReply()
                                        │
                                        ├─ confirm           → increment confirmed_count
                                        ├─ decline           → mark DECLINED
                                        ├─ reschedule        → mark RESCHEDULED + store time
                                        ├─ eligibility_update → mark INELIGIBLE
                                        └─ unclear           → ask for clarification
```

---

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

Copy `.env.example` to `.env` and fill in all values:

```bash
cp .env.example .env
```

| Variable | Description |
|---|---|
| `SUPABASE_URL` | Your Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (not anon key) |
| `GEMINI_API_KEY` | Google AI Studio API key |
| `TELEGRAM_BOT_TOKEN` | Token from @BotFather |
| `PUBLIC_URL` | Your publicly reachable URL (ngrok or deployed) |
| `TWILIO_ACCOUNT_SID` | Twilio Account SID |
| `TWILIO_AUTH_TOKEN` | Twilio Auth Token |
| `TWILIO_WHATSAPP_FROM` | e.g. `whatsapp:+14155238886` |
| `TELEGRAM_PROXY` | *(Optional)* SOCKS5 proxy URI if Telegram is blocked |

### 3. Run database migrations

Paste `db/migrations.sql` into your Supabase SQL editor and run it.
Then run `db/seed.sql` to load 20 synthetic test donors across Karachi.

### 4. Start the server

```bash
npm run dev    # development (Node.js --watch)
npm start      # production
```

### 5. Expose for webhooks (local dev)

```bash
ngrok http 3001
# Copy the https URL and set PUBLIC_URL=https://xxxx.ngrok.io in your .env
```

On startup, the server **auto-registers** the Telegram webhook if `PUBLIC_URL` and `TELEGRAM_BOT_TOKEN` are both set.

To register manually:
```bash
curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://YOUR_URL/api/telegram"
```

---

## API Endpoints

### Webhook Routes

| Method | Path | Channel | Description |
|--------|------|---------|-------------|
| `POST` | `/api/telegram` | Telegram | Receives updates from Telegram Bot API |
| `POST` | `/api/webhook` | Twilio | Receives donor WhatsApp replies; also used by Fake Donor Console |

### Dashboard Routes (read-only)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/dashboard/requests` | All requests, most recent first |
| `GET` | `/api/dashboard/requests/:id` | Single request + outreach rows + message log |
| `GET` | `/api/dashboard/outreach/pending` | All `SENT` outreach rows (for Fake Donor Console) |
| `GET` | `/api/dashboard/donors` | All donors |

### Health Check

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Returns `{ status: "ok", timestamp }` |

---

## Fake Donor Console (Testing)

Since donors are contacted via Twilio WhatsApp, you can simulate donor replies from a Next.js dashboard by POSTing directly to `/api/webhook`:

```js
await fetch('http://localhost:3001/api/webhook', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    From: 'whatsapp:+92300000001',   // must match a phone in the outreach table
    Body: 'haan aa raha hoon',
    ProfileName: 'Test Donor 1',
  }),
});
```

- Donors seeded with `is_test_donor = true` skip real Twilio calls (logged only)
- Replies are routed through the real `donorService` + Gemini intent classifier
- All state changes persist to Postgres and are visible via the dashboard API

---

## Wave System

| Setting | Default | Notes |
|---------|---------|-------|
| `WAVE_TIMEOUT_MS` | `45000` (45s) | Set to `15000` for faster demos |
| `MAX_WAVES` | `3` | After 3 waves without fulfillment → `UNFULFILLABLE` |
| Wave size | `8 donors` | Hardcoded in `matchingEngine.js` |

Donors are **ranked** within each wave by a composite score:

```
score = (response_history_rate × 0.6) + (proximity_score × 0.4)
```

Donors who have donated within the last 90 days are automatically excluded as ineligible.

---

## Gemini NLU Layer

Two functions power all language understanding — zero business logic lives in the AI layer:

| Function | Input | Output |
|---|---|---|
| `parseRequest(text)` | Raw requester message | `{ blood_group, count, hospital, urgency, is_complete, follow_up_question }` |
| `parseDonorIntent(text)` | Raw donor reply | `{ intent, reschedule_time, note }` |

**Supported languages:** English · Urdu (اردو) · Roman Urdu · Mixed

**Model:** `gemini-2.0-flash` — optimised for structured JSON extraction at low latency.

---

## Project Structure

```
blood-donor-backend/
├── server.js                    # Express entry point; auto-registers Telegram webhook
├── .env.example                 # Environment variable template
├── package.json
│
├── config/
│   ├── supabase.js              # Supabase client singleton
│   ├── telegram.js              # TelegramBot client + sendTelegram() helper
│   └── twilio.js                # Twilio client + sendWhatsApp() helper
│
├── routes/
│   ├── telegramWebhook.js       # POST /api/telegram — requester intake via Telegram
│   ├── webhook.js               # POST /api/webhook  — donor replies via Twilio/console
│   └── dashboard.js             # GET  /api/dashboard/* — read-only dashboard API
│
├── services/
│   ├── geminiService.js         # parseRequest() + parseDonorIntent() — Gemini 2.0 Flash
│   ├── intakeService.js         # Requester conversation state machine
│   ├── donorService.js          # Donor reply handling + outreach state updates
│   ├── matchingEngine.js        # getRankedDonors() — pure scoring, no side effects
│   ├── waveManager.js           # launchWave() + auto-escalation timer
│   └── logService.js            # messages_log writes
│
└── db/
    ├── migrations.sql           # Full schema: donors, requests, outreach, messages_log
    └── seed.sql                 # 20 synthetic test donors across Karachi
```

---

## Database Schema

| Table | Purpose |
|---|---|
| `donors` | Registered donors with location, blood group, response rate |
| `requests` | Each inbound blood request + its current status |
| `outreach` | Per-donor outreach attempts per request (tracks wave, status, response) |
| `messages_log` | Full inbound/outbound message audit trail |

**Request statuses:** `PENDING_INFO` → `MATCHING` → `COMPLETED` / `UNFULFILLABLE`

**Outreach statuses:** `SENT` → `CONFIRMED` / `DECLINED` / `RESCHEDULED` / `INELIGIBLE`
