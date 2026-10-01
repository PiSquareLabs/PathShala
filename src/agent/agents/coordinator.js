import prompt from '../prompts/coordinator.md?raw';
import { P } from '../../ui/helpers.js';
import { schemas } from '../validate.js';

const eidNum = e => +e.eid.slice(1);

/* Plans the run, calls the specialists and merges their evidence into findings. The findings themselves
   (titles, severity, wording) are written here from the specialists' evidence; nothing is approved. */
export const coordinator = {
  id: 'coordinator',
  systemPrompt: prompt,
  tools: ['accessAnalyst', 'communityAnalyst', 'gapFinder'],
  outputSchema: schemas.Findings,
  async simulate(ctx) {
    const { access, community, B, hz, kids, themes } = ctx;
    const th = k => themes[k] || { n: 0, verified: 0, habs: new Set() };
    const all = [...access.evidence, ...community.evidence];
    const pick = ids => all.filter(e => ids.includes(e.eid)).sort((a, b) => eidNum(a) - eidNum(b));
    const bridge = hz.find(h => h.kind === 'bridge');
    const avail = access.metrics.seats_available;
    const { wp } = ctx, cap = t => t[0].toUpperCase() + t.slice(1), R = P(), limit = ctx.A.level_code === 'primary' ? R.walk_limit_primary_km : R.walk_limit_upper_km;
    const steep = wp && wp.steepKm > 0, seasonalN = th('Seasonal access').n;
    const bits = [steep ? 'steep path' : null, bridge ? 'a river crossing' : null].filter(Boolean);
    const findings = [
      { fid: 'F1', title: 'Transport', kind: 'primary', severity: 'high', summary: 'Public transport at school times is not known.' + (wp ? (wp.km > limit ? ` The walk (${wp.km} km) is over the ${limit} km RTE limit${steep ? ' and steep for young children' : ''}.` : steep ? ' The walk is steep for young children.' : '') : ' The route has not been surveyed.'), status: 'Potential issue', evidence: pick(['E1', 'E2', 'E3', 'E4', 'E5', 'E11']) },
      { fid: 'F2', title: 'Seasonal access', kind: 'secondary', severity: bridge ? 'high' : 'medium', summary: bridge ? `The footpath crosses ${bridge.feature_id === "BR1" ? "the Tirthan" : "a river or stream"} at ${bridge.name}, which floods in the monsoon.` : seasonalN ? 'Citizens report seasonal access problems on this route.' : 'No river crossing is mapped on this route; passability in the monsoon and winter has not been checked.', status: bridge || seasonalN ? 'Potential issue' : 'Not enough data', evidence: pick(['E6', 'E7', 'E8']) },
      { fid: 'F3', title: 'Route safety for young children', kind: 'secondary', severity: 'medium', summary: bits.length ? cap(bits.join(' and ')) + (th('Safety').n ? '; parents worry about girls walking alone.' : '.') : 'No steep or hazardous stretch is mapped on this route.', status: 'Potential issue', evidence: pick(['E9', 'E10']) },
      { fid: 'F4', title: 'Receiving-school capacity', kind: 'context', severity: avail >= kids ? 'low' : 'high', summary: avail >= kids ? `${B.name} has ${avail} free seats for ${kids} students.` : `${B.name} has only ${avail} free seats for ${kids} students.`, status: avail >= kids ? 'No issue found' : 'Potential issue', evidence: pick(['E12']) },
    ];
    const bld = pick(['E13']);
    if (bld.length) findings.push({ fid: 'F5', title: `Building condition at ${ctx.A.name}`, kind: 'context', severity: 'medium', summary: 'The current building is unsafe. Rebuilding is an alternative to merging.', status: 'Verified', evidence: bld });
    return { findings, gaps: ctx.gaps };
  },
};
