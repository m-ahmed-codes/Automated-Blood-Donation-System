// ============================================================
// routes/dashboard.js
// Read-only API endpoints consumed by the Next.js dashboard.
// No business logic here — only DB reads.
// ============================================================

const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');

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
    .select('*, donors(id, name, neighbourhood, blood_group, phone)')
    .eq('request_id', id)
    .order('wave_number', { ascending: true });

  const { data: messages } = await supabase
    .from('messages_log')
    .select('*')
    .eq('request_id', id)
    .order('created_at', { ascending: true });

  // console.log(request, outreach, messages);

  res.json({ request, outreach: outreach || [], messages: messages || [] });
});

// ── GET /api/dashboard/outreach/pending ─────────────────────────────────────
// All outreach rows with status=SENT — used by the Fake Donor Console
// to know which donors are "waiting for a reply" and should be shown
router.get('/outreach/pending', async (req, res) => {
  const { request_id } = req.query;

  let query = supabase
    .from('outreach')
    .select('*, donors(id, name, neighbourhood, blood_group, phone), requests(blood_group, hospital, urgency, count, confirmed_count)')
    .eq('status', 'SENT')
    .order('sent_at', { ascending: false });

  if (request_id) query = query.eq('request_id', request_id);

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
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

module.exports = router;
