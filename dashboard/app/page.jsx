'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { fetchRequests } from '../lib/api';

const STATUS_STYLE = {
  PENDING_INFO:     { dot: 'bg-yellow-400', label: 'text-yellow-400', text: 'Awaiting info' },
  PENDING_VERIFICATION: { dot: 'bg-amber-400 animate-pulse', label: 'text-amber-300', text: 'Pending OCR' },
  PENDING_APPROVAL: { dot: 'bg-orange-500 animate-pulse', label: 'text-orange-400', text: 'Pending Approval' },
  MATCHING:         { dot: 'bg-blue-400 animate-pulse', label: 'text-blue-400', text: 'Matching donors' },
  COMPLETED:        { dot: 'bg-emerald-400', label: 'text-emerald-400', text: 'Completed' },
  UNFULFILLABLE:    { dot: 'bg-red-500', label: 'text-red-400', text: 'Unfulfillable' },
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
  const [filter, setFilter] = useState('ALL');
  const [query, setQuery] = useState('');

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
  const pending   = requests.filter(r => ['PENDING_INFO', 'PENDING_VERIFICATION', 'PENDING_APPROVAL'].includes(r.status));
  const completed = requests.filter(r => ['COMPLETED', 'UNFULFILLABLE'].includes(r.status));
  const filtered = requests.filter(r => {
    const matchesFilter = filter === 'ALL' || r.status === filter;
    const haystack = `${r.hospital || ''} ${r.blood_group || ''} ${r.raw_input || ''}`.toLowerCase();
    return matchesFilter && haystack.includes(query.toLowerCase());
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="signal-label text-blood">Live dispatch log</div>
          <h1 className="text-2xl font-bold tracking-tight mt-1">Emergency Blood Command Center</h1>
          <p className="text-slate-500 text-sm mt-1">Triage, verification, and donor outreach in one operational view.</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500 font-mono bg-card border border-border rounded-lg px-3 py-2">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          live · 3s polling
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Active requests',  value: active.length,    color: 'text-blue-400' },
          { label: 'Pending OCR / review', value: pending.length, color: 'text-amber-400' },
          { label: 'Fulfilled / closed', value: completed.length, color: 'text-emerald-400' },
          { label: 'Requests in queue', value: requests.length, color: 'text-slate-200' },
        ].map(s => (
          <div key={s.label} className="card relative overflow-hidden">
            <div className={`text-3xl font-bold font-mono ${s.color}`}>{String(s.value).padStart(2, '0')}</div>
            <div className="text-slate-500 text-xs mt-1">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="command-grid">
        <section className="panel queue-panel">
          <div className="panel-heading"><div><span className="signal-label text-slate-500">01 / intake</span><h2>Request queue</h2></div><span className="font-mono text-xs text-slate-500">{filtered.length}/{requests.length}</span></div>
          <div className="flex flex-col sm:flex-row gap-2 mb-3"><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search hospital, group, request..." className="field flex-1" /><select value={filter} onChange={e => setFilter(e.target.value)} className="field sm:w-44"><option value="ALL">All signals</option><option value="MATCHING">Matching</option><option value="PENDING_VERIFICATION">Pending OCR</option><option value="PENDING_APPROVAL">Review required</option><option value="COMPLETED">Completed</option></select></div>
          {loading && <div className="empty-state">Loading live queue...</div>}
          {error && <div className="empty-state text-red-400">Backend unreachable on port 3001.</div>}
          {!loading && filtered.length === 0 && <div className="empty-state">No requests match this filter.</div>}
          <div className="queue-list">{filtered.map(req => { const s = STATUS_STYLE[req.status] || STATUS_STYLE.PENDING_INFO; const requiredDonors = (req.count || 1) * 3; const pct = Math.min(100, Math.round(((req.confirmed_count || 0) / requiredDonors) * 100)); return <Link key={req.id} href={`/request/${req.id}`} className="queue-row group"><div className="queue-index">{String(req.id).padStart(4, '0')}</div><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><span className="font-semibold text-sm truncate">{req.blood_group || '?'} · {req.hospital || 'Hospital TBD'}</span><span className={`signal-label ${s.label}`}>{s.text}</span></div><div className="text-xs text-slate-500 truncate mt-1">{req.raw_input}</div>{req.status === 'MATCHING' && <div className="mt-2 flex items-center gap-2"><div className="progress-track"><div className="progress-fill" style={{ width: `${pct}%` }} /></div><span className="font-mono text-[10px] text-slate-500">{req.confirmed_count || 0}/{requiredDonors}</span></div>}</div><div className={`urgency-mark ${req.urgency === 'critical' ? 'text-blood' : req.urgency === 'high' ? 'text-amber-400' : 'text-slate-600'}`}>●</div><span className="text-slate-700 group-hover:text-slate-300">›</span></Link>; })}</div>
        </section>
        <section className="panel map-panel"><div className="panel-heading"><div><span className="signal-label text-blue-400">02 / logistics</span><h2>Operational map</h2></div><span className="badge bg-blue-400/10 text-blue-300 border border-blue-400/20">Karachi region</span></div><div className="map-stage"><div className="map-grid" /><div className="map-ring ring-one" /><div className="map-ring ring-two" /><div className="map-ring ring-three" /><div className="map-hospital"><span /> HOSPITAL TARGET</div><div className="map-pin pin-a">A</div><div className="map-pin pin-b">B</div><div className="map-pin pin-c">C</div><div className="route route-a" /><div className="route route-b" /><div className="map-legend"><span><i className="bg-blood" />Critical</span><span><i className="bg-blue-400" />Route</span><span><i className="bg-emerald-400" />Confirmed</span></div></div><div className="grid grid-cols-3 gap-2 mt-3 text-center"><div className="telemetry"><span>WAVE RADIUS</span><strong>5.0 km</strong></div><div className="telemetry"><span>FASTEST ETA</span><strong>-- min</strong></div><div className="telemetry"><span>ROUTES</span><strong>OSRM / fallback</strong></div></div></section>
        <section className="panel telemetry-panel"><div className="panel-heading"><div><span className="signal-label text-emerald-400">03 / response</span><h2>Wave telemetry</h2></div><span className="font-mono text-xs text-slate-500">AUTO</span></div><div className="telemetry-stack"><div className="telemetry-block"><span>Current wave</span><strong>{active[0]?.current_wave || 0}<small>/ 3</small></strong></div><div className="telemetry-block"><span>Target ratio</span><strong>3<small>:1</small></strong></div><div className="telemetry-block"><span>Dispatch mode</span><strong className="text-emerald-400">{active.length ? 'ACTIVE' : 'STANDBY'}</strong></div></div><div className="status-note"><span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" /> ETA appears on donor confirmation; routes use donor coordinates and hospital lookup.</div></section>
      </div>
    </div>
  );
}
