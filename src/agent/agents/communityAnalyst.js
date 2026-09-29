import prompt from '../prompts/communityAnalyst.md?raw';
import { schemas } from '../validate.js';

/* Feedback themes, recurring concerns, and which concerns a government field observation confirms. */
export const communityAnalyst = {
  id: 'communityAnalyst',
  systemPrompt: prompt,
  tools: ['feedback_search', 'classify_feedback', 'recurring_concerns', 'field_observations'],
  outputSchema: schemas.EvidenceBundle,
  async simulate(ctx) {
    const { themes, obs } = ctx;
    const th = k => themes[k] || { n: 0, verified: 0, habs: new Set() };
    const obsB = obs.find(o => o.kind === 'bridge'), obsBld = obs.find(o => o.kind === 'building');
    const evidence = [
      { eid: 'E1', kind: 'feedback', status: 'reported', label: `${th('Transport').n} citizen responses mention transport`, detail: 'Community feedback, classified by theme', ref: 'theme:Transport' },
      { eid: 'E6', kind: 'feedback', status: th('Seasonal access').verified ? 'verified' : 'reported', label: `${th('Seasonal access').n} citizen responses mention seasonal access`, detail: `${th('Seasonal access').verified} of them checked against a field observation`, ref: 'theme:Seasonal access' },
      ...(obsB ? [{ eid: 'E8', kind: 'field', status: 'verified', label: 'Field evidence: seasonal bridge issue', detail: `${obsB.text} (${obsB.observed_by}, ${obsB.observed_on})`, ref: 'obs:' + obsB.obs_id }] : []),
      { eid: 'E9', kind: 'feedback', status: 'reported', label: `${th('Safety').n} citizen responses mention safety`, detail: '', ref: 'theme:Safety' },
      ...(obsBld ? [{ eid: 'E13', kind: 'field', status: 'verified', label: obsBld.text, detail: `${obsBld.observed_by}, ${obsBld.observed_on}`, ref: 'obs:' + obsBld.obs_id }] : []),
    ];
    const counts = Object.fromEntries(Object.entries(themes).map(([k, v]) => [k, v.n]));
    return { evidence, metrics: { responses: ctx.fb.length, themes: counts, recurring: ctx.rec, field_observations: obs.length } };
  },
};
