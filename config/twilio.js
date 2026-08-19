const twilio = require('twilio');
require('dotenv').config();

if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
  throw new Error('Missing TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN in .env');
}

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

const FROM = process.env.TWILIO_WHATSAPP_FROM;

/**
 * Sends a WhatsApp message via Twilio.
 * @param {string} to   - e.g. 'whatsapp:+923001234567'
 * @param {string} body - message text
 */
async function sendWhatsApp(to, body) {
  const msg = await client.messages.create({ from: FROM, to, body });
  console.log(`[Twilio] Sent to ${to} — SID: ${msg.sid}`);
  return msg;
}

module.exports = { sendWhatsApp };
