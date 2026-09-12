const { fetch } = require('undici');

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const toRad = deg => deg * (Math.PI / 180);
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function getRealETA(donorLat, donorLng, hospitalLat, hospitalLng) {
  const lat1 = parseFloat(donorLat);
  const lng1 = parseFloat(donorLng);
  const lat2 = parseFloat(hospitalLat);
  const lng2 = parseFloat(hospitalLng);

  if ([lat1, lng1, lat2, lng2].some(Number.isNaN)) {
    return { etaMinutes: 30, distanceKm: 0 };
  }

  const routeUrl = `https://router.project-osrm.org/route/v1/driving/${lng1},${lat1};${lng2},${lat2}?overview=false&alternatives=false`;

  try {
    const res = await fetch(routeUrl, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`OSRM status ${res.status}`);
    const data = await res.json();
    const route = data.routes && data.routes[0];
    if (!route) throw new Error('No route returned');

    const distanceKm = route.distance / 1000;
    const etaMinutes = Math.max(5, Math.round(route.duration / 60));
    return { etaMinutes, distanceKm };
  } catch (err) {
    const fallbackDistance = haversineKm(lat1, lng1, lat2, lng2);
    const etaMinutes = Math.max(10, Math.round((fallbackDistance / 28) * 60));
    return { etaMinutes, distanceKm: Number(fallbackDistance.toFixed(2)) };
  }
}

module.exports = { getRealETA, haversineKm };
