function distanceM(lat1, lng1, lat2, lng2) {
  const R = 6371000, t = Math.PI / 180;
  const dLat = (lat2 - lat1) * t, dLng = (lng2 - lng1) * t;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * t) * Math.cos(lat2 * t) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(x)));
}
const distLabel = (m) => (m == null ? "—" : m < 1000 ? `${m} m` : `${(m / 1000).toFixed(1)} km`);
function nearestSite(sites, lat, lng) {
  if (!sites || !sites.length) return null;
  let best = null;
  sites.forEach((s) => {
    const d = distanceM(lat, lng, s.lat, s.lng);
    if (!best || d < best.dist) best = { site: s, dist: d, inside: d <= (s.radius || 200) };
  });
  return best;
}
function getPosition() {
  return new Promise((resolve) => {
    const nav = (typeof window !== "undefined" && window.navigator) || (typeof navigator !== "undefined" ? navigator : null);
    if (!nav || !nav.geolocation) return resolve({ error: "unsupported" });
    let done = false;
    const finish = (v) => { if (!done) { done = true; resolve(v); } };
    try {
      nav.geolocation.getCurrentPosition(
        (p) => finish({ lat: p.coords.latitude, lng: p.coords.longitude, acc: Math.round(p.coords.accuracy || 0) }),
        (e) => finish({ error: e && e.code === 1 ? "denied" : "unavailable" }),
        { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
      );
    } catch (e) { finish({ error: "unavailable" }); }
    setTimeout(() => finish({ error: "timeout" }), 13000);
  });
}
const locErrLabel = (e) => e === "denied" ? "Location permission denied"
  : e === "unsupported" ? "This device can't share location"
  : e === "timeout" ? "Location took too long" : "Location unavailable";
function stampLocation(sites, pos) {
  if (pos.error) return { error: pos.error };
  const n = nearestSite(sites, pos.lat, pos.lng);
  return { lat: +pos.lat.toFixed(6), lng: +pos.lng.toFixed(6), acc: pos.acc, siteId: n?.site.id || "", siteName: n?.site.name || "", dist: n?.dist ?? null, inside: n?.inside ?? false };
}

export { distanceM, distLabel, nearestSite, getPosition, locErrLabel, stampLocation };
