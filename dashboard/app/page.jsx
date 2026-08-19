'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { fetchRequests } from '../lib/api';

const STATUS_STYLE = {
  PENDING_INFO:  { dot: 'bg-yellow-400', label: 'text-yellow-400', text: 'Awaiting info' },
  MATCHING:      { dot: 'bg-blue-400 animate-pulse', label: 'text-blue-400', text: 'Matching donors' },
  COMPLETED:     { dot: 'bg-emerald-400', label: 'text-emerald-400', text: 'Completed' },
  UNFULFILLABLE: { dot: 'bg-red-500', label: 'text-red-400', text: 'Unfulfillable' },
};

const URGENCY_STYLE = {
  critical: 'text-red-400 bg-red-400/10 border-red-400/20',
  high:     'text-orange-400 bg-orange-400/10 border-orange-400/20',
  normal:   'text-slate-400 bg-slate-400/10 border-slate-400/20',
  low:      'text-slate-500 bg-slate-500/10 border-slate-500/20',
};

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function HomePage() {
  const [requests, setRequests] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState(null);

  async function load() {
    try {
      const data = await fetchRequests();
      setRequests(data);
      setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const id = setInterval(load, 3000);
    return () => clearInterval(id);
  }, []);

  const active    = requests.filter(r => r.status === 'MATCHING');
  const pending   = requests.filter(r => r.status === 'PENDING_INFO');
  const completed = requests.filter(r => ['COMPLETED', 'UNFULFILLABLE'].includes(r.status));

  return (
    <div>
      {/* Page header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Outreach Console</h1>
          <p className="text-slate-500 text-sm mt-1">
            Simulating donor responses for Al-Khidmat blood network
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500 font-mono bg-card border border-border rounded-lg px-3 py-2">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          live · polling every 3s
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        {[
          { label: 'Active requests',  value: active.length,    color: 'text-blue-400' },
          { label: 'Awaiting info',    value: pending.length,   color: 'text-yellow-400' },
          { label: 'Resolved today',   value: completed.length, color: 'text-emerald-400' },
        ].map(s => (
          <div key={s.label} className="card text-center">
            <div className={`text-3xl font-bold font-mono ${s.color}`}>{s.value}</div>
            <div className="text-slate-500 text-xs mt-1">{s.label}</div>
          </div>
        ))}
      </div>

      {loading && (
        <div className="text-center text-slate-600 py-16 text-sm">Loading requests…</div>
      )}

      {error && (
        <div className="card border-red-500/30 text-red-400 text-sm text-center py-8">
          Backend unreachable — is your Express server running on port 3001?
        </div>
      )}

      {/* Request list */}
      {!loading && requests.length === 0 && (
        <div className="card text-center py-16">
          <div className="text-4xl mb-3">🩸</div>
          <div className="text-slate-400 text-sm">No requests yet</div>
          <div className="text-slate-600 text-xs mt-1">
            Send a message to your Telegram bot to create one
          </div>
        </div>
      )}

      <div className="space-y-3">
        {requests.map(req => {
          const s = STATUS_STYLE[req.status] || STATUS_STYLE.PENDING_INFO;
          const u = URGENCY_STYLE[req.urgency] || URGENCY_STYLE.normal;
          const requiredDonors = (req.count || 1) * 3;
          const pct = requiredDonors > 0
            ? Math.min(100, Math.round((req.confirmed_count / requiredDonors) * 100))
            : 0;

          return (
            <Link
              key={req.id}
              href={`/request/${req.id}`}
              className="card flex items-center gap-5 hover:border-slate-600 transition-colors cursor-pointer group block"
            >
              {/* Blood group badge */}
              <div className="w-14 h-14 rounded-lg bg-blood/10 border border-blood/20 flex items-center justify-center flex-shrink-0">
                <span className="text-blood font-bold text-sm font-mono">{req.blood_group || '?'}</span>
              </div>

              {/* Main info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-medium text-sm truncate">{req.hospital || 'Hospital TBD'}</span>
                  <span className={`badge border ${u}`}>{req.urgency || 'normal'}</span>
                </div>
                <div className="text-slate-500 text-xs truncate">{req.raw_input}</div>

                {/* Progress bar */}
                {req.status === 'MATCHING' && (
                  <div className="mt-2 flex items-center gap-2">
                    <div className="flex-1 h-1 bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blood rounded-full transition-all duration-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="text-xs font-mono text-slate-400">
                      {req.confirmed_count}/{requiredDonors}
                    </span>
                  </div>
                )}
              </div>

              {/* Status + time */}
              <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                <div className="flex items-center gap-1.5">
                  <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
                  <span className={`text-xs font-medium ${s.label}`}>{s.text}</span>
                </div>
                <span className="text-xs text-slate-600">{timeAgo(req.created_at)}</span>
                <span className="text-xs text-slate-700">Wave {req.current_wave || 0}</span>
              </div>

              <svg className="w-4 h-4 text-slate-700 group-hover:text-slate-500 transition-colors flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
