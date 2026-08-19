'use client';
import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { fetchRequestDetail } from '../../../lib/api';
import DonorCard from '../../../components/DonorCard';
import MessageLog from '../../../components/MessageLog';

const STATUS_STYLE = {
  PENDING_INFO: { label: 'Awaiting info', color: 'text-yellow-400', bar: 'bg-yellow-400' },
  MATCHING: { label: 'Matching donors', color: 'text-blue-400', bar: 'bg-blue-400' },
  COMPLETED: { label: 'Completed', color: 'text-emerald-400', bar: 'bg-emerald-400' },
  UNFULFILLABLE: { label: 'Unfulfillable', color: 'text-red-400', bar: 'bg-red-500' },
};

function groupByWave(outreach) {
  const waves = {};
  (outreach || []).forEach(row => {
    const w = row.wave_number || 1;
    if (!waves[w]) waves[w] = [];
    waves[w].push(row);
  });
  return waves;
}

export default function RequestDetailPage() {
  const params = useParams();
  const id = params.id;

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState('donors');  // 'donors' | 'transcript'

  const load = useCallback(async () => {
    try {
      const d = await fetchRequestDetail(id);
      
      setData(d);
      setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
    const interval = setInterval(load, 3000);
    return () => clearInterval(interval);
  }, [load]);

  if (loading) return (
    <div className="text-center text-slate-600 py-24 text-sm">Loading request…</div>
  );

  if (error) return (
    <div className="card border-red-500/30 text-red-400 text-sm text-center py-12">
      {error}
    </div>
  );

  const { request, outreach, messages } = data;
  const sc = STATUS_STYLE[request.status] || STATUS_STYLE.MATCHING;
  const waves = groupByWave(outreach);
  const waveNums = Object.keys(waves).map(Number).sort((a, b) => a - b);

  const requiredDonors = (request.count || 1) * 3;
  const pct = requiredDonors > 0
    ? Math.min(100, Math.round((request.confirmed_count / requiredDonors) * 100))
    : 0;

  const confirmedRows = outreach.filter(r => ['CONFIRMED', 'RESCHEDULED'].includes(r.status));

  return (
    <div className="space-y-6">
      {/* Back */}
      <Link href="/" className="inline-flex items-center gap-1.5 text-slate-500 hover:text-slate-300 text-sm transition-colors">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        All requests
      </Link>

      {/* Request summary card */}
      <div className="card space-y-4">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-xl bg-blood/10 border border-blood/20 flex items-center justify-center">
              <span className="text-blood font-bold font-mono">{request.blood_group || '?'}</span>
            </div>
            <div>
              <h1 className="text-lg font-bold">{request.hospital || 'Unknown hospital'}</h1>
              <div className="flex items-center gap-2 mt-1">
                <span className={`text-xs font-medium ${sc.color}`}>{sc.label}</span>
                <span className="text-slate-700">·</span>
                <span className="text-xs text-slate-500">Wave {request.current_wave || 0}</span>
                <span className="text-slate-700">·</span>
                <span className="text-xs text-slate-500 capitalize">{request.urgency} urgency</span>
              </div>
            </div>
          </div>

          {/* Confirmed count */}
          <div className="text-right">
            <div className="text-3xl font-bold font-mono text-slate-100">
              {request.confirmed_count}
              <span className="text-slate-600 text-xl">/{requiredDonors}</span>
            </div>
            <div className="text-xs text-slate-500">donors confirmed ({request.count} bottle(s))</div>
          </div>
        </div>

        {/* Progress bar */}
        <div>
          <div className="flex justify-between text-xs text-slate-500 mb-1.5">
            <span>Progress</span>
            <span>{pct}%</span>
          </div>
          <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-700 ${sc.bar}`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        {/* Original message */}
        <div className="bg-slate-900 rounded-lg p-3 border border-border">
          <div className="text-xs text-slate-600 mb-1 font-mono">Original request</div>
          <p className="text-sm text-slate-300 italic">"{request.raw_input}"</p>
          <div className="text-xs text-slate-600 mt-1">from {request.requester_phone}</div>
        </div>

        {/* Completion summary */}
        {request.status === 'COMPLETED' && confirmedRows.length > 0 && (
          <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-3">
            <div className="text-xs text-emerald-400 font-medium mb-2">✅ Request fulfilled</div>
            {confirmedRows.map(row => (
              <div key={row.id} className="flex justify-between text-xs text-slate-300 py-0.5">
                <span>{row.donors?.name} · {row.donors?.neighbourhood}</span>
                {row.reschedule_time && (
                  <span className="text-blue-400">📅 {row.reschedule_time}</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Tab switcher */}
      <div className="flex gap-1 bg-card border border-border rounded-lg p-1 w-fit">
        {[
          { key: 'donors', label: `Donor waves (${outreach.length})` },
          { key: 'transcript', label: `Transcript (${messages.length})` },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-1.5 rounded-md text-xs font-medium transition-all
              ${tab === t.key
                ? 'bg-slate-700 text-slate-100'
                : 'text-slate-500 hover:text-slate-300'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* DONOR WAVES TAB */}
      {tab === 'donors' && (
        <div className="space-y-6">
          {waveNums.length === 0 && (
            <div className="card text-center py-10 text-slate-600 text-sm">
              No waves sent yet — waiting for request to complete intake
            </div>
          )}

          {waveNums.map(waveNum => {
            const donors = waves[waveNum];
            const confirmedInWave = donors.filter(d =>
              ['CONFIRMED', 'RESCHEDULED'].includes(d.status)
            ).length;

            return (
              <div key={waveNum}>
                {/* Wave header */}
                <div className="flex items-center gap-3 mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-semibold text-slate-400 uppercase tracking-widest">
                      Wave {waveNum}
                    </span>
                    <span className="text-slate-700 text-xs font-mono">
                      {confirmedInWave}/{donors.length} responded positively
                    </span>
                  </div>
                  <div className="flex-1 h-px bg-border" />
                </div>

                {/* Donor cards grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {donors.map(row => (
                    <DonorCard
                      key={row.id}
                      outreachRow={row}
                      onReplySent={load}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* TRANSCRIPT TAB */}
      {tab === 'transcript' && (
        <div className="card">
          <div className="text-xs text-slate-600 font-mono mb-4">
            Full message log · {messages.length} messages
          </div>
          <MessageLog messages={messages} />
        </div>
      )}
    </div>
  );
}
