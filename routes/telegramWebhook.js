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
const { fetch, ProxyAgent } = require('undici');
const { bot, sendTelegram } = require('../config/telegram');
const supabase = require('../config/supabase');
const { handleRequesterMessage } = require('../services/intakeService');
const { logMessage } = require('../services/logService');

async function downloadTelegramPhoto(message) {
  const photo = message.photo && message.photo.length ? message.photo[message.photo.length - 1] : null;
  if (!photo) return null;

  try {
    let fileLink = null;

    try {
      const file = await bot.getFile(photo.file_id);
      if (file && file.file_path) {
        fileLink = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${file.file_path}`;
      }
    } catch (fileErr) {
      console.warn('[TelegramWebhook] getFile failed:', fileErr.message);
    }

    if (!fileLink) {
      fileLink = await bot.getFileLink(photo.file_id);
    }

    if (!fileLink) {
      console.warn('[TelegramWebhook] No Telegram file URL available for this photo.');
      return null;
    }

    const fetchOptions = {};
    if (process.env.TELEGRAM_PROXY) {
      const agent = new ProxyAgent({ uri: process.env.TELEGRAM_PROXY });
      fetchOptions.dispatcher = agent;
    }

    const res = await fetch(fileLink, fetchOptions);
    if (!res.ok) throw new Error(`Telegram photo fetch failed: ${res.status}`);
    const arrayBuffer = await res.arrayBuffer();
    if (!arrayBuffer || arrayBuffer.byteLength === 0) return null;
    const buffer = Buffer.from(arrayBuffer);
    return buffer;
  } catch (err) {
    console.warn('[TelegramWebhook] Failed to download photo:', err.message);
    return null;
  }
}

router.post('/', async (req, res) => {
  res.sendStatus(200);

  try {
    const update = req.body;
    const message = update && update.message;
    if (!message) return;

    const chatId = message.chat.id;
    const text = (message.text || '').trim();
    const name = message.from && message.from.first_name ? message.from.first_name : 'Unknown';
    const username = message.from && message.from.username ? message.from.username : '';
    const adminChatId = process.env.ADMIN_TELEGRAM_CHAT_ID ? String(process.env.ADMIN_TELEGRAM_CHAT_ID) : null;

    if (text.startsWith('/approve ') || text.startsWith('/reject ')) {
      if (!adminChatId || String(chatId) !== String(adminChatId)) {
        return;
      }

      const [cmd, requestId] = text.split(/\s+/);
      if (!requestId) return;

      const nextStatus = cmd === '/approve' ? 'MATCHING' : 'UNFULFILLABLE';
      const followUp = cmd === '/approve' ? null : 'Rejected by admin review.';
      await supabase.from('requests').update({ status: nextStatus, follow_up_question: followUp }).eq('id', requestId);
      await sendTelegram(chatId, `Request ${requestId} marked as ${nextStatus}.`);
      return;
    }

    if (text === '/start') {
      await sendTelegram(chatId, "👋 *Welcome to Emergency Blood Router!*\n\nPlease send your request (e.g., *'Need 2 bottles of O+ at Civil Hospital urgently'*).\n\nIf you need verification, attach a clear requisition image.");
      return;
    }

    if (message.photo) {
      const imageBuffer = await downloadTelegramPhoto(message);
      const normalised = {
        From: `telegram:${chatId}`,
        Body: text || 'Requisition photo upload',
        ProfileName: username ? `${name} (@${username})` : name,
      };

      await logMessage({ phone: normalised.From, direction: 'inbound', body: '[image upload]' });
      await handleRequesterMessage(normalised.From, normalised.Body, imageBuffer);
      return;
    }

    if (!text) {
      console.log('[TelegramWebhook] Non-text update received, ignoring.');
      return;
    }

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

    await logMessage({ phone: normalised.From, direction: 'inbound', body: text });
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