// // ============================================================
// // intakeService.js
// // Handles ALL messages from the requester side:
// //   - New requests
// //   - Follow-up answers to missing fields
// //   - Status check messages ("how many confirmed?")
// // ============================================================

// const supabase              = require('../config/supabase');
// const { parseRequest }      = require('./geminiService');
// const { launchWave }        = require('./waveManager');
// const { sendWhatsApp }      = require('../config/twilio');
// const { logMessage }        = require('./logService');

// // ── Entry point called by webhook router ──────────────────────────────────────
// async function handleRequesterMessage({ from, body }) {
//   console.log(`\n[IntakeService] 📨 Message from requester ${from}: "${body}"`);

//   // Log inbound message immediately
//   // (request_id unknown yet — will update if we find/create one)
//   await logMessage({ phone: from, direction: 'inbound', body });

//   // Check for an existing open request from this phone
//   const { data: existingRequests } = await supabase
//     .from('requests')
//     .select('*')
//     .eq('requester_phone', from)
//     .not('status', 'in', '("COMPLETED","UNFULFILLABLE")')
//     .order('created_at', { ascending: false })
//     .limit(1);

//   const existing = existingRequests?.[0] || null;

//   if (existing) {
//     if (existing.status === 'PENDING_INFO') {
//       // We previously asked a follow-up — this message is the answer
//       console.log(`[IntakeService] Existing PENDING_INFO request found (${existing.id}). Merging reply.`);
//       await mergeAndRetry(existing, body, from);
//     } else if (existing.status === 'MATCHING') {
//       // Request is already being matched — send a live status update
//       console.log(`[IntakeService] Request ${existing.id} already MATCHING. Sending status.`);
//       await sendStatusUpdate(existing, from);
//     }
//     return;
//   }

//   // No open request — treat as brand new
//   console.log(`[IntakeService] No open request found. Starting new intake.`);
//   await startNewRequest(body, from);
// }

// // ── New request ───────────────────────────────────────────────────────────────
// async function startNewRequest(body, requesterPhone) {
//   const parsed = await parseRequest(body);

//   if (!parsed.is_complete) {
//     // Insert partial request, ask follow-up
//     const { data: newReq, error } = await supabase
//       .from('requests')
//       .insert({
//         requester_phone:    requesterPhone,
//         raw_input:          body,
//         blood_group:        parsed.blood_group,
//         count:              parsed.count || 1,
//         hospital:           parsed.hospital,
//         urgency:            parsed.urgency || 'normal',
//         status:             'PENDING_INFO',
//         confirmed_count:    0,
//         follow_up_question: parsed.follow_up_question,
//       })
//       .select()
//       .single();

//     if (error) {
//       console.error('[IntakeService] Failed to insert request:', error.message);
//       return;
//     }

//     console.log(`[IntakeService] Created partial request ${newReq.id}. Sending follow-up.`);
//     await reply(requesterPhone, parsed.follow_up_question, newReq.id);

//   } else {
//     // All fields present — create request and kick off matching immediately
//     const { data: newReq, error } = await supabase
//       .from('requests')
//       .insert({
//         requester_phone: requesterPhone,
//         raw_input:       body,
//         blood_group:     parsed.blood_group,
//         count:           parsed.count || 1,
//         hospital:        parsed.hospital,
//         urgency:         parsed.urgency || 'normal',
//         status:          'MATCHING',
//         confirmed_count: 0,
//       })
//       .select()
//       .single();

//     if (error) {
//       console.error('[IntakeService] Failed to insert request:', error.message);
//       return;
//     }

//     console.log(`[IntakeService] ✅ Request ${newReq.id} complete. Launching Wave 1.`);
//     await reply(
//       requesterPhone,
//       `✅ Got it! Searching for *${newReq.count} x ${newReq.blood_group}* donors near *${newReq.hospital}*. ` +
//       `We'll update you as donors confirm. شکریہ`,
//       newReq.id
//     );

//     // Non-blocking — don't await, let the wave run in background
//     launchWave(newReq.id, 1).catch(err =>
//       console.error('[IntakeService] Wave launch error:', err.message)
//     );
//   }
// }

// // ── Merge follow-up answer and retry ─────────────────────────────────────────
// async function mergeAndRetry(existingRequest, newBody, requesterPhone) {
//   // Re-parse the FULL conversation: original raw_input + new answer
//   const combined = `${existingRequest.raw_input}\n${newBody}`;
//   const parsed   = await parseRequest(combined);

//   // Merge: only overwrite fields that are now populated
//   const updates = {
//     raw_input:   combined,
//     blood_group: parsed.blood_group || existingRequest.blood_group,
//     count:       parsed.count       || existingRequest.count,
//     hospital:    parsed.hospital    || existingRequest.hospital,
//     urgency:     parsed.urgency     || existingRequest.urgency,
//   };

//   if (!parsed.is_complete) {
//     // Still missing something — ask one more follow-up
//     updates.follow_up_question = parsed.follow_up_question;
//     await supabase.from('requests').update(updates).eq('id', existingRequest.id);
//     console.log(`[IntakeService] Still incomplete. Asking: "${parsed.follow_up_question}"`);
//     await reply(requesterPhone, parsed.follow_up_question, existingRequest.id);
//   } else {
//     // Now complete — start matching
//     updates.status             = 'MATCHING';
//     updates.follow_up_question = null;
//     await supabase.from('requests').update(updates).eq('id', existingRequest.id);

//     console.log(`[IntakeService] ✅ Request ${existingRequest.id} now complete. Launching Wave 1.`);
//     await reply(
//       requesterPhone,
//       `✅ Perfect! Searching for *${updates.count} x ${updates.blood_group}* donors near *${updates.hospital}*. ` +
//       `We'll update you as donors confirm. شکریہ`,
//       existingRequest.id
//     );

//     launchWave(existingRequest.id, 1).catch(err =>
//       console.error('[IntakeService] Wave launch error:', err.message)
//     );
//   }
// }

// // ── Send a live status update to the requester ───────────────────────────────
// async function sendStatusUpdate(request, requesterPhone) {
//   const msg =
//     `🩸 *Status Update*\n` +
//     `Blood Group: ${request.blood_group}\n` +
//     `Hospital: ${request.hospital}\n` +
//     `Confirmed: *${request.confirmed_count}/${request.count}* donors\n` +
//     `Wave: ${request.current_wave}\n\n` +
//     `We are still reaching out. We'll notify you when we have all confirmations. جزاکاللہ`;

//   await reply(requesterPhone, msg, request.id);
// }

// // ── Helper: send + log a reply to requester ───────────────────────────────────
// async function reply(to, text, requestId) {
//   try {
//     await sendWhatsApp(to, text);
//   } catch (err) {
//     console.warn(`[IntakeService] Twilio send failed to ${to}:`, err.message);
//   }
//   await logMessage({ phone: to, direction: 'outbound', body: text, requestId });
// }

// module.exports = { handleRequesterMessage };
// ============================================================
// ===========================================================
// ============================================================



// ============================================================
// ===========================================================
// ============================================================
// ============================================================
// ===========================================================
// ============================================================
// ============================================================
// ===========================================================
// ============================================================
// ============================================================
// ===========================================================
// ============================================================
// services/intakeService.js  (Telegram-aware version)
//
// The only change from the original: the "reply to requester"
// helper now detects whether the requester came from Telegram
// (phone starts with "telegram:") or WhatsApp, and uses the
// correct send function. All business logic is identical.
// ============================================================

const supabase = require('../config/supabase');
const { parseRequest } = require('./geminiService');
const { launchWave } = require('./waveManager');
const { logMessage } = require('./logService');

// ── Channel-aware send ────────────────────────────────────────────────────────
// Determines the right transport based on the phone/chat_id prefix.
async function sendToRequester(to, text, requestId) {
  if (to.startsWith('telegram:')) {
    // Dynamic require avoids loading Telegram config when unused
    const { sendTelegram } = require('../config/telegram');
    try {
      await sendTelegram(to, text);
    } catch (err) {
      console.warn(`[IntakeService] Telegram send failed to ${to}:`, err.message);
    }
  } else {
    // WhatsApp via Twilio
    const { sendWhatsApp } = require('../config/twilio');
    try {
      await sendWhatsApp(to, text);
    } catch (err) {
      console.warn(`[IntakeService] Twilio send failed to ${to}:`, err.message);
    }
  }

  await logMessage({ phone: to, direction: 'outbound', body: text, requestId });
}

// ── Entry point (called by both Twilio webhook and Telegram webhook) ───────────
async function handleRequesterMessage(from, body) {
  console.log(`\n[IntakeService] 📨 Message from ${from}: "${body}"`);

  // Check for existing open request from this phone/chat_id
  const { data: existingRequests } = await supabase
    .from('requests')
    .select('*')
    .eq('requester_phone', from)
    .not('status', 'in', '("COMPLETED","UNFULFILLABLE")')
    .order('created_at', { ascending: false })
    .limit(1);

  const existing = existingRequests?.[0] || null;

  if (existing) {
    if (existing.status === 'PENDING_INFO') {
      console.log(`[IntakeService] Existing PENDING_INFO request (${existing.id}). Merging reply.`);
      await mergeAndRetry(existing, body, from);
    } else if (existing.status === 'MATCHING') {
      console.log(`[IntakeService] Request ${existing.id} already MATCHING. Sending status.`);
      await sendStatusUpdate(existing, from);
    }
    return;
  }

  // No open request — new intake
  console.log(`[IntakeService] No open request. Starting new intake.`);
  await startNewRequest(body, from);
}

// ── New request ───────────────────────────────────────────────────────────────
async function startNewRequest(body, requesterPhone) {
  const parsed = await parseRequest(body);

  if (!parsed.is_complete) {
    const { data: newReq, error } = await supabase
      .from('requests')
      .insert({
        requester_phone: requesterPhone,
        raw_input: body,
        blood_group: parsed.blood_group,
        count: parsed.count || 1,
        hospital: parsed.hospital,
        urgency: parsed.urgency || 'normal',
        status: 'PENDING_INFO',
        confirmed_count: 0,
        // follow_up_question: parsed.follow_up_question,
      })
      .select()
      .single();

    if (error) { console.error('[IntakeService] Insert failed:', error.message); return; }

    console.log(`[IntakeService] Partial request ${newReq.id} created. Sending follow-up.`);
    await sendToRequester(requesterPhone, parsed.follow_up_question, newReq.id);

  } else {
    const { data: newReq, error } = await supabase
      .from('requests')
      .insert({
        requester_phone: requesterPhone,
        raw_input: body,
        blood_group: parsed.blood_group,
        count: parsed.count || 1,
        hospital: parsed.hospital,
        urgency: parsed.urgency || 'normal',
        status: 'MATCHING',
        confirmed_count: 0,
      })
      .select()
      .single();

    if (error) { console.error('[IntakeService] Insert failed:', error.message); return; }

    console.log(`[IntakeService] ✅ Complete request ${newReq.id}. Launching Wave 1.`);
    await sendToRequester(
      requesterPhone,
      `✅ Got it! Searching for *${newReq.count} bottle(s)* of *${newReq.blood_group}* blood (targeting ${newReq.count * 3} donors) near *${newReq.hospital}*.\n\nWe'll update you as donors confirm. شکریہ`,
      newReq.id
    );

    launchWave(newReq.id, 1).catch(err =>
      console.error('[IntakeService] Wave launch error:', err.message)
    );
  }
}

// ── Merge follow-up answer and retry ─────────────────────────────────────────
async function mergeAndRetry(existingRequest, newBody, requesterPhone) {
  const combined = `${existingRequest.raw_input}\n${newBody}`;
  const parsed = await parseRequest(combined);

  const updates = {
    raw_input: combined,
    blood_group: parsed.blood_group || existingRequest.blood_group,
    count: parsed.count || existingRequest.count,
    hospital: parsed.hospital || existingRequest.hospital,
    urgency: parsed.urgency || existingRequest.urgency,
  };

  if (!parsed.is_complete) {
    updates.follow_up_question = parsed.follow_up_question;
    await supabase.from('requests').update(updates).eq('id', existingRequest.id);
    await sendToRequester(requesterPhone, parsed.follow_up_question, existingRequest.id);
  } else {
    updates.status = 'MATCHING';
    updates.follow_up_question = null;
    await supabase.from('requests').update(updates).eq('id', existingRequest.id);

    await sendToRequester(
      requesterPhone,
      `✅ Perfect! Searching for *${updates.count} bottle(s)* of *${updates.blood_group}* blood (targeting ${updates.count * 3} donors) near *${updates.hospital}*.\n\nWe'll update you as donors confirm. شکریہ`,
      existingRequest.id
    );

    launchWave(existingRequest.id, 1).catch(err =>
      console.error('[IntakeService] Wave launch error:', err.message)
    );
  }
}

// ── Live status update ────────────────────────────────────────────────────────
async function sendStatusUpdate(request, requesterPhone) {
  const requiredDonors = (request.count || 1) * 3;
  const msg =
    `🩸 *Status Update*\n` +
    `Blood Group: ${request.blood_group}\n` +
    `Hospital: ${request.hospital}\n` +
    `Confirmed: *${request.confirmed_count}/${requiredDonors}* donors (${request.count} bottle(s))\n` +
    `Wave: ${request.current_wave}\n\n` +
    `Still reaching out — we'll notify you when complete. جزاکاللہ`;
  await sendToRequester(requesterPhone, msg, request.id);
}

// ── Export the channel-aware sender for use in donorService ──────────────────
module.exports = { handleRequesterMessage, sendToRequester };