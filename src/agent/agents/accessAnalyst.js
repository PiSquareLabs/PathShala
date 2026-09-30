import prompt from '../prompts/accessAnalyst.md?raw';
import { q1 } from '../../db/sqlite.js';
import { schemas } from '../validate.js';

/* Students affected, walking and road routes, terrain hazards and transport at school times. */
export const accessAnalyst = {
  id: 'accessAnalyst',
  systemPrompt: prompt,
  tools: ['sql_query', 'school_profile', 'route_calc', 'gis_overlay', 'transport_lookup'],
  outputSchema: schemas.EvidenceBundle,
  async simulate(ctx) {
    const { A, B, wp, road, hz, habs, kids, route } = ctx;
    const bridge = hz.find(h => h.kind === 'bridge');
    const avail = Math.max(0, ctx.capB - B.enrol_total);
    const evidence = [
      wp ? { eid: 'E2', kind: 'gis', status: 'calculated', label: `Walk ${wp.km} km, about ${wp.min} min for a young child`, detail: `Tobler's hiking function on the route profile, child pace × ${wp.pace}; ${wp.climb} m up, ${wp.descent} m down`, ref: 'route' }
        : { eid: 'E2', kind: 'gis', status: 'needs', label: `Walking route not surveyed: about ${route.walk_km} km on foot (estimate)`, detail: `Straight line ${route.d} km × 1.3. There is no elevation profile, so no walking time was calculated.`, ref: 'route' },
      road ? { eid: 'E3', kind: 'gis', status: 'calculated', label: `Road ${road.km} km, about ${road.min} min by vehicle`, detail: 'Road route along the Pekhri link road and the valley road', ref: 'route' }
        : { eid: 'E3', kind: 'gis', status: 'needs', label: `Road about ${route.road_km} km (estimate)`, detail: `Straight line ${route.d} km × 1.4. Road travel time is not available.`, ref: 'route' },
      habs.length ? { eid: 'E4', kind: 'data', status: 'calculated', label: `${habs.length} habitations served`, detail: habs.map(h => `${h.name} (${h.elev_m} m${h.road_connected ? '' : ', no road'})`).join(', '), ref: 'habitations' }
        : { eid: 'E4', kind: 'data', status: 'needs', label: 'Habitations served: Data unavailable', detail: 'No habitation records for this school', ref: 'habitations' },
      { eid: 'E5', kind: 'transport', status: 'needs', label: 'Public transport at school times', detail: 'Data unavailable: no timetable source is connected. Confirm on the field visit.', ref: 'transport' },
      ...(bridge ? [{ eid: 'E7', kind: 'gis', status: 'calculated', label: `Walking route crosses ${bridge.name}`, detail: `${bridge.detail}. Season: ${bridge.season}`, ref: 'feature:' + bridge.feature_id }] : []),
      ...(wp ? [{ eid: 'E10', kind: 'gis', status: 'calculated', label: `${wp.steepKm} km of path steeper than 15%`, detail: `Steepest stretch ${wp.maxSlope}%`, ref: 'route' }] : []),
      { eid: 'E11', kind: 'data', status: 'calculated', label: `${kids} students on roll: ${A.enrol_primary} in Classes 1–5, ${A.enrol_preprimary} pre-primary`, detail: (() => { const f = q1('SELECT * FROM school_facts WHERE school_id = ?', [A.school_id]); return f && f.enrol_girls != null ? `School record (UDISE+): ${f.enrol_girls} girls, ${f.enrol_boys} boys, ${f.cwsn || 0} children with special needs` : 'School record (UDISE+)'; })(), ref: 'school:' + A.school_id },
      { eid: 'E12', kind: 'data', status: 'calculated', label: `${avail} seats available at ${B.name}`, detail: `Capacity ${ctx.capB}, enrolled ${B.enrol_total}`, ref: 'school:' + B.school_id },
    ];
    return { evidence, metrics: { students: kids, habitations: habs.length, walk_km: wp ? wp.km : route.walk_km, walk_min: wp ? wp.min : null, road_km: road ? road.km : route.road_km, road_min: road ? road.min : null, steep_km: wp ? wp.steepKm : null, max_slope_pct: wp ? wp.maxSlope : null, route_surveyed: !route.est, seats_available: avail } };
  },
};
