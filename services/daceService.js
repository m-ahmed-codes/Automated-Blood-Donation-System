const supabase = require('../config/supabase');

/**
 * Computes adaptive wave size and timeout based on historical database metrics.
 * @param {string} bloodGroup - Recipient's blood group
 * @param {string} urgency - Request urgency ('normal' or 'critical')
 * @returns {Promise<{ waveSize: number, timeoutMs: number, source: string }>}
 */
async function computeAdaptiveParams(bloodGroup, urgency) {
  const defaultSize = parseInt(process.env.WAVE_SIZE || '5', 10);
  const defaultTimeout = parseInt(process.env.WAVE_TIMEOUT_MS || '45000', 10);

  try {
    // Query historical outreach response rates
    // To keep it efficient, we query the last 100 outreach records
    const { data: outreachList, error } = await supabase
      .from('outreach')
      .select('status, sent_at, responded_at')
      .order('sent_at', { ascending: false })
      .limit(100);

    if (error || !outreachList || outreachList.length < 5) {
      // Fallback if not enough historical data
      return applyUrgencyModifiers(defaultSize, defaultTimeout, 'Default (insufficient historical data)', urgency);
    }

    let respondedCount = 0;
    let totalTimeDiffMs = 0;

    for (const record of outreachList) {
      if (record.responded_at) {
        respondedCount++;
        const sent = new Date(record.sent_at).getTime();
        const resp = new Date(record.responded_at).getTime();
        totalTimeDiffMs += Math.max(0, resp - sent);
      }
    }

    const responseRate = respondedCount / outreachList.length;
    const avgResponseTimeMs = respondedCount > 0 ? (totalTimeDiffMs / respondedCount) : defaultTimeout;

    // DACE Logic:
    // 1. High response rate -> smaller wave size to avoid donor fatigue / double bookings
    // 2. Low response rate -> larger wave size to secure required confirmations
    let adaptiveSize = defaultSize;
    if (responseRate < 0.25) {
      adaptiveSize = Math.min(10, defaultSize + 3); // low engagement: scale up
    } else if (responseRate > 0.6) {
      adaptiveSize = Math.max(3, defaultSize - 2);  // high engagement: dial down
    }

    // 3. Adaptive Timeout based on average historical speed
    // Give donors 1.5x the average speed, bound between 30s and 3mins
    let adaptiveTimeout = Math.max(30000, Math.min(180000, Math.round(avgResponseTimeMs * 1.5)));

    const source = `Historical metrics (engagement: ${(responseRate * 100).toFixed(0)}%, avg response time: ${Math.round(avgResponseTimeMs / 1000)}s)`;
    return applyUrgencyModifiers(adaptiveSize, adaptiveTimeout, source, urgency);

  } catch (err) {
    console.error('[DACE] Error calculating adaptive parameters, falling back to defaults:', err.message);
    return applyUrgencyModifiers(defaultSize, defaultTimeout, 'Default (error fallback)', urgency);
  }
}

function applyUrgencyModifiers(size, timeoutMs, source, urgency) {
  if (urgency && urgency.toLowerCase() === 'critical') {
    // Critical urgency: boost wave size by 2, cut timeout in half for rapid escalation
    return {
      waveSize: Math.min(10, size + 2),
      timeoutMs: Math.max(20000, Math.round(timeoutMs * 0.5)),
      source: `${source} + [CRITICAL URGENCY BOOST]`
    };
  }
  return { waveSize: size, timeoutMs, source };
}

module.exports = { computeAdaptiveParams };
