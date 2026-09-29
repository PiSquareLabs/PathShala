import { haversine, inr, route, school } from '../ui/helpers.js';

export function evalPair(s, r, R, opts = {}) {
  const d = opts.straight ?? haversine(s, r);
  const walk = opts.walk ?? Math.round(d * 13) / 10;
  const limit = s.level_code === 'primary' ? R.walk_limit_primary_km : R.walk_limit_upper_km;
  const hz = opts.hazards || [];
  const kids = s.enrol_total;
  const P1 = [];
  const add = (t, sev, fix) => P1.push({ t, sev, fix });
  const teaches = { primary: ['primary'], middle: ['middle', 'senior'], senior: ['senior'] }[s.level_code] || [];
  if (!teaches.includes(r.level_code)) add(`${r.name} does not teach the classes at ${s.name}`, 'serious', 'Pick a school at the same level');
  if (d > R.merge_radius_km) add(`${d.toFixed(1)} km apart, outside the ${R.merge_radius_km} km merge radius`, 'serious', 'Choose a closer school, or record a written exception');
  if (walk > 2.5 * limit) add(`About ${walk.toFixed(1)} km on foot, far over the ${limit} km limit`, 'serious', `Daily transport for ${kids} children all year`);
  else if (walk > limit) add(`About ${walk.toFixed(1)} km on foot, over the ${limit} km limit`, 'fixable', `Vehicle or escort: ${kids} × ${inr(R.transport_per_child)} a year`);
  const cap = s.level_code === 'primary' ? R.primary_merge_max : s.level_code === 'middle' ? R.middle_merge_max : null;
  if (cap != null && (s.level_code === 'primary' ? s.enrol_primary : s.enrol_total) > cap) add(`${s.level_code === 'primary' ? s.enrol_primary : s.enrol_total} students, above the ${cap}-student merge limit`, 'fixable', 'Record a written reason in the order');
  if (s.enrol_preprimary > 0) add(`${s.enrol_preprimary} pre-primary children`, 'fixable', 'Keep them at the local anganwadi');
  hz.forEach(h => add(h.label, h.kind === 'court' ? 'serious' : 'fixable', { water: 'Unsafe-month plan and transport', snow: 'Winter plan and transport', landslide: 'Transport on the road route', road: 'Crossing guard at the highway', court: 'Meet the court’s concerns before re-ordering' }[h.kind] || 'Add a condition to the plan'));
  if (opts.unsurveyed !== false) add('Route not surveyed on the ground', 'unknown', 'Field survey: walk time, climb and hazards');
  const serious = P1.filter(p => p.sev === 'serious').length, fixable = P1.filter(p => p.sev === 'fixable').length;
  const match = serious ? 'bad' : fixable ? 'ok' : 'good';
  return { d, walk, limit, kids, problems: P1, match, label: { good: 'Good match', ok: 'Workable match', bad: 'Poor match' }[match] };
}
