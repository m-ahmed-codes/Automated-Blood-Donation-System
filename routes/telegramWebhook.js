// ============================================================
// routes/telegramWebhook.js
// Receives Telegram Bot API updates via webhook.
//
// Telegram sends a POST to /api/telegram every time a user
// messages your bot. Payload shape:
// {
//   update_id: 123456789,
//   message: {
//     message_id: 1,
//     from: { id: 87654321, first_name: "Ahmed", username: "ahmedraza" },
//     chat: { id: 87654321, ... },
//     text: "need 5 O+ donors near Gulshan urgent"
//   }
// }
//
// We normalise this into { From, Body, ProfileName } — the same
// shape your intakeService already expects — so zero changes needed
// to the business logic layer.
//
// Routing: Telegram is ONLY used for requesters.
// Donors reply via the Next.js Fake Donor Console (fake webhook POSTs).
// ============================================================

const express = require('express');
const router = express.Router();
const { bot, sendTelegram } = require('../config/telegram');
const supabase = require('../config/supabase');
const { handleRequesterMessage } = require('../services/intakeService');
const { logMessage } = require('../services/logService');

router.post('/', async (req, res) => {
  // Acknowledge immediately — Telegram expects 200 within a few seconds
  res.sendStatus(200);

  try {
    const update = req.body;

    // Only handle regular text messages (ignore edits, stickers, etc.)
    if (!update.message || !update.message.text) {
      console.log('[TelegramWebhook] Non-text update received, ignoring.');
      return;
    }

    const { message } = update;
    const chatId = message.chat.id;               // numeric, e.g. 87654321
    const text = message.text.trim();
    const name = message.from.first_name || 'Unknown';
    const username = message.from.username || '';
    if (text === '/start') {
      await sendTelegram(
        chatId,
        "👋 *Welcome to Emergency Blood Router!*\n\nPlease send your request (e.g., *'Need 2 bottles of O+ at Civil Hospital urgently'*)."
      );
      return;
    }

    // Normalise to the same shape as a Twilio/Fake Console payload.
    // Prefix chat_id with "telegram:" so other services can identify the channel.
    const normalised = {
      From: `telegram:${chatId}`,
      Body: text,
      ProfileName: username ? `${name} (@${username})` : name,
    };



    console.log(`\n${'─'.repeat(60)}`);
    console.log(`[TelegramWebhook] 📥 Message from ${normalised.ProfileName}`);
    console.log(`  normalised : ${JSON.stringify(normalised)}`);
    console.log(`  chat_id : ${chatId}`);
    console.log(`  text    : "${text}"`);
    console.log(`${'─'.repeat(60)}`);

    // Log inbound message
    await logMessage({
      phone: normalised.From,
      direction: 'inbound',
      body: text,
    });

    // Hand off to the same intakeService used by the WhatsApp/webhook path
    await handleRequesterMessage(normalised.From, normalised.Body);

  } catch (err) {
    console.error('[TelegramWebhook] ❌ Error handling update:', err);
  }
});

// ── Webhook registration helper ───────────────────────────────────────────────
// Call this ONCE during server startup to tell Telegram where to send updates.
// Requires your server to be publicly reachable (ngrok or deployed URL).
async function registerWebhook(publicUrl) {

  console.log(`publicUrl ${publicUrl}`);
  const webhookUrl = `${publicUrl}/api/telegram`;
  const result = await bot.setWebhook(webhookUrl);
  console.log(`[TelegramWebhook] ✅ result ${result}`);
  if (result) {
    console.log(`[TelegramWebhook] ✅ result ${result}`);
  } else {
    console.error('[TelegramWebhook] ❌ Webhook registration failed');
  }
}

module.exports = { router, registerWebhook };