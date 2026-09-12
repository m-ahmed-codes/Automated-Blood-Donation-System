# Emergency Blood Donor Matching System

An autonomous, multi-channel blood donor coordination system for emergency requests. Requesters submit requests through Telegram, Gemini extracts the request details, requisition images are verified before matching, compatible donors are ranked by eligibility and travel time, and donor outreach is dispatched in timed waves.

The project also includes a Next.js operations dashboard for request monitoring, human verification, donor simulation, ETA visibility, wave progress, and individual donor conversations.

## Architecture Overview

```text
Requester on Telegram
        |
        v
POST /api/telegram
        |
        v
telegramWebhook.js
        |
        v
intakeService.js ---- Gemini request parsing
        |
        +--> PENDING_INFO: ask for missing blood group, count, or hospital
        |
        +--> PENDING_VERIFICATION: wait for requisition image
                         |
                         v
              visionService.js / Gemini Vision
                         |
                 +-------+-------+
                 |               |
               MATCHING     PENDING_APPROVAL
                 |               |
                 v               v
          waveManager.js   Dashboard/admin review
                 |
                 v
          matchingEngine.js
          compatibility + eligibility + ETA ranking
                 |
                 v
          Twilio WhatsApp or test simulation
                 |
                 v
          POST /api/webhook
                 |
                 v
          donorService.js
          confirm / decline / reschedule / ineligible
```

## End-to-End Workflow

1. A requester sends a blood request to the Telegram bot.
2. `geminiService.js` extracts blood group, bottle count, hospital, urgency, and missing-field questions.
3. Incomplete requests are saved as `PENDING_INFO` and remain conversational.
4. Complete requests pass deterministic validation through `verificationService.js`.
5. Valid complete requests enter `PENDING_VERIFICATION` and the requester is asked for a requisition image.
6. `telegramWebhook.js` downloads the Telegram image and passes its buffer to `visionService.js`.
7. Gemini Vision extracts hospital, doctor, patient, units, registration number, stamp, confidence, and verification status.
8. Verified requests move to `MATCHING`; rejected or uncertain requests move to `PENDING_APPROVAL`.
9. A coordinator can approve or reject pending requests in the dashboard.
10. `waveManager.js` starts donor outreach in waves.
11. `matchingEngine.js` filters and ranks compatible donors using eligibility, history, proximity, and ETA.
12. Donors receive WhatsApp messages, or test donors are recorded without sending real messages.
13. Donor replies are classified and processed by `donorService.js`.
14. Confirming donors receive a hospital route link, ETA, and distance.
15. The request reaches completion after the configured donor buffer target, normally three confirmed donors per bottle.

## Backend

### Runtime and services

The backend is a Node.js and Express application. `server.js` mounts the HTTP routes and registers the Telegram webhook when `PUBLIC_URL` is configured.

| Area | File | Responsibility |
|---|---|---|
| Server | `server.js` | Express startup, middleware, route mounting |
| Telegram | `routes/telegramWebhook.js` | Requester text, Telegram photos, admin approval commands |
| Webhooks | `routes/webhook.js` | Twilio and dashboard donor reply routing |
| Dashboard API | `routes/dashboard.js` | Requests, donor outreach, transcripts, approval endpoints |
| Intake | `services/intakeService.js` | Request state machine and channel-aware replies |
| Parsing | `services/geminiService.js` | Request and donor intent extraction |
| Validation | `services/verificationService.js` | Blood group, bottle count, and hospital checks |
| Vision | `services/visionService.js` | Requisition image analysis and confidence result |
| Matching | `services/matchingEngine.js` | Compatibility, cooldown, scoring, and ETA-aware ranking |
| Logistics | `services/logisticsAgent.js` | OSRM route duration and distance with fallback |
| Waves | `services/waveManager.js` | Dispatch, timers, escalation, and unfulfillable state |
| Donors | `services/donorService.js` | Confirm, decline, reschedule, eligibility, and completion |
| Context | `services/contextEngine.js` | Adaptive wave size, timeout, and buffer reasoning |
| Logging | `services/logService.js` | Inbound/outbound message audit records |

### Request state machine

```text
PENDING_INFO
    |
    | all required text fields received
    v
PENDING_VERIFICATION
    |
    +--> valid requisition image --> MATCHING
    |
    +--> failed or uncertain image --> PENDING_APPROVAL
                                      |
                                      +--> approve --> MATCHING
                                      +--> reject  --> UNFULFILLABLE

MATCHING --> COMPLETED
         \\-> UNFULFILLABLE
```

### Natural-language intake

Gemini parses English, Urdu, and Roman Urdu requests. Required request fields are:

- `blood_group`, for example `O+`
- `count`, the number of bottles or units
- `hospital`, used for verification and coordinates

Urgency values are `low`, `normal`, `high`, and `critical`.

### Verification

Deterministic validation rejects malformed blood groups, invalid counts, suspiciously high counts, and hospitals outside the configured registry. Complete requests then wait for an image instead of launching donor outreach immediately.

Vision verification returns:

- Hospital name
- Doctor name
- Doctor registration number
- Patient name
- Units required
- Stamp presence
- Confidence score
- `auto_pass`, `pending_review`, or `rejected`

The current fallback keeps an uploaded image in a pending-review result if Gemini is unavailable. It does not claim that the image is medically verified without the model or a human coordinator.

### Matching and donor buffer

Donors must have a compatible blood group, must not have been contacted already for the request, and must be outside the 90-day donation cooldown.

The default fulfillment target is:

```text
required confirmations = bottles requested x 3
```

The ranking score combines:

```text
proximity score = 40 / (distance km + 0.1)
history score   = 20 x response history rate
exact match     = 10 point bonus
ETA penalty     = min(20, ETA minutes x 0.25)
final score     = proximity + history + exact match - ETA penalty
```

### ETA and logistics

`services/logisticsAgent.js` receives donor and hospital coordinates and requests a driving route from OSRM. It returns `etaMinutes` and `distanceKm`.

If OSRM fails, the system calculates Haversine distance and estimates travel time using an average speed fallback. Hospital coordinates currently come from the lookup in `matchingEngine.js`; unknown hospitals use a Karachi-center fallback.

ETA is used in donor ranking and is exposed by the dashboard API. Donor cards show ETA and distance, and a confirming donor receives a Google Maps directions link.

### Adaptive waves

The context engine adjusts wave size, timeout, and buffer reasoning using urgency, time bucket, blood-group scarcity, and donor availability. The wave manager:

- dispatches a ranked donor batch
- records `outreach` rows
- logs each outbound message
- skips real Twilio for `is_test_donor` records
- starts an escalation timer
- launches the next wave when the target is still short
- cancels timers when a request is complete
- marks the request `UNFULFILLABLE` after maximum waves or no eligible donors

## Dashboard

The dashboard is a Next.js 14 App Router application in `dashboard/`. It polls the backend approximately every three seconds and is designed as a tactical operations console rather than a public requester interface.

### Main command center

The home page provides:

- Active, pending, closed, and total request telemetry
- Search by hospital, blood group, or request text
- Filters for matching, pending OCR, review, and completed requests
- Status and urgency signals
- Donor confirmation progress against the three-to-one target
- Current wave number
- Operational logistics visualization with hospital target, donor markers, radius rings, and route vectors
- Wave telemetry showing active or standby status and target ratio

### Request detail page

Each request page contains:

- Request status, hospital, urgency, bottle count, and progress
- `PENDING_APPROVAL` coordinator controls
- Original requester message
- Verification reason or follow-up state
- Donor outreach grouped by wave
- ETA and distance for donors with coordinates
- Test-mode donor response controls
- Individual donor chat embedded directly inside each donor card
- Requester-only conversation view
- Full transcript view with selectable requester and donor tabs
- Completion summary for confirmed and rescheduled donors

### Individual donor chats

Every outreach row is linked to a donor through `donor_id`. The request detail page filters `messages_log` by that ID and passes only matching messages into that donor's card. This keeps each donor's inbound and outbound conversation isolated.

The card also provides test controls for:

- Confirm
- Decline
- Reschedule
- Recently donated
- Custom text replies

These controls send through the same donor webhook and service logic used by real replies.

### Dashboard limitations

The current operational map is a visual dashboard panel, not a live Mapbox map. Its rings, pins, and route vectors communicate the dispatch model but do not yet update as an interactive geographic canvas.

The backend currently supports approval, rejection, polling, donor simulation, and transcript viewing. Manual wave forcing, timer pause, donor injection, operator audit logs, live Mapbox tiles, image storage, and analytics heatmaps are not implemented.

## API Reference

### Requester and donor routes

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/telegram` | Telegram text and requisition photo webhook |
| `POST` | `/api/webhook` | Twilio or dashboard donor reply webhook |

### Dashboard routes

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/dashboard/requests` | Latest request queue |
| `GET` | `/api/dashboard/requests/:id` | Request, donor outreach, ETA, and message log |
| `GET` | `/api/dashboard/outreach/pending` | Test-mode outreach awaiting donor response |
| `GET` | `/api/dashboard/donors` | Donor directory |
| `POST` | `/api/dashboard/requests/:id/approve` | Approve and launch Wave 1 |
| `POST` | `/api/dashboard/requests/:id/reject` | Reject and close a request |

## Database

Run `db/migrations.sql` in Supabase before using the live workflow. The schema contains:

- `donors`: donor identity, compatibility, coordinates, history, and test mode
- `requests`: requester state, request fields, wave state, and verification follow-up
- `outreach`: donor dispatch status and wave number
- `messages_log`: inbound and outbound audit messages with request and donor IDs
- `verified_hospitals`: hospital registry support
- `verified_doctors`: doctor registry support
- `agent_trajectories`: structured agent execution records

Important request statuses are:

```text
PENDING_INFO, PENDING_VERIFICATION, PENDING_APPROVAL,
MATCHING, COMPLETED, UNFULFILLABLE
```

Donors need valid `lat` and `lng` values for real ETA results. The dashboard API returns those coordinates only as needed for route calculations and display data.

## Setup

### Backend

Requirements: Node.js 18 or newer.

```bash
npm install
npm start
```

Development mode:

```bash
npm run dev
```

The backend listens on port 3001 unless configured otherwise by the application environment.

### Dashboard

```bash
cd dashboard
npm install
npm run dev
```

Open `http://localhost:3000`. The dashboard proxies `/api/*` requests to `http://localhost:3001` through `dashboard/next.config.js`.

Production dashboard:

```bash
cd dashboard
npm run build
npm start
```

### Environment variables

Create `.env` from `.env.example`. Configure:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `TELEGRAM_BOT_TOKEN`
- `GEMINI_API_KEY`
- Twilio credentials for real WhatsApp delivery
- `PUBLIC_URL` for Telegram webhook registration
- Optional `TELEGRAM_PROXY`
- Optional `WAVE_SIZE`, `MAX_WAVES`, and `WAVE_TIMEOUT_MS`

Never commit `.env`, bot tokens, database service keys, or Twilio credentials.

## Telegram Setup

1. Create a bot with BotFather.
2. Put its token in `TELEGRAM_BOT_TOKEN`.
3. Make the backend publicly reachable with a deployment or tunnel.
4. Set `PUBLIC_URL` to the public origin.
5. Start the backend so it registers `/api/telegram`.
6. Send a request to the bot.
7. When prompted, send a clear requisition image as a Telegram photo.

If the log says:

```text
[TelegramWebhook] Failed to download photo
```

the vision service received no image buffer. Check the bot token, Telegram connectivity, proxy configuration, webhook URL, and backend restart state.

## Test and Validation Commands

From the repository root:

```bash
npm run benchmark
node --check server.js
node --check routes/telegramWebhook.js
node --check routes/dashboard.js
node --check services/intakeService.js
node --check services/logisticsAgent.js
node --check services/visionService.js
```

From `dashboard/`:

```bash
npm run build
```

Use test donors (`is_test_donor = true`) during development so donor outreach is logged and simulatable without sending real WhatsApp messages.

## Project Structure

```text
blood-donor-backend/
├── server.js
├── package.json
├── README.md
├── FEATURES-README.md
├── config/
│   ├── supabase.js
│   ├── telegram.js
│   └── twilio.js
├── routes/
│   ├── dashboard.js
│   ├── telegramWebhook.js
│   └── webhook.js
├── services/
│   ├── contextEngine.js
│   ├── daceService.js
│   ├── donorService.js
│   ├── geminiService.js
│   ├── intakeService.js
│   ├── logisticsAgent.js
│   ├── matchingEngine.js
│   ├── verificationService.js
│   ├── visionService.js
│   └── waveManager.js
├── db/
│   ├── migrations.sql
│   └── seed.sql
├── scripts/
│   └── benchmark.js
└── dashboard/
    ├── app/
    │   ├── globals.css
    │   ├── layout.jsx
    │   ├── page.jsx
    │   └── request/[id]/page.jsx
    ├── components/
    │   ├── DonorCard.jsx
    │   └── MessageLog.jsx
    ├── lib/api.js
    ├── next.config.js
    └── package.json
```

## Operational Safety

This system coordinates donor outreach; it does not replace medical professionals, hospital blood banks, or emergency services. Human approval is available for uncertain requisitions. Confirm hospital details, donor eligibility, and arrival status with the responsible coordinator before relying on any ETA or automated message.
