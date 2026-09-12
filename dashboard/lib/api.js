// lib/api.js — all backend calls go through here

const BASE = '/api';   // proxied to http://localhost:3001 via next.config.js

export async function fetchRequests() {
  const res = await fetch(`${BASE}/dashboard/requests`, { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to fetch requests');
  return res.json();
}

export async function fetchRequestDetail(id) {
  const res = await fetch(`${BASE}/dashboard/requests/${id}`, { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to fetch request detail');
  return res.json();
}

export async function fetchPendingOutreach(requestId) {
  const url = requestId
    ? `${BASE}/dashboard/outreach/pending?request_id=${requestId}`
    : `${BASE}/dashboard/outreach/pending`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to fetch pending outreach');
  return res.json();
}

/**
 * Simulate a donor reply by POSTing to the main webhook.
 * The backend routes it through Gemini classification + donorService
 * exactly as if the donor texted via WhatsApp.
 *
 * @param {string} donorPhone  e.g. "whatsapp:+92300000001"
 * @param {string} donorName   for ProfileName
 * @param {string} body        the message text (from button or free-text)
 */
export async function simulateDonorReply(donorPhone, donorName, body) {
  const res = await fetch(`${BASE}/webhook`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({
      From:        donorPhone,
      Body:        body,
      ProfileName: donorName,
    }),
  });
  if (!res.ok) throw new Error('Webhook POST failed');
  return res.json();
}

export async function approveRequest(id) {
  const res = await fetch(`${BASE}/dashboard/requests/${id}/approve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error('Approve POST failed');
  return res.json();
}

export async function rejectRequest(id) {
  const res = await fetch(`${BASE}/dashboard/requests/${id}/reject`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error('Reject POST failed');
  return res.json();
}

export async function fetchDonors() {
  const res = await fetch(`${BASE}/dashboard/donors`, { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to fetch donors');
  return res.json();
}
