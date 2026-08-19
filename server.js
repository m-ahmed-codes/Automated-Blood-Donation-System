// // ============================================================
// // server.js — Entry point
// // ============================================================

// require('dotenv').config();
// const express       = require('express');
// const cors          = require('cors');
// const morgan        = require('morgan');
// const webhookRouter   = require('./routes/webhook');
// const dashboardRouter = require('./routes/dashboard');

// const app  = express();
// const PORT = process.env.PORT || 3001;

// // ── Middleware ────────────────────────────────────────────────────────────────
// app.use(cors());
// app.use(express.json());
// app.use(express.urlencoded({ extended: true })); // Twilio sends form-encoded bodies
// app.use(morgan('dev'));

// // ── Routes ────────────────────────────────────────────────────────────────────
// app.use('/api/webhook',   webhookRouter);
// app.use('/api/dashboard', dashboardRouter);

// // ── Health check ─────────────────────────────────────────────────────────────
// app.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

// // ── 404 handler ──────────────────────────────────────────────────────────────
// app.use((req, res) => res.status(404).json({ error: `Route not found: ${req.method} ${req.path}` }));

// // ── Global error handler ──────────────────────────────────────────────────────
// app.use((err, req, res, next) => {
//   console.error('[Server] Unhandled error:', err);
//   res.status(500).json({ error: 'Internal server error' });
// });

// // ── Start ─────────────────────────────────────────────────────────────────────
// app.listen(PORT, () => {
//   console.log('\n' + '═'.repeat(60));
//   console.log(`  🩸  Blood Donor Matching System — Backend`);
//   console.log(`  🚀  Server running on http://localhost:${PORT}`);
//   console.log(`  📡  Webhook endpoint: POST http://localhost:${PORT}/api/webhook`);
//   console.log(`  📊  Dashboard API:    GET  http://localhost:${PORT}/api/dashboard/*`);
//   console.log('═'.repeat(60) + '\n');
// });

// module.exports = app;



// // ───────────────────────────────────────────────────────────────────────

// ============================================================
// server.js — with Telegram route added
//
// Changes from original:
//   1. Mount /api/telegram route
//   2. Call registerWebhook() on startup if PUBLIC_URL is set
//
// Add to .env:
//   TELEGRAM_BOT_TOKEN=your-bot-token-from-botfather
//   PUBLIC_URL=https://xxxx.ngrok.io   (or your deployed URL)
// ============================================================

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');

const webhookRouter = require('./routes/webhook');
const dashboardRouter = require('./routes/dashboard');
const { router: telegramRouter, registerWebhook } = require('./routes/telegramWebhook');

const app = express();
const PORT = process.env.PORT || 3001;

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api/webhook', webhookRouter);   // Twilio WhatsApp (donors via fake console)
app.use('/api/telegram', telegramRouter);  // Telegram (requesters)
app.use('/api/dashboard', dashboardRouter);

// ── Health check ─────────────────────────────────────────────────────────────
app.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

// ── 404 + error handlers ─────────────────────────────────────────────────────
app.use((req, res) => res.status(404).json({ error: `Not found: ${req.method} ${req.path}` }));
app.use((err, req, res, next) => {
  console.error('[Server] Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, async () => {
  console.log('\n' + '═'.repeat(60));
  console.log(`  🩸  Blood Donor Matching System — Backend`);
  console.log(`  🚀  Running on http://localhost:${PORT}`);
  console.log(`  📡  Twilio webhook : POST /api/webhook`);
  console.log(`  🤖  Telegram webhook: POST /api/telegram`);
  console.log(`  📊  Dashboard API  : GET  /api/dashboard/*`);
  console.log('═'.repeat(60) + '\n');

  // Auto-register Telegram webhook if PUBLIC_URL is configured
  if (process.env.PUBLIC_URL && process.env.TELEGRAM_BOT_TOKEN) {
    await registerWebhook(process.env.PUBLIC_URL);
  } else {
    console.warn('[Server] PUBLIC_URL not set — Telegram webhook not auto-registered.');
    console.warn('[Server] Register manually:');
    console.warn(`[Server]   curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=<YOUR_URL>/api/telegram"`);
  }
});

module.exports = app;

// Trigger watcher reload