import L from 'leaflet';
import { routeHazards, transportAt, walkProfile } from '../case/analysis.js';
import { q, q1, run } from '../db/sqlite.js';
import { classify } from '../engine/classify.js';
import { linkOf, route, school } from '../ui/helpers.js';
import { maps } from '../ui/map/baseMap.js';

export function agentPlan(cid) {
  const c = q1('SELECT * FROM cases WHERE case_id = ?', [cid]), A = school(c.from_id), B = school(c.to_id), L = linkOf(A.school_id, B.school_id);
  const ctx = {};
  return [
    { label: 'Analysed affected students', tool: 'sql.query', input: { sql: `SELECT name, children, girls, cwsn, road_connected FROM habitations WHERE school_id = '${A.school_id}'` },
      run: () => { const h = q(`SELECT name, children, girls, cwsn, road_connected FROM habitations WHERE school_id = ?`, [A.school_id]); ctx.habs = h; ctx.kids = h.reduce((a, x) => a + x.children, 0) || A.enrol_total; ctx.girls = h.reduce((a, x) => a + x.girls, 0); ctx.cwsn = h.reduce((a, x) => a + x.cwsn, 0); return h; },
      sum: () => `${ctx.kids} students across ${ctx.habs.length} habitations · ${ctx.girls} girls · ${ctx.cwsn} with a disability · ${ctx.habs.filter(h => !h.road_connected).length} habitations without a road` },
    { label: 'Checked routes', tool: 'maps.routes + terrain.profile', input: { from: A.name, to: B.name, modes: ['walk', 'drive'], pace: 'Class 1 child' },
      run: () => { ctx.wp = L ? walkProfile(L) : null; ctx.road = L ? { km: L.road_km, min: L.road_min } : null; return { walk: ctx.wp && { km: ctx.wp.km, minutes: ctx.wp.min, climb_m: ctx.wp.climb, descent_m: ctx.wp.descent, max_slope_pct: ctx.wp.maxSlope }, road: ctx.road }; },
      sum: () => ctx.wp ? `Walk ${ctx.wp.km} km, about ${ctx.wp.min} min for a young child (${ctx.wp.climb} m up, ${ctx.wp.descent} m down, slopes to ${ctx.wp.maxSlope}%) · road ${ctx.road.km} km, about ${ctx.road.min} min` : 'No route data: Data unavailable' },
    { label: 'Checked GIS layers along the route', tool: 'gis.overlay', input: { layers: ['bridges', 'steep', 'landslide'], buffer_m: 150 },
      run: () => { ctx.hz = L ? routeHazards(L) : []; ctx.rhz = L ? routeHazards(L, 'road') : []; return { walk_route: ctx.hz.map(h => h.name), road_route: ctx.rhz.map(h => h.name) }; },
      sum: () => ctx.hz.length ? `Walking route: ${ctx.hz.map(h => h.name).join(', ')}` + (ctx.rhz.length ? ` · road: ${ctx.rhz.map(h => h.name).join(', ')}` : '') : 'No mapped hazards' },
    { label: 'Checked transport', tool: 'transport.lookup', input: { window: ['08:15–09:15', '14:45–15:45'] },
      run: () => { ctx.tr = transportAt(cid); return ctx.tr.map(t => ({ name: t.name, departures: t.dep, at_school_time: t.atSchoolTime, available: t.available })); },
      sum: () => ctx.tr.map(t => t.kind === 'bus' ? `${t.name}: ${t.dep.join(', ') || '—'} (${t.atSchoolTime.length ? 'fits school time' : 'none at school time'})` : `${t.name}: Data unavailable`).join(' · ') },
    { label: 'Analysed community feedback', tool: 'feedback.search → classify (simulated Gemini)', input: { schools: [A.school_id, B.school_id], habitations: 'served by ' + A.name },
      run: () => { const f = q('SELECT theme, status, hab_id FROM citizen_feedback WHERE school_id IN (?, ?)', [A.school_id, B.school_id]); ctx.fb = f; const t = {}; f.forEach(x => { t[x.theme] ||= { n: 0, verified: 0, habs: new Set() }; t[x.theme].n++; if (x.status === 'verified') t[x.theme].verified++; t[x.theme].habs.add(x.hab_id); }); ctx.themes = t; return Object.fromEntries(Object.entries(t).map(([k, v]) => [k, { responses: v.n, verified: v.verified, habitations: v.habs.size }])); },
      sum: () => `${ctx.fb.length} responses · ` + Object.entries(ctx.themes).sort((a, b) => b[1].n - a[1].n).map(([k, v]) => `${k} ${v.n}`).join(' · ') },
    { label: 'Identified recurring concerns', tool: 'rules.recurring', input: { rule: 'theme with ≥ 10 responses or from ≥ 3 habitations' },
      run: () => { ctx.rec = Object.entries(ctx.themes).filter(([k, v]) => k !== 'Other' && (v.n >= 10 || v.habs.size >= 3)).map(([k]) => k); return ctx.rec; },
      sum: () => ctx.rec.join(', ') || 'None' },
    { label: 'Cross-checked field observations', tool: 'sql.query', input: { sql: `SELECT * FROM field_obs WHERE school_id = '${A.school_id}'` },
      run: () => { ctx.obs = q('SELECT * FROM field_obs WHERE school_id = ?', [A.school_id]); return ctx.obs.map(o => ({ id: o.obs_id, kind: o.kind, status: o.status, by: o.observed_by })); },
      sum: () => ctx.obs.map(o => `${o.kind}: ${o.status}`).join(' · ') || 'No field observations' },
    { label: 'Found evidence gaps', tool: 'evidence.gaps', input: { require: ['bridge passable in rain', 'students using route', 'transport at school times', 'travel time on the ground', 'photo or GPS'] },
      run: () => { ctx.gaps = ['Bridge passability in heavy rain', 'Students who use this route', 'Public transport at school times', 'Actual travel time in school hours', 'Photo or GPS evidence']; return ctx.gaps; },
      sum: () => `${ctx.gaps.length} gaps → targeted field questions` },
  ].map(s => Object.assign(s, { ctx, A, B, L, cid }));
}
