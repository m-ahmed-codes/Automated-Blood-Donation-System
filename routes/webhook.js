// ============================================================
// routes/webhook.js
// Single catch-all endpoint for:
//   - Real Twilio WhatsApp webhooks (POST /api/webhook)
//   - Next.js Fake Donor Console simulation POSTs (same URL)
//
// Routing logic:
//   1. Is there an open outreach row (status=SENT) for this phone?
//      YES → donorService (donor reply)
//      NO  → intakeService (requester message)
// ============================================================

const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const { handleRequesterMessage } = require('../services/intakeService');
const { handleDonorReply } = require('../services/donorService');

router.post('/', async (req, res) => {
  // ── 1. Parse incoming payload ────────────────────────────────────────────
  // Twilio sends: From, Body, ProfileName (among others)
  // Fake console sends the same shape so no branching needed here
  const { From, Body, ProfileName } = req.body;

  if (!From || !Body) {
    console.warn('[Webhook] ⚠️  Missing From or Body in request payload');
    return res.status(400).json({ error: 'Missing From or Body' });
  }

  const from = From.trim();
  const body = Body.trim();

  console.log(`\n${'─'.repeat(60)}`);
  console.log(`[Webhook] 📥 Incoming message`);
  console.log(`  From    : ${from}`);
  console.log(`  Name    : ${ProfileName || 'unknown'}`);
  console.log(`  Body    : "${body}"`);
  console.log(`${'─'.repeat(60)}`);

  // Respond to Twilio immediately (must be within 15s or Twilio retries)
  // All heavy work runs async after this response
  res.status(200).json({ received: true });

  try {
    // ── 2. Route: check for open outreach row ──────────────────────────────
    const { data: openOutreach, error: outErr } = await supabase
      .from('outreach')
      .select(`
    *,
    donors!inner (
      id,
      phone,
      lat,
      lng
    )
  `)
      .eq('donors.phone', from)
      .ilike('status', 'sent') // Handles both 'sent' and 'SENT'
      .order('sent_at', { ascending: false })
      .limit(1);

    if (outErr) {
      console.error('[Webhook] Outreach lookup error:', outErr.message);
      return;
    }

    if (openOutreach && openOutreach.length > 0) {
      // ── DONOR REPLY PATH ────────────────────────────────────────────────
      console.log(`[Webhook] 🔀 Routing to donorService (open outreach found: ${openOutreach[0].id})`);
      await handleDonorReply({
        from,
        body,
        outreachRow: openOutreach[0],
      });
    } else {
      // ── REQUESTER PATH ──────────────────────────────────────────────────
      console.log(`[Webhook] 🔀 Routing to intakeService (no open outreach found)`);
      await handleRequesterMessage(from, body);
    }

  } catch (err) {
    // Never let an unhandled error reach Twilio — it would trigger a retry
    console.error('[Webhook] ❌ Unhandled error in webhook handler:', err);
  }
});

module.exports = router;
