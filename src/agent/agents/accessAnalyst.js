import prompt from '../prompts/accessAnalyst.md?raw';
import { schemas } from '../validate.js';

/* Students affected, walking and road routes, terrain hazards and transport at school times. */
export const accessAnalyst = {
  id: 'accessAnalyst',
  systemPrompt: prompt,
  tools: ['sql_query', 'school_profile', 'route_calc', 'gis_overlay', 'transport_lookup'],
  outputSchema: schemas.EvidenceBundle,
  async simulate(ctx) {
    const { A, B, wp, road, hz, tr, habs, kids, girls, cwsn, themes } = ctx;
    const th = k => themes[k] || { n: 0, verified: 0, habs: new Set() };
    const affectedHabs = new Set([...th('Transport').habs, ...th('Seasonal access').habs]);
    const bridge = hz.find(h => h.kind === 'bridge'), bus = tr.find(t => t.kind === 'bus');
    const avail = Math.max(0, ctx.capB - B.enrol_total);
    const evidence = [
      { eid: 'E2', kind: 'gis', status: 'calculated', label: `Walk ${wp.km} km, about ${wp.min} min for a young child`, detail: `Tobler's hiking function on the route profile, child pace × ${wp.pace}; ${wp.climb} m up, ${wp.descent} m down`, ref: 'route' },
      { eid: 'E3', kind: 'gis', status: 'calculated', label: `Road ${road.km} km, about ${road.min} min by vehicle`, detail: 'Road route along the Pekhri link road and the valley road', ref: 'route' },
      { eid: 'E4', kind: 'data', status: 'calculated', label: `${affectedHabs.size} habitations affected`, detail: habs.map(h => `${h.name} (${h.children})`).join(', '), ref: 'habitations' },
      { eid: 'E5', kind: 'transport', status: 'needs', label: 'Actual transport availability', detail: bus ? `${bus.name} departs ${bus.departures.join(', ')} — none in the school-time window; timetable not verified` : 'Data unavailable', ref: 'transport' },
      ...(bridge ? [{ eid: 'E7', kind: 'gis', status: 'calculated', label: `Walking route crosses ${bridge.name}`, detail: `${bridge.detail}. Season: ${bridge.season}`, ref: 'feature:' + bridge.feature_id }] : []),
      { eid: 'E10', kind: 'gis', status: 'calculated', label: `${wp.steepKm} km of path steeper than 15%`, detail: `Steepest stretch ${wp.maxSlope}%`, ref: 'route' },
      { eid: 'E11', kind: 'data', status: 'calculated', label: `${girls} of ${kids} affected students are girls; ${cwsn} with a disability`, detail: 'Habitation records', ref: 'habitations' },
      { eid: 'E12', kind: 'data', status: 'calculated', label: `${avail} seats available at ${B.name}`, detail: `Capacity ${ctx.capB}, enrolled ${B.enrol_total}`, ref: 'school:' + B.school_id },
    ];
    return { evidence, metrics: { students: kids, girls, cwsn, habitations: habs.length, walk_km: wp.km, walk_min: wp.min, road_km: road.km, road_min: road.min, steep_km: wp.steepKm, max_slope_pct: wp.maxSlope, seats_available: avail } };
  },
};
