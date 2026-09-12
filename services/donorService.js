// ============================================================
// donorService.js
// Handles ALL inbound replies from donors.
// Called by webhook router when an open outreach row
// exists for the incoming phone number.
// ============================================================

const supabase = require('../config/supabase');
const { parseDonorIntent } = require('./geminiService');
const { cancelTimer } = require('./waveManager');
const { sendToRequester } = require('./intakeService');
const { logMessage } = require('./logService');
const { getRealETA } = require('./logisticsAgent');
const { resolveHospitalCoords } = require('./matchingEngine');

// ── Entry point ───────────────────────────────────────────────────────────────
async function handleDonorReply({ from, body, outreachRow }) {
  console.log(`\n[DonorService] 💬 Donor reply from ${from} (outreach ${outreachRow.id}): "${body}"`);

  // Log inbound
  await logMessage({
    phone: from,
    direction: 'inbound',
    body,
    requestId: outreachRow.request_id,
    donorId: outreachRow.donor_id,
  });

  // Guard: if this outreach is already resolved (shouldn't happen often), ignore
  if (['CONFIRMED', 'DECLINED', 'RESCHEDULED', 'INELIGIBLE'].includes(outreachRow.status)) {
    console.log(`[DonorService] Outreach already ${outreachRow.status} — ignoring duplicate reply.`);
    await reply(from, `شکریہ! Your response was already recorded. جزاکاللہ`, outreachRow.request_id, outreachRow.donor_id);
    return;
  }

  // Check if request is already completed
  const { data: request } = await supabase
    .from('requests')
    .select('*')
    .eq('id', outreachRow.request_id)
    .single();

  if (!request) return;

  if (['COMPLETED', 'UNFULFILLABLE'].includes(request.status)) {
    console.log(`[DonorService] Request ${request.id} already ${request.status}. Thanking late responder.`);
    await reply(
      from,
      `شکریہ for your willingness to help! The request has already been fulfilled. جزاکاللہ خیر`,
      request.id,
      outreachRow.donor_id
    );
    return;
  }

  // Classify the reply
  const intent = await parseDonorIntent(body);

  switch (intent.intent) {
    case 'confirm':
      await handleConfirm(from, outreachRow, request, intent);
      break;
    case 'decline':
      await handleDecline(from, outreachRow, request, intent);
      break;
    case 'reschedule':
      await handleReschedule(from, outreachRow, request, intent);
      break;
    case 'eligibility_update':
      await handleEligibilityUpdate(from, outreachRow, request, intent);
      break;
    case 'unclear':
      await handleUnclear(from, outreachRow, request, intent);
      break;
    default:
      console.warn(`[DonorService] Unknown intent: ${intent.intent}`);
  }
}

// ── CONFIRM ───────────────────────────────────────────────────────────────────
// async function handleConfirm(from, outreachRow, request, intent) {
//   console.log(`[DonorService] ✅ CONFIRM from donor ${from}`);

//   await supabase.from('outreach').update({
//     status: 'CONFIRMED',
//     responded_at: new Date().toISOString(),
//   }).eq('id', outreachRow.id);

//   // Increment confirmed_count atomically using RPC or re-fetch + update
//   const newCount = (request.confirmed_count || 0) + 1;
//   await supabase.from('requests').update({ confirmed_count: newCount }).eq('id', request.id);

//   await reply(from, `✅ شکریہ! آپ کی تصدیق ہو گئی۔ Please go to *${request.hospital}* as soon as possible. جزاکاللہ خیر`, request.id, outreachRow.donor_id);

//   console.log(`[DonorService] confirmed_count now: ${newCount}/${request.count}`);

//   // Check completion
//   if (newCount >= request.count) {
//     await completeRequest(request, newCount);
//   }
// }

async function handleConfirm(from, outreachRow, request, intent) {
  console.log(`[DonorService] ✅ CONFIRM from donor ${from}`);

  await supabase.from('outreach').update({
    status: 'CONFIRMED',
    responded_at: new Date().toISOString(),
  }).eq('id', outreachRow.id);

  const newCount = (request.confirmed_count || 0) + 1;
  await supabase.from('requests').update({ confirmed_count: newCount }).eq('id', request.id);

  const { lat, lng } = resolveHospitalCoords(request.hospital);
  const donorCoords = { lat: outreachRow.donors?.lat ?? outreachRow.donors?.latitude ?? 24.8607, lng: outreachRow.donors?.lng ?? outreachRow.donors?.longitude ?? 67.0104 };
  const eta = await getRealETA(donorCoords.lat, donorCoords.lng, lat, lng);
  const mapLink = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
  const arrivalMessage =
    `✅ شکریہ! آپ کی تصدیق ہو گئی۔ Please go to *${request.hospital}* as soon as possible.\n\n` +
    `📍 Route: ${mapLink}\n` +
    `🕒 ETA: about ${eta.etaMinutes} minutes\n\n` +
    `جزاکاللہ خیر`;

  await reply(from, arrivalMessage, request.id, outreachRow.donor_id);

  // Buffer calculation: 3 confirmed donors per bottle requested
  const requiredDonors = (request.count || 1) * 3;
  console.log(`[DonorService] confirmed_count now: ${newCount}/${requiredDonors} (Target: ${request.count} bottle(s))`);

  // Check completion against the 3:1 ratio
  if (newCount >= requiredDonors) {
    await completeRequest(request, newCount, requiredDonors);
  }
}

// ── DECLINE ───────────────────────────────────────────────────────────────────
async function handleDecline(from, outreachRow, request, intent) {
  console.log(`[DonorService] ❌ DECLINE from donor ${from}. Reason: ${intent.note}`);

  await supabase.from('outreach').update({
    status: 'DECLINED',
    responded_at: new Date().toISOString(),
  }).eq('id', outreachRow.id);

  await reply(from, `شکریہ for letting us know. جزاکاللہ خیر`, request.id, outreachRow.donor_id);
}

// ── RESCHEDULE ────────────────────────────────────────────────────────────────
// async function handleReschedule(from, outreachRow, request, intent) {
//   console.log(`[DonorService] 🕐 RESCHEDULE from donor ${from}: "${intent.reschedule_time}"`);

//   await supabase.from('outreach').update({
//     status: 'RESCHEDULED',
//     responded_at: new Date().toISOString(),
//     reschedule_time: intent.reschedule_time || 'unspecified',
//   }).eq('id', outreachRow.id);

//   // Count rescheduled toward confirmed total (flagged on dashboard)
//   const newCount = (request.confirmed_count || 0) + 1;
//   await supabase.from('requests').update({ confirmed_count: newCount }).eq('id', request.id);

//   await reply(
//     from,
//     `شکریہ! We've noted you can come *${intent.reschedule_time || 'later'}*. ` +
//     `Please go to *${request.hospital}* at that time. جزاکاللہ`,
//     request.id,
//     outreachRow.donor_id
//   );

//   // Notify requester about the scheduled donor
//   await notifyRequesterScheduled(request, intent.reschedule_time);

//   if (newCount >= request.count) {
//     await completeRequest(request, newCount);
//   }
// }

async function handleReschedule(from, outreachRow, request, intent) {
  console.log(`[DonorService] 🕐 RESCHEDULE from donor ${from}: "${intent.reschedule_time}"`);

  await supabase.from('outreach').update({
    status: 'RESCHEDULED',
    responded_at: new Date().toISOString(),
    reschedule_time: intent.reschedule_time || 'unspecified',
  }).eq('id', outreachRow.id);

  const newCount = (request.confirmed_count || 0) + 1;
  await supabase.from('requests').update({ confirmed_count: newCount }).eq('id', request.id);

  await reply(
    from,
    `شکریہ! We've noted you can come *${intent.reschedule_time || 'later'}*. ` +
    `Please go to *${request.hospital}* at that time. جزاکاللہ`,
    request.id,
    outreachRow.donor_id
  );

  await notifyRequesterScheduled(request, intent.reschedule_time);

  // Buffer calculation: 3 confirmed donors per bottle requested
  const requiredDonors = (request.count || 1) * 3;
  if (newCount >= requiredDonors) {
    await completeRequest(request, newCount, requiredDonors);
  }
}

// ── ELIGIBILITY UPDATE ────────────────────────────────────────────────────────
async function handleEligibilityUpdate(from, outreachRow, request, intent) {
  console.log(`[DonorService] 🩸 ELIGIBILITY_UPDATE from donor ${from}: ${intent.note}`);

  // Mark outreach as ineligible — do NOT increment confirmed_count
  await supabase.from('outreach').update({
    status: 'INELIGIBLE',
    responded_at: new Date().toISOString(),
  }).eq('id', outreachRow.id);

  // Update the donor record — mark as recently donated (approximate date: today)
  await supabase.from('donors').update({
    last_donation_date: new Date().toISOString().split('T')[0],
  }).eq('id', outreachRow.donor_id);

  console.log(`[DonorService] Updated donor ${outreachRow.donor_id} last_donation_date to today`);

  await reply(
    from,
    `شکریہ for letting us know! Since you recently donated, you are not eligible right now. ` +
    `We'll reach out again when you're eligible. جزاکاللہ خیر`,
    request.id,
    outreachRow.donor_id
  );
}

// ── UNCLEAR ───────────────────────────────────────────────────────────────────
async function handleUnclear(from, outreachRow, request, intent) {
  console.log(`[DonorService] ❓ UNCLEAR reply from donor ${from}: ${intent.note}`);

  // If donor is asking a question, answer it using request data
  let responseText;
  if (intent.note && intent.note.toLowerCase().includes('asking')) {
    responseText =
      `Here are the details:\n` +
      `🩸 Blood Group: *${request.blood_group}*\n` +
      `🏥 Hospital: *${request.hospital}*\n` +
      `⚡ Urgency: *${request.urgency}*\n\n` +
      `Please reply *YES* if you can help, *NO* if you cannot, or tell us when you can come.`;
  } else {
    responseText =
      `Sorry, we didn't understand your reply. Please respond with:\n` +
      `✅ *YES* — I can donate now\n` +
      `❌ *NO* — I cannot donate\n` +
      `🕐 Or tell us *when* you can come`;
  }

  // Do not change outreach status — wait for a clear reply
  await reply(from, responseText, request.id, outreachRow.donor_id);
}

// ── Complete request ──────────────────────────────────────────────────────────
// async function completeRequest(request, finalCount) {
//   console.log(`[DonorService] 🎉 Request ${request.id} COMPLETED! (${finalCount}/${request.count})`);

//   await supabase.from('requests').update({ status: 'COMPLETED' }).eq('id', request.id);

//   // Cancel the escalation timer so Wave N+1 doesn't fire
//   cancelTimer(request.id);

//   // Build final summary
//   const { data: confirmedOutreach } = await supabase
//     .from('outreach')
//     .select('*, donors(name, neighbourhood)')
//     .eq('request_id', request.id)
//     .in('status', ['CONFIRMED', 'RESCHEDULED']);

//   let donorList = (confirmedOutreach || [])
//     .map((o, i) => {
//       const time = o.status === 'RESCHEDULED' ? ` (${o.reschedule_time})` : '';
//       return `${i + 1}. ${o.donors?.name} — ${o.donors?.neighbourhood}${time}`;
//     })
//     .join('\n');

//   const summaryMsg =
//     `🎉 *Al-Khidmat Blood Update*\n\n` +
//     `✅ All *${request.count} x ${request.blood_group}* donors confirmed for *${request.hospital}*!\n\n` +
//     `*Confirmed Donors:*\n${donorList}\n\n` +
//     `Please be at the hospital to receive them. جزاکاللہ خیر`;

//   try {
//     await sendToRequester(request.requester_phone, summaryMsg, request.id);
//   } catch (err) {
//     console.warn('[DonorService] Failed to send completion message to requester:', err.message);
//   }
//   await logMessage({ phone: request.requester_phone, direction: 'outbound', body: summaryMsg, requestId: request.id });
// }


async function completeRequest(request, finalCount, requiredDonors) {
  console.log(`[DonorService] 🎉 Request ${request.id} COMPLETED! (${finalCount}/${requiredDonors} donors confirmed for ${request.count} bottle(s))`);

  await supabase.from('requests').update({ status: 'COMPLETED' }).eq('id', request.id);

  // Cancel the escalation timer so Wave N+1 doesn't fire
  cancelTimer(request.id);

  // Build final summary
  const { data: confirmedOutreach } = await supabase
    .from('outreach')
    .select('*, donors(name, neighbourhood)')
    .eq('request_id', request.id)
    .in('status', ['CONFIRMED', 'RESCHEDULED']);

  let donorList = (confirmedOutreach || [])
    .map((o, i) => {
      const time = o.status === 'RESCHEDULED' ? ` (${o.reschedule_time})` : '';
      return `${i + 1}. ${o.donors?.name} — ${o.donors?.neighbourhood}${time}`;
    })
    .join('\n');

  const summaryMsg =
    `🎉 *Al-Khidmat Blood Update*\n\n` +
    `✅ We have secured *${finalCount} confirmed donors* for your request of *${request.count} bottle(s) of ${request.blood_group}* at *${request.hospital}*!\n\n` +
    `*Confirmed Donors:*\n${donorList}\n\n` +
    `Please be at the hospital to receive them. جزاکاللہ خیر`;

  try {
    await sendToRequester(request.requester_phone, summaryMsg, request.id);
  } catch (err) {
    console.warn('[DonorService] Failed to send completion message to requester:', err.message);
  }
  await logMessage({ phone: request.requester_phone, direction: 'outbound', body: summaryMsg, requestId: request.id });
}

// ── Notify requester of a scheduled donor ────────────────────────────────────
async function notifyRequesterScheduled(request, rescheduleTime) {
  const msg =
    `📅 Update: One donor can come *${rescheduleTime || 'later'}*. ` +
    `We're still confirming more. شکریہ`;
  try {
    await sendToRequester(request.requester_phone, msg, request.id);
  } catch (err) {
    console.warn('[DonorService] Failed to notify requester of schedule:', err.message);
  }
  await logMessage({ phone: request.requester_phone, direction: 'outbound', body: msg, requestId: request.id });
}

// ── Helper: send + log reply to donor ────────────────────────────────────────
async function reply(to, text, requestId, donorId) {
  try {
    await sendToRequester(to, text, requestId);
  } catch (err) {
    console.warn(`[DonorService] Twilio send failed to ${to}:`, err.message);
  }
  await logMessage({ phone: to, direction: 'outbound', body: text, requestId, donorId });
}

module.exports = { handleDonorReply };
