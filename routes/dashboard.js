// ============================================================
// routes/dashboard.js
// Read-only API endpoints consumed by the Next.js dashboard.
// No business logic here — only DB reads.
// ============================================================

const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const { launchWave } = require('../services/waveManager');
const { sendToRequester } = require('../services/intakeService');
const { getRealETA } = require('../services/logisticsAgent');
const { resolveHospitalCoords } = require('../services/matchingEngine');

async function addRouteTelemetry(rows, hospitalName) {
  const destination = resolveHospitalCoords(hospitalName);
  return Promise.all((rows || []).map(async row => {
    const donor = row.donors;
    const eta = donor?.lat != null && donor?.lng != null
      ? await getRealETA(donor.lat, donor.lng, destination.lat, destination.lng)
      : null;
    return { ...row, eta, hospital_coords: destination };
  }));
}

// ── GET /api/dashboard/requests ──────────────────────────────────────────────
// All active requests with their current status
router.get('/requests', async (req, res) => {
  const { data, error } = await supabase
    .from('requests')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// ── GET /api/dashboard/requests/:id ─────────────────────────────────────────
// Single request with full outreach + donor details
router.get('/requests/:id', async (req, res) => {
  const { id } = req.params;

  const { data: request, error: reqErr } = await supabase
    .from('requests')
    .select('*')
    .eq('id', id)
    .single();

  if (reqErr) return res.status(404).json({ error: 'Request not found' });

  const { data: outreach } = await supabase
    .from('outreach')
    .select('*, donors(id, name, neighbourhood, blood_group, phone, lat, lng)')
    .eq('request_id', id)
    .order('wave_number', { ascending: true });

  const { data: messages } = await supabase
    .from('messages_log')
    .select('*')
    .eq('request_id', id)
    .order('created_at', { ascending: true });

  // console.log(request, outreach, messages);

  const outreachWithTelemetry = await addRouteTelemetry(outreach, request.hospital);
  res.json({ request, outreach: outreachWithTelemetry, messages: messages || [] });
});

// ── GET /api/dashboard/outreach/pending ─────────────────────────────────────
// All outreach rows with status=SENT — used by the Fake Donor Console
// to know which donors are "waiting for a reply" and should be shown
router.get('/outreach/pending', async (req, res) => {
  const { request_id } = req.query;

  let query = supabase
    .from('outreach')
    .select('*, donors(id, name, neighbourhood, blood_group, phone, lat, lng), requests(blood_group, hospital, urgency, count, confirmed_count)')
    .eq('status', 'SENT')
    .order('sent_at', { ascending: false });

  if (request_id) query = query.eq('request_id', request_id);

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  const rows = await Promise.all((data || []).map(async row => {
    const destination = resolveHospitalCoords(row.requests?.hospital);
    const donor = row.donors;
    const eta = donor?.lat != null && donor?.lng != null
      ? await getRealETA(donor.lat, donor.lng, destination.lat, destination.lng)
      : null;
    return { ...row, eta, hospital_coords: destination };
  }));
  res.json(rows);
});

// ── GET /api/dashboard/donors ────────────────────────────────────────────────
router.get('/donors', async (req, res) => {
  const { data, error } = await supabase
    .from('donors')
    .select('*')
    .order('name');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// ── POST /api/dashboard/requests/:id/approve ─────────────────────────────────
router.post('/requests/:id/approve', async (req, res) => {
  const { id } = req.params;

  const { data: request, error: fetchErr } = await supabase
    .from('requests')
    .select('*')
    .eq('id', id)
    .single();

  if (fetchErr || !request) {
    return res.status(404).json({ error: 'Request not found' });
  }

  if (request.status !== 'PENDING_APPROVAL') {
    return res.status(400).json({ error: 'Request is not in PENDING_APPROVAL status' });
  }

  // Update request status to MATCHING
  const { error: updateErr } = await supabase
    .from('requests')
    .update({ status: 'MATCHING', follow_up_question: null })
    .eq('id', id);

  if (updateErr) {
    return res.status(500).json({ error: updateErr.message });
  }

  // Send approval update to requester
  await sendToRequester(
    request.requester_phone,
    `✅ Your request has been approved by our coordinator! We are initiating search waves now.`,
    id
  );

  // Trigger Wave 1
  launchWave(id, 1).catch(err => {
    console.error('[Dashboard] Wave launch failed:', err.message);
  });

  res.json({ success: true, message: 'Request approved. Wave 1 launched.' });
});

// ── POST /api/dashboard/requests/:id/reject ─────────────────────────────────
router.post('/requests/:id/reject', async (req, res) => {
  const { id } = req.params;

  const { data: request, error: fetchErr } = await supabase
    .from('requests')
    .select('*')
    .eq('id', id)
    .single();

  if (fetchErr || !request) {
    return res.status(404).json({ error: 'Request not found' });
  }

  if (request.status !== 'PENDING_APPROVAL') {
    return res.status(400).json({ error: 'Request is not in PENDING_APPROVAL status' });
  }

  // Update request status to UNFULFILLABLE
  const { error: updateErr } = await supabase
    .from('requests')
    .update({ status: 'UNFULFILLABLE', follow_up_question: 'Rejected by coordinator.' })
    .eq('id', id);

  if (updateErr) {
    return res.status(500).json({ error: updateErr.message });
  }

  // Send rejection message to requester
  await sendToRequester(
    request.requester_phone,
    `❌ Unfortunately, your request could not be verified by our coordinator. Please double check details or contact direct hotlines (e.g., Edhi 1058, Chippa 1020).`,
    id
  );

  res.json({ success: true, message: 'Request rejected. Requester notified.' });
});

module.exports = router;
