'use client';
import { useState } from 'react';
import { simulateDonorReply } from '../lib/api';
import MessageLog from './MessageLog';

// Quick reply buttons — map to realistic Urdu/English messages
// that the Gemini classifier handles correctly
const QUICK_REPLIES = [
  {
    label: '✅ Confirm',
    message: 'haan main aa raha hoon, confirm',
    style: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20 focus:ring-emerald-500',
  },
  {
    label: '❌ Decline',
    message: 'sorry nahi aa sakta abhi',
    style: 'bg-red-500/10 border-red-500/30 text-red-400 hover:bg-red-500/20 focus:ring-red-500',
  },
  {
    label: '🕐 Tomorrow',
    message: 'kal subah aa sakta hoon, schedule kar lain',
    style: 'bg-blue-500/10 border-blue-500/30 text-blue-400 hover:bg-blue-500/20 focus:ring-blue-500',
  },
  {
    label: '🩸 Recently donated',
    message: 'maine pichle mahine khoon diya tha, abhi eligible nahi hoon',
    style: 'bg-orange-500/10 border-orange-500/30 text-orange-400 hover:bg-orange-500/20 focus:ring-orange-500',
  },
];

const STATUS_CONFIG = {
  SENT: { label: 'Awaiting reply', style: 'bg-slate-700 text-slate-300' },
  CONFIRMED: { label: 'Confirmed', style: 'bg-emerald-500/20 text-emerald-400' },
  DECLINED: { label: 'Declined', style: 'bg-red-500/20 text-red-400' },
  RESCHEDULED: { label: 'Rescheduled', style: 'bg-blue-500/20 text-blue-400' },
  INELIGIBLE: { label: 'Ineligible', style: 'bg-orange-500/20 text-orange-400' },
};

export default function DonorCard({ outreachRow, messages = [], onReplySent }) {
  const [customText, setCustomText] = useState('');
  const [sending, setSending] = useState(false);
  const [lastSent, setLastSent] = useState(null);
  const [error, setError] = useState(null);

  const donor = outreachRow.donors;
  const request = outreachRow.requests;
  const status = outreachRow.status;
  const resolved = status !== 'SENT';

  const sc = STATUS_CONFIG[status] || STATUS_CONFIG.SENT;

  async function send(body) {
    if (!body.trim() || sending) return;
    setSending(true);
    setError(null);
    try {
      await simulateDonorReply(donor.phone, donor.name, body.trim());
      setLastSent(body.trim());
      setCustomText('');
      if (onReplySent) onReplySent();
    } catch (e) {
      setError('Send failed — is the backend running?');
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send(customText);
    }
  }

  return (
    <div className={`card flex flex-col gap-3 transition-all duration-300 animate-fade-in
      ${resolved ? 'opacity-60' : ''}`}
    >
      {/* Donor header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          {/* Avatar */}
          <div className="w-9 h-9 rounded-full bg-slate-800 border border-border flex items-center justify-center
                          text-sm font-semibold text-slate-300 flex-shrink-0">
            {donor?.name?.charAt(0) || '?'}
          </div>
          <div>
            <div className="font-medium text-sm">{donor?.name || 'Unknown donor'}</div>
            <div className="text-slate-500 text-xs">{donor?.neighbourhood} · Wave {outreachRow.wave_number}</div>
          </div>
        </div>

        {/* Blood group + status */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="badge bg-blood/10 text-blood border border-blood/20">
            {donor?.blood_group}
          </span>
          <span className={`badge ${sc.style}`}>{sc.label}</span>
        </div>
      </div>

      {/* Message that was "sent" to this donor */}
      <div className="bg-slate-900 border border-border rounded-lg p-3">
        <div className="text-xs text-slate-600 mb-1.5 font-mono">Message sent to donor</div>
        <p className="text-xs text-slate-400 leading-relaxed">
          {request
            ? `🚨 ${request.urgency?.toUpperCase()} — ${request.blood_group} blood needed at ${request.hospital}. Reply YES to confirm, NO to decline, or tell us when you can come.`
            : 'Blood donation request — details in backend log'}
        </p>
      </div>

      {outreachRow.eta && (
        <div className="grid grid-cols-2 gap-2">
          <div className="telemetry"><span>ROUTE ETA</span><strong className="text-blue-300">{outreachRow.eta.etaMinutes} min</strong></div>
          <div className="telemetry"><span>DISTANCE</span><strong>{outreachRow.eta.distanceKm} km</strong></div>
        </div>
      )}

      <div className="donor-chat">
        <div className="flex items-center justify-between mb-2">
          <span className="signal-label text-slate-500">Private donor chat</span>
          <span className="text-[10px] font-mono text-slate-600">{messages.length} msg</span>
        </div>
        <MessageLog messages={messages} />
      </div>

      {/* Last sent confirmation */}
      {lastSent && (
        <div className="text-xs text-slate-500 italic flex items-center gap-1.5">
          <span className="text-emerald-500">✓</span>
          Sent: "{lastSent}"
        </div>
      )}

      {/* Response area — only show if SENT (not yet resolved) */}
      {!resolved && (
        <div className="space-y-2.5">
          {/* Quick reply buttons */}
          <div className="grid grid-cols-2 gap-1.5">
            {QUICK_REPLIES.map(qr => (
              <button
                key={qr.label}
                onClick={() => send(qr.message)}
                disabled={sending}
                className={`btn border text-left ${qr.style}`}
              >
                {qr.label}
              </button>
            ))}
          </div>

          {/* Free text input */}
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <textarea
                rows={2}
                value={customText}
                onChange={e => setCustomText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type any reply in Urdu, Roman Urdu, or English… (Enter to send)"
                disabled={sending}
                className="w-full bg-slate-900 border border-border rounded-lg px-3 py-2
                           text-xs text-slate-200 placeholder-slate-600 resize-none
                           focus:outline-none focus:border-slate-500 transition-colors
                           disabled:opacity-50"
              />
              <div className="text-slate-700 text-xs mt-1">
                Gemini will classify this and update donor status automatically
              </div>
            </div>
            <button
              onClick={() => send(customText)}
              disabled={!customText.trim() || sending}
              className="btn border border-slate-600 text-slate-300 hover:bg-slate-700
                         hover:border-slate-500 focus:ring-slate-500 self-start mt-0.5 px-4 py-2.5"
            >
              {sending ? (
                <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                </svg>
              ) : (
                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              )}
            </button>
          </div>

          {error && (
            <div className="text-red-400 text-xs">{error}</div>
          )}
        </div>
      )}

      {/* Resolved state — show reschedule time if applicable */}
      {resolved && outreachRow.reschedule_time && (
        <div className="text-xs text-blue-400">
          📅 Scheduled for: {outreachRow.reschedule_time}
        </div>
      )}
    </div>
  );
}
