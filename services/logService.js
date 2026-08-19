// ============================================================
// logService.js
// Central logging to messages_log table.
// Every inbound and outbound message is persisted here
// so the Next.js dashboard can render a full transcript.
// ============================================================

const supabase = require('../config/supabase');

/**
 * @param {object} params
 * @param {string} params.phone       - WhatsApp number, e.g. 'whatsapp:+923...'
 * @param {'inbound'|'outbound'} params.direction
 * @param {string} params.body        - message text
 * @param {string} [params.requestId] - UUID, if known
 * @param {string} [params.donorId]   - UUID, if known
 */
async function logMessage({ phone, direction, body, requestId = null, donorId = null }) {
  const { error } = await supabase.from('messages_log').insert({
    phone,
    direction,
    body,
    request_id: requestId,
    donor_id:   donorId,
  });
  if (error) console.error('[LogService] Failed to log message:', error.message);
}

module.exports = { logMessage };
