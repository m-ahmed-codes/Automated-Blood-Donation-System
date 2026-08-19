// ============================================================
// matchingEngine.js
// Pure deterministic scoring — no LLM, fast, predictable.
// ============================================================

const supabase = require('../config/supabase');

const WAVE_SIZE              = parseInt(process.env.WAVE_SIZE || '5');
const DONATION_COOLDOWN_DAYS = 90;

// ── Haversine distance (km) ───────────────────────────────────────────────────
function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const toRad = deg => deg * (Math.PI / 180);
  const dLat  = toRad(lat2 - lat1);
  const dLng  = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Blood group compatibility mapping ─────────────────────────────────────────
// Map recipient blood group -> list of compatible donor blood groups
const COMPATIBLE_DONORS = {
  'O-':  ['O-'],
  'O+':  ['O+', 'O-'],
  'A-':  ['A-', 'O-'],
  'A+':  ['A+', 'A-', 'O+', 'O-'],
  'B-':  ['B-', 'O-'],
  'B+':  ['B+', 'B-', 'O+', 'O-'],
  'AB-': ['AB-', 'A-', 'B-', 'O-'],
  'AB+': ['AB+', 'AB-', 'A+', 'A-', 'B+', 'B-', 'O+', 'O-'],
};

function getCompatibleGroups(bloodGroup) {
  if (!bloodGroup) return [];
  const normalized = bloodGroup.toUpperCase().replace(/\s+/g, '');
  return COMPATIBLE_DONORS[normalized] || [bloodGroup];
}

// ── Scoring formula ───────────────────────────────────────────────────────────
// Score = 40 * (1 / (distance_km + 0.1)) + 20 * response_history_rate + exactMatchBonus (10)
function scoreDonor(donor, requestedBloodGroup, hospitalLat, hospitalLng) {
  const distanceKm = haversineKm(
    parseFloat(donor.latitude),
    parseFloat(donor.longitude),
    hospitalLat,
    hospitalLng
  );
  const proximityScore = 40 * (1 / (distanceKm + 0.1));
  const historyScore   = 20 * (parseFloat(donor.response_history_rate) || 0.5);

  const normalizedRequested = (requestedBloodGroup || '').toUpperCase().replace(/\s+/g, '');
  const normalizedDonor = (donor.blood_group || '').toUpperCase().replace(/\s+/g, '');
  const exactMatchBonus = (normalizedDonor === normalizedRequested) ? 10 : 0;

  return proximityScore + historyScore + exactMatchBonus;
}

// ── 90-day eligibility check ──────────────────────────────────────────────────
function isEligible(donor) {
  if (!donor.last_donation_date) return true;
  const daysSince =
    (Date.now() - new Date(donor.last_donation_date).getTime()) / (1000 * 60 * 60 * 24);
  return daysSince >= DONATION_COOLDOWN_DAYS;
}

// ── Hospital → coordinates map ────────────────────────────────────────────────
const HOSPITAL_COORDS = {
  'indus hospital':      { lat: 24.8907, lng: 67.1318 },
  'aga khan':            { lat: 24.8740, lng: 67.0779 },
  'liaquat national':    { lat: 24.8805, lng: 67.0896 },
  'jinnah hospital':     { lat: 24.8879, lng: 67.0572 },
  'civil hospital':      { lat: 24.8619, lng: 67.0218 },
  'south city hospital': { lat: 24.8238, lng: 67.0297 },
  'national medical':    { lat: 24.8754, lng: 67.0638 },
};

function resolveHospitalCoords(hospitalName) {
  if (!hospitalName) {
    console.warn('[MatchingEngine] No hospital name — defaulting to Karachi centre');
    return { lat: 24.8607, lng: 67.0104 };
  }
  const key = hospitalName.toLowerCase().trim();
  for (const [name, coords] of Object.entries(HOSPITAL_COORDS)) {
    if (key.includes(name)) return coords;
  }
  console.warn(`[MatchingEngine] Unknown hospital "${hospitalName}" — defaulting to Karachi centre`);
  return { lat: 24.8607, lng: 67.0104 };
}

// ── Main export ───────────────────────────────────────────────────────────────
/**
 * Returns up to WAVE_SIZE ranked eligible donors not yet contacted for this request.
 * @param {string} requestId
 * @param {string} bloodGroup   e.g. "B+"
 * @param {string} hospitalName e.g. "Indus Hospital"
 * @returns {Array} scored donor objects sorted descending
 */
async function getRankedDonors(requestId, bloodGroup, hospitalName) {
  console.log(`[MatchingEngine] Ranking donors — requestId=${requestId}, bloodGroup=${bloodGroup}, hospital="${hospitalName}"`);

  const compatibleGroups = getCompatibleGroups(bloodGroup);
  console.log(`[MatchingEngine] Compatible donor blood group(s) for recipient ${bloodGroup}:`, compatibleGroups);

  // 1. All donors with compatible blood groups
  const { data: donors, error: donorErr } = await supabase
    .from('donors')
    .select('*')
    .in('blood_group', compatibleGroups);

  if (donorErr) throw new Error(`Donor fetch failed: ${donorErr.message}`);
  console.log(`[MatchingEngine] ${donors.length} donor(s) found with compatible blood group(s) [${compatibleGroups.join(', ')}]`);

  // 2. Already-contacted donor IDs for this request
  const { data: contacted, error: outErr } = await supabase
    .from('outreach')
    .select('donor_id')
    .eq('request_id', requestId);

  if (outErr) throw new Error(`Outreach fetch failed: ${outErr.message}`);
  const contactedIds = new Set((contacted || []).map(r => r.donor_id));
  console.log(`[MatchingEngine] ${contactedIds.size} already contacted`);

  // 3. Hard filters: not contacted + eligible
  const eligible = donors.filter(d => {
    if (contactedIds.has(d.id)) return false;
    if (!isEligible(d)) {
      console.log(`[MatchingEngine] ⛔ ${d.name} — donated too recently, skipping`);
      return false;
    }
    return true;
  });

  console.log(`[MatchingEngine] ${eligible.length} eligible, uncontacted donor(s)`);

  if (eligible.length === 0) {
    console.warn('[MatchingEngine] No eligible donors available!');
    return [];
  }

  // 4. Score + sort descending
  const { lat: hosLat, lng: hosLng } = resolveHospitalCoords(hospitalName);
  const scored = eligible
    .map(d => ({ ...d, score: scoreDonor(d, bloodGroup, hosLat, hosLng) }))
    .sort((a, b) => b.score - a.score);

  const wave = scored.slice(0, WAVE_SIZE);
  console.log('[MatchingEngine] Wave candidates:');
  wave.forEach((d, i) =>
    console.log(`  ${i + 1}. ${d.name} (${d.blood_group}, ${d.neighbourhood}) score=${d.score.toFixed(2)}`)
  );

  return wave;
}

module.exports = { getRankedDonors, COMPATIBLE_DONORS, getCompatibleGroups };
