const supabase = require('../config/supabase');

function getTimeBucket(dateLike = new Date()) {
  const d = new Date(dateLike);
  const hour = d.getHours();
  if (hour >= 0 && hour < 6) return 'NIGHT';
  if (hour >= 18 && hour <= 23) return 'EVENING';
  return 'DAY';
}

function applyPolicy(base, urgency, bucket) {
  const lowerUrgency = (urgency || 'normal').toLowerCase();
  const bucketKey = bucket || 'DAY';

  if (lowerUrgency === 'critical') {
    if (bucketKey === 'NIGHT') {
      return { waveSize: 15, waveTimeoutMs: 20000, bufferRatio: 5 };
    }
    return { waveSize: 8, waveTimeoutMs: 30000, bufferRatio: 4 };
  }

  return { waveSize: base.waveSize, waveTimeoutMs: base.waveTimeoutMs, bufferRatio: base.bufferRatio };
}

async function computeWaveParams({ urgency = 'normal', createdAt = new Date(), bloodGroup = 'O+' } = {}) {
  const bucket = getTimeBucket(createdAt);
  const base = {
    waveSize: 3,
    waveTimeoutMs: 5 * 60 * 1000,
    bufferRatio: 2,
  };

  let scarcity = 0.5;
  try {
    const blood = (bloodGroup || '').toUpperCase().replace(/\s+/g, '');
    const { data: donorRows, error: donorErr } = await supabase
      .from('donors')
      .select('id, last_donation_date')
      .eq('blood_group', blood);

    if (!donorErr && donorRows) {
      const eligible = donorRows.filter((d) => {
        if (!d.last_donation_date) return true;
        const days = (Date.now() - new Date(d.last_donation_date).getTime()) / (1000 * 60 * 60 * 24);
        return days >= 90;
      }).length;
      scarcity = donorRows.length > 0 ? eligible / donorRows.length : 0.2;
    }
  } catch (err) {
    console.warn('[ContextEngine] Scarcity check failed, using default scarcity:', err.message);
  }

  const policy = applyPolicy(base, urgency, bucket);
  let waveSize = policy.waveSize;
  let waveTimeoutMs = policy.waveTimeoutMs;
  let bufferRatio = policy.bufferRatio;

  if (scarcity < 0.25) {
    waveSize += 3;
    waveTimeoutMs = Math.max(15000, Math.min(30000, waveTimeoutMs - 5000));
    bufferRatio = Math.max(bufferRatio, 3);
  } else if (scarcity > 0.7) {
    waveSize = Math.max(3, waveSize - 1);
    waveTimeoutMs = Math.min(300000, waveTimeoutMs + 60000);
  }

  const reasoning = `${(urgency || 'normal').toLowerCase()} + ${bucket.toLowerCase()} + scarcity=${scarcity.toFixed(2)} → wave ${base.waveSize}->${waveSize}, timeout ${base.waveTimeoutMs}→${waveTimeoutMs}, buffer ${base.bufferRatio}:1→${bufferRatio}:1`;

  return {
    waveSize,
    waveTimeoutMs,
    bufferRatio,
    reasoning,
    timeBucket: bucket,
    scarcity,
  };
}

module.exports = { computeWaveParams, getTimeBucket };
