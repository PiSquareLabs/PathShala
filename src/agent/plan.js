import { SCHOOL_WINDOWS } from '../case/analysis.js';
import { routeInfo } from '../case/options.js';
import { q1 } from '../db/sqlite.js';
import { capOf, school } from '../ui/helpers.js';
import { tools } from './tools.js';

/* The ordered steps of an investigation (the 8 steps the UI shows). Each step calls real tools.
   `label`, `tool` (display name), `input`, `summary()` and the tool output are what the UI renders.
   In LLM mode the Coordinator may choose the order; the runner still emits one UI step per tool call. */
export function agentPlan(cid) {
  const c = q1('SELECT * FROM cases WHERE case_id = ?', [cid]), A = school(c.from_id), B = school(c.to_id), rt = routeInfo(A.school_id, B.school_id), L = rt.L;
  const ctx = { cid, A, B, L, route: rt, capB: capOf(B) };
  const ids = { from_id: A.school_id, to_id: B.school_id };
  return [
    { agent: 'accessAnalyst', label: 'Analysed affected students', tool: 'sql.query', toolId: 'sql_query', input: { sql: `SELECT name, elev_m, road_connected FROM habitations WHERE school_id = '${A.school_id}'` },
      run: async () => { const { rows: h } = await tools.sql_query({ sql: `SELECT name, elev_m, road_connected FROM habitations WHERE school_id = '${A.school_id}'` }); ctx.habs = h; ctx.kids = A.enrol_total; return h; },
      sum: () => `${ctx.kids} students on roll (${A.enrol_primary} in Classes 1–5${A.enrol_preprimary ? `, ${A.enrol_preprimary} pre-primary` : ''}) · ${ctx.habs.length ? `${ctx.habs.length} habitations, ${ctx.habs.filter(h => !h.road_connected).length} without a road` : 'habitations: Data unavailable'}` },
    { agent: 'accessAnalyst', label: 'Checked routes', tool: 'maps.routes + terrain.profile', toolId: 'route_calc', input: { from: A.name, to: B.name, modes: ['walk', 'drive'], pace: 'Class 1 child' },
      run: async () => {
        const walk = await tools.route_calc({ ...ids, mode: 'walk' }), road = await tools.route_calc({ ...ids, mode: 'road' });
        ctx.wp = walk.available ? { min: walk.minutes, km: walk.km, climb: walk.climb_m, descent: walk.descent_m, maxSlope: walk.max_slope_pct, steepKm: walk.steep_km, prof: walk.profile, pace: walk.pace } : null;
        ctx.road = road.available ? { km: road.km, min: road.minutes } : null;
        return { walk: ctx.wp && { km: ctx.wp.km, minutes: ctx.wp.min, climb_m: ctx.wp.climb, descent_m: ctx.wp.descent, max_slope_pct: ctx.wp.maxSlope }, road: ctx.road, ...(rt.est ? { estimate: { straight_km: rt.d, walk_km: rt.walk_km, road_km: rt.road_km } } : {}) };
      },
      sum: () => ctx.wp ? `Walk ${ctx.wp.km} km, about ${ctx.wp.min} min for a young child (${ctx.wp.climb} m up, ${ctx.wp.descent} m down, slopes to ${ctx.wp.maxSlope}%) · road ${ctx.road.km} km, about ${ctx.road.min} min` : `Route not surveyed: Data unavailable. Straight line ${rt.d} km, about ${rt.walk_km} km on foot (estimate)` },
    { agent: 'accessAnalyst', label: 'Checked GIS layers along the route', tool: 'gis.overlay', toolId: 'gis_overlay', input: { layers: ['bridges', 'steep', 'landslide'], buffer_m: 150 },
      run: async () => { ctx.hz = await tools.gis_overlay({ ...ids, route: 'walk', buffer_m: 150 }); ctx.rhz = await tools.gis_overlay({ ...ids, route: 'road', buffer_m: 150 }); return { walk_route: ctx.hz.map(h => h.name), road_route: ctx.rhz.map(h => h.name) }; },
      sum: () => ctx.hz.length ? `Walking route: ${ctx.hz.map(h => h.name).join(', ')}` + (ctx.rhz.length ? ` · road: ${ctx.rhz.map(h => h.name).join(', ')}` : '') : 'No mapped hazards' },
    { agent: 'accessAnalyst', label: 'Checked transport', tool: 'transport.lookup', toolId: 'transport_lookup', input: { window: ['08:15–09:15', '14:45–15:45'] },
      run: async () => { ctx.tr = await tools.transport_lookup({ windows: SCHOOL_WINDOWS }); return ctx.tr; },
      sum: () => 'Data unavailable: no timetable source is connected; asked as a field question' },
    { agent: 'communityAnalyst', label: 'Analysed community feedback', tool: 'feedback.search → classify (simulated Gemini)', toolId: 'feedback_search + classify_feedback', input: { schools: [A.school_id, B.school_id], about: B.school_id },
      run: async () => {
        ctx.fb = await tools.feedback_search({ school_ids: [A.school_id, B.school_id], about_id: B.school_id });
        const { themes } = await tools.classify_feedback({ fb_ids: ctx.fb.map(f => f.fb_id) });
        ctx.themes = Object.fromEntries(Object.entries(themes).map(([k, v]) => [k, { n: v.count, verified: v.verified, habs: new Set(v.hab_ids) }]));
        return Object.fromEntries(Object.entries(ctx.themes).map(([k, v]) => [k, { responses: v.n, verified: v.verified, habitations: v.habs.size }]));
      },
      sum: () => `${ctx.fb.length} responses · ` + Object.entries(ctx.themes).sort((a, b) => b[1].n - a[1].n).map(([k, v]) => `${k} ${v.n}`).join(' · ') },
    { agent: 'communityAnalyst', label: 'Identified recurring concerns', tool: 'rules.recurring', toolId: 'recurring_concerns', input: { rule: 'theme with ≥ 10 responses or from ≥ 3 habitations' },
      run: async () => { ctx.rec = await tools.recurring_concerns({ themes: Object.fromEntries(Object.entries(ctx.themes).map(([k, v]) => [k, { count: v.n, habitations: v.habs.size }])) }); return ctx.rec; },
      sum: () => ctx.rec.join(', ') || 'None' },
    { agent: 'communityAnalyst', label: 'Cross-checked field observations', tool: 'sql.query', toolId: 'field_observations', input: { sql: `SELECT * FROM field_obs WHERE school_id = '${A.school_id}'` },
      run: async () => { ctx.obs = await tools.field_observations({ school_id: A.school_id }); return ctx.obs.map(o => ({ id: o.obs_id, kind: o.kind, status: o.status, by: o.observed_by })); },
      sum: () => ctx.obs.map(o => `${o.kind}: ${o.status}`).join(' · ') || 'No field observations' },
    { agent: 'gapFinder', label: 'Found evidence gaps', tool: 'evidence.gaps', toolId: 'evidence_gaps', input: { require: ['bridge passable in rain', 'students using route', 'transport at school times', 'travel time on the ground', 'photo or GPS'] },
      run: async () => { ctx.gapRows = await tools.evidence_gaps({ case_id: cid }); ctx.gaps = ctx.gapRows.map(g => g.gap); return ctx.gaps; },
      sum: () => `${ctx.gaps.length} gaps → targeted field questions` },
  ].map(s => Object.assign(s, { ctx, A, B, L, cid }));
}
