// ============================================================
// config/telegram.js
// Telegram Bot API client using node-telegram-bot-api
//
// Setup steps:
//   1. Open Telegram, search @BotFather
//   2. Send /newbot, follow prompts, copy the token
//   3. Set TELEGRAM_BOT_TOKEN in your .env
//   4. Set your webhook:
//      GET https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://YOUR_NGROK_URL/api/telegram
//
// npm install node-telegram-bot-api
// ============================================================

const TelegramBot = require('node-telegram-bot-api').default || require('node-telegram-bot-api');
const { fetch, ProxyAgent } = require('undici');
// require('dotenv').config();

if (!process.env.TELEGRAM_BOT_TOKEN) {
  throw new Error('Missing TELEGRAM_BOT_TOKEN in .env');
}


const botOptions = {
  polling: false,
  request: {}
};

// Use proxy if configured in environment variables
if (process.env.TELEGRAM_PROXY) {
  console.log(`[Telegram] Routing traffic through proxy: ${process.env.TELEGRAM_PROXY}`);
  const agent = new ProxyAgent({ uri: process.env.TELEGRAM_PROXY });
  botOptions.request.fetch = async (url, options) => {
    return fetch(url, {
      ...options,
      dispatcher: agent
    });
  };
}

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, botOptions);

/**
 * Send a plain text message to a Telegram chat.
 * Uses Markdown parse mode so *bold* and _italic_ render correctly.
 *
 * @param {string|number} chatId  - Telegram chat_id (stored as "telegram:12345678")
 * @param {string}        text    - Message body (supports *bold*, _italic_)
 */
async function sendTelegram(chatId, text) {
  // chatId may arrive as "telegram:12345678" — strip the prefix
  const id = String(chatId).replace('telegram:', '');
  try {
    const msg = await bot.sendMessage(id, text, { parse_mode: 'Markdown' });
    console.log(`[Telegram] ✅ Sent to chat_id ${id} — message_id: ${msg.message_id}`);
    return msg;
  } catch (err) {
    console.warn(`[Telegram] Markdown send failed (${err.message}). Retrying plain text send...`);
    const msg = await bot.sendMessage(id, text);
    console.log(`[Telegram] ✅ Sent plain text to chat_id ${id} — message_id: ${msg.message_id}`);
    return msg;
  }
}

module.exports = { bot, sendTelegram };