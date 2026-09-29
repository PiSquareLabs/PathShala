import prompt from '../prompts/coordinator.md?raw';
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
    const findings = [
      { fid: 'F1', title: 'Transport', kind: 'primary', severity: 'high', summary: 'No transport at school times from the affected habitations; the walk is long and steep for young children.', status: 'Potential issue', evidence: pick(['E1', 'E2', 'E3', 'E4', 'E5']) },
      { fid: 'F2', title: 'Seasonal access', kind: 'secondary', severity: 'high', summary: `The footpath crosses the Tirthan at ${bridge ? bridge.name : 'a river crossing'}, which floods in the monsoon.`, status: 'Potential issue', evidence: pick(['E6', 'E7', 'E8']) },
      { fid: 'F3', title: 'Route safety for young children', kind: 'secondary', severity: 'medium', summary: 'Steep path and a river crossing; parents worry about girls walking alone.', status: 'Potential issue', evidence: pick(['E9', 'E10', 'E11']) },
      { fid: 'F4', title: 'Receiving-school capacity', kind: 'context', severity: avail >= kids ? 'low' : 'high', summary: avail >= kids ? `${B.name} has ${avail} free seats for ${kids} students.` : `${B.name} has only ${avail} free seats for ${kids} students.`, status: avail >= kids ? 'No issue found' : 'Potential issue', evidence: pick(['E12']) },
    ];
    const bld = pick(['E13']);
    if (bld.length) findings.push({ fid: 'F5', title: `Building condition at ${ctx.A.name}`, kind: 'context', severity: 'medium', summary: 'The current building is unsafe. Rebuilding is an alternative to merging.', status: 'Verified', evidence: bld });
    return { findings, gaps: ctx.gaps };
  },
};
