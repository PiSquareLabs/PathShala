import L from 'leaflet';
import { q, q1, run, save } from '../db/sqlite.js';
import { P, capOf, haversine, linkOf, logCase, route, school, segKm, today } from '../ui/helpers.js';

export function walkProfile(L) {
  const R = P(), pts = JSON.parse(L.route_walk || '[]');
  if (pts.length < 2) return null;
  let raw = 0; for (let i = 0; i < pts.length - 1; i++) raw += segKm(pts[i], pts[i + 1]);
  const scale = L.walk_km / raw;
  let min = 0, maxSlope = 0, steepKm = 0, dist = 0; const prof = [[0, pts[0][2]]];
  for (let i = 0; i < pts.length - 1; i++) {
    const h = segKm(pts[i], pts[i + 1]) * scale, dz = pts[i + 1][2] - pts[i][2], slope = dz / (h * 1000);
    const v = 6 * Math.exp(-3.5 * Math.abs(slope + 0.05)) * (R.child_pace || 0.75);
    min += h / v * 60; dist += h; prof.push([dist, pts[i + 1][2]]);
    maxSlope = Math.max(maxSlope, Math.abs(slope)); if (Math.abs(slope) > 0.15) steepKm += h;
  }
  return { min: Math.round(min), km: L.walk_km, climb: L.climb_m, descent: L.descent_m, maxSlope: Math.round(maxSlope * 100), steepKm: +steepKm.toFixed(1), prof, pace: R.child_pace || 0.75 };
}
/* Tool: GIS overlay — which mapped features the route passes within 150 m of. */
export function routeHazards(L, which = 'walk') {
  const pts = JSON.parse((which === 'walk' ? L.route_walk : L.route_road) || '[]').map(p => [p[0], p[1]]);
  if (!pts.length) return [];
  return q("SELECT * FROM geo_features WHERE kind IN ('bridge','steep','landslide')").filter(f => {
    const g = JSON.parse(f.geometry), fp = typeof g[0] === 'number' ? [g] : g;
    return fp.some(a => pts.some(b => segKm(a, b) < 0.15));
  });
}
/* Tool: transport availability at school times. */
export function transportAt(cid) {
  const rows = q('SELECT * FROM transport');
  const inWin = t => { const [h, m] = t.split(':').map(Number), x = h * 60 + m; return (x >= 495 && x <= 555) || (x >= 885 && x <= 945); };
  return rows.map(t => { const dep = JSON.parse(t.departures || '[]'); return Object.assign({}, t, { dep, atSchoolTime: dep.filter(inWin) }); });
}
/* Screening score for a school pair — transparent, not a recommendation. */
export function screen(a, s) {
  const d = haversine(a, s), L = linkOf(a.school_id, s.school_id);
  const road = L ? L.road_km : +(d * 1.4).toFixed(1);
  const wp = L ? walkProfile(L) : null;
  const walkMin = wp ? wp.min : Math.round(d * 1.3 / 2.4 * 60);
  const cap = capOf(s), avail = Math.max(0, cap - s.enrol_total);
  const hz = L ? routeHazards(L).length : 0;
  const parts = [
    ['Road distance', -2 * road, `${road} km × 2`],
    ['Seats available', avail < a.enrol_total ? -40 * (1 - avail / a.enrol_total) : 0, `${avail} free for ${a.enrol_total} students`],
    ['Walking time', -0.1 * Math.max(0, walkMin - 30), `${walkMin} min${wp ? '' : ' (estimate)'}; minus 0.1 per minute over 30`],
    ['Mapped hazards on route', -5 * hz, `${hz} × 5`],
  ];
  const score = Math.max(0, Math.round(100 + parts.reduce((x, p) => x + p[1], 0)));
  return { s, d, L, road, walkMin, cap, avail, hz, score, parts, est: !L };
}
export function nearby(aId, maxKm = 12) {
  const a = school(aId);
  const ok = { primary: ['primary'], middle: ['middle', 'senior'], senior: ['senior'] }[a.level_code] || [];
  return q('SELECT * FROM schools WHERE school_id != ?', [aId]).filter(s => ok.includes(s.level_code) && haversine(a, s) <= maxKm).map(s => screen(a, s)).sort((x, y) => y.score - x.score);
}

/* Policy retrieval: keyword BM25 over the policy corpus (vector search with Vertex AI later). */
export function createCase(aId, bId) {
  const ex = q1("SELECT case_id FROM cases WHERE from_id = ? AND to_id = ? AND status != 'Withdrawn'", [aId, bId]);
  if (ex) return ex.case_id;
  const n = 1 + Math.max(0, ...q('SELECT case_id FROM cases').map(x => +x.case_id.slice(1) || 0)), cid = 'C' + n;
  run('INSERT INTO cases VALUES (?,?,?,?,?,?,?)', [cid, aId, bId, 'Open', today(), null, 'DEO Kullu']);
  logCase(cid, 'Officer', 'Opened investigation', `${school(aId).name} → ${school(bId).name}`);
  save();
  return cid;
}

/* ---------- the simulated agent ---------- */
