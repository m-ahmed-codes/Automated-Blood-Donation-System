// ============================================================
// waveManager.js
// Orchestrates wave dispatch and auto-escalation.
//
// Flow per wave:
//   1. Get ranked donors (matchingEngine)
//   2. Insert outreach rows (status=SENT)
//   3. Send message — SKIP real Twilio if is_test_donor=true
//   4. Start timer → on expiry, check confirmed_count
//      → if still short, launch next wave (recursive)
//      → if wave cap hit, mark UNFULFILLABLE
// ============================================================

const supabase = require('../config/supabase');
const { getRankedDonors } = require('./matchingEngine');
// const { sendWhatsApp }  = require('../config/twilio');
const { logMessage } = require('./logService');
require('dotenv').config();

const WAVE_TIMEOUT_MS = parseInt(process.env.WAVE_TIMEOUT_MS || '45000');
const MAX_WAVES = parseInt(process.env.MAX_WAVES || '3');

// Active timers keyed by requestId — lets us cancel if request completes early
const activeTimers = new Map();

// ── Build donor outreach message ──────────────────────────────────────────────
function buildDonorMessage(request) {
  const urgencyLabel = request.urgency === 'critical' ? '🚨 URGENT' : '📢 Request';
  return (
    `${urgencyLabel}: *${request.blood_group}* blood needed at *${request.hospital}*.\n\n` +
    `Please reply:\n` +
    `✅ *YES* — I can come now\n` +
    `❌ *NO* — I cannot come\n` +
    `🕐 Or tell us *when* you can come\n\n` +
    `جزاکاللہ خیر — Al-Khidmat`
  );
}

// ── Core: launch a single wave ─────────────────────────────────────────────────
async function launchWave(requestId, waveNumber) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`[WaveManager] 🌊 Launching Wave ${waveNumber} for request ${requestId}`);
  console.log(`${'='.repeat(60)}`);

  // Guard: max wave cap
  if (waveNumber > MAX_WAVES) {
    console.warn(`[WaveManager] ⛔ Max waves (${MAX_WAVES}) reached. Marking UNFULFILLABLE.`);
    await markUnfulfillable(requestId);
    return;
  }

  // Fetch request details
  const { data: request, error: reqErr } = await supabase
    .from('requests')
    .select('*')
    .eq('id', requestId)
    .single();

  if (reqErr || !request) {
    console.error(`[WaveManager] Request not found: ${reqErr?.message}`);
    return;
  }

  // Safety: don't re-launch if already completed
  if (['COMPLETED', 'UNFULFILLABLE'].includes(request.status)) {
    console.log(`[WaveManager] Request already ${request.status} — stopping.`);
    return;
  }

  // Update current_wave on the request row
  await supabase.from('requests').update({ current_wave: waveNumber, status: 'MATCHING' }).eq('id', requestId);

  // Get ranked donors for this wave
  const donors = await getRankedDonors(requestId, request.blood_group, request.hospital);

  if (donors.length === 0) {
    console.warn('[WaveManager] No eligible donors left in database. Marking UNFULFILLABLE.');
    await markUnfulfillable(requestId);
    return;
  }

  const message = buildDonorMessage(request);

  // Dispatch to each donor in the wave
  for (const donor of donors) {
    try {
      // Insert outreach row
      const { error: insertErr } = await supabase.from('outreach').insert({
        request_id: requestId,
        donor_id: donor.id,
        // donor_phone: donor.phone,
        wave_number: waveNumber,
        status: 'SENT',
        sent_at: new Date().toISOString(),
      });

      if (insertErr) {
        // Likely unique constraint violation (donor already in this request) — skip
        console.warn(`[WaveManager] Skipping ${donor.name}: ${insertErr.message}`);
        continue;
      }

      // Update donor's last_contacted_at
      await supabase.from('donors').update({ last_contacted_at: new Date().toISOString() }).eq('id', donor.id);

      // Log the outbound message
      await logMessage({
        phone: donor.phone,
        direction: 'outbound',
        body: message,
        requestId,
        donorId: donor.id,
      });

      if (donor.is_test_donor) {
        // ── SIMULATION MODE — skip real Twilio call ──────────────────────────
        console.log(`[WaveManager] 🧪 [SIMULATED] Wave ${waveNumber} message logged for test donor: ${donor.name} (${donor.phone})`);
      } else {
        // ── PRODUCTION MODE — real Twilio WhatsApp send ──────────────────────
        console.log(`[WaveManager] 📱 Sending real WhatsApp to ${donor.name} (${donor.phone})`);
        const { sendWhatsApp } = require('../config/twilio');
        await sendWhatsApp(donor.phone, message);
      }

    } catch (err) {
      console.error(`[WaveManager] Error dispatching to donor ${donor.name}:`, err.message);
      // Continue to next donor; don't abort the wave
    }
  }

  console.log(`[WaveManager] ✅ Wave ${waveNumber} dispatched to ${donors.length} donor(s).`);
  console.log(`[WaveManager] ⏱ Escalation timer set for ${WAVE_TIMEOUT_MS / 1000}s`);

  // ── Escalation timer ──────────────────────────────────────────────────────
  const timer = setTimeout(async () => {
    activeTimers.delete(requestId);
    console.log(`\n[WaveManager] ⏰ Timer expired for request ${requestId} after Wave ${waveNumber}`);
    await checkAndEscalate(requestId, waveNumber);
  }, WAVE_TIMEOUT_MS);

  // Store so we can cancel it if request completes before timeout
  activeTimers.set(requestId, timer);
}

// ── Check if target met, escalate if not ─────────────────────────────────────
async function checkAndEscalate(requestId, completedWave) {
  const { data: request, error } = await supabase
    .from('requests')
    .select('confirmed_count, count, status')
    .eq('id', requestId)
    .single();

  if (error || !request) {
    console.error('[WaveManager] Could not re-fetch request during escalation check:', error?.message);
    return;
  }

  if (['COMPLETED', 'UNFULFILLABLE'].includes(request.status)) {
    console.log(`[WaveManager] Request already ${request.status}. No escalation needed.`);
    return;
  }

  const requiredDonors = (request.count || 1) * 3;
  console.log(`[WaveManager] Post-wave check: ${request.confirmed_count}/${requiredDonors} confirmed for ${request.count} bottle(s) requested`);

  if (request.confirmed_count >= requiredDonors) {
    console.log('[WaveManager] 🎉 Target already met — skipping escalation');
    return;
  }

  // Still short — launch next wave
  console.log(`[WaveManager] 📣 Target not met (${request.confirmed_count}/${requiredDonors}). Escalating to Wave ${completedWave + 1}`);
  await launchWave(requestId, completedWave + 1);
}

// ── Cancel timer for a completed request ─────────────────────────────────────
function cancelTimer(requestId) {
  if (activeTimers.has(requestId)) {
    clearTimeout(activeTimers.get(requestId));
    activeTimers.delete(requestId);
    console.log(`[WaveManager] Timer cancelled for completed request ${requestId}`);
  }
}

// ── Mark as UNFULFILLABLE and notify requester ────────────────────────────────
async function markUnfulfillable(requestId) {
  await supabase
    .from('requests')
    .update({ status: 'UNFULFILLABLE' })
    .eq('id', requestId);

  // Fetch requester phone to send notification
  const { data: req } = await supabase
    .from('requests')
    .select('requester_phone, blood_group, confirmed_count, count')
    .eq('id', requestId)
    .single();

  if (req) {
    const requiredDonors = (req.count || 1) * 3;
    const partialMsg =
      req.confirmed_count > 0
        ? `We could only confirm ${req.confirmed_count} of ${requiredDonors} required donors for ${req.count} bottle(s).`
        : `Unfortunately, no ${req.blood_group} donors are currently available.`;

    const msg =
      `⚠️ Al-Khidmat Update:\n${partialMsg}\n\n` +
      `Please contact your nearest blood bank directly or call 1058 (Edhi Foundation).\n` +
      `We will keep trying to find more donors. جزاکاللہ`;

    try {
      const { sendToRequester } = require('./intakeService');
      await sendToRequester(req.requester_phone, msg, requestId);
    } catch (e) {
      console.warn('[WaveManager] Could not notify requester of unfulfillable status:', e.message);
    }

    await logMessage({ phone: req.requester_phone, direction: 'outbound', body: msg, requestId });
  }
}

module.exports = { launchWave, cancelTimer };
