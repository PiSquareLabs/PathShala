/* Reference case (C1: GPS Pekhri-2 -> GPS Gushaini): the outputs every agent produces in simulated mode.
   src/agent/fixtures/C1/*.json are saved from this; LLM-mode tests run the same case and compare. */
import { createCase } from '../case/analysis.js';
import { applyEvidenceUpdate, saveFieldAnswers, saveInterventions, writeFindings } from '../case/findings.js';
import { AGENTS } from './agents/index.js';
import { agentPlan } from './plan.js';
import { validate } from './validate.js';

export const C1_ANSWERS = {
  Q1: { v: 'Seasonal', note: '' }, Q2: { v: '24', note: '' }, Q3: { v: 'No', note: '' }, Q4: { v: '70', note: '' }, Q5: { v: 'Photo', note: 'Photo of the crossing' },
};

/* Run the whole reference investigation without UI delays. Returns {agent: output} and validation errors. */
export async function captureC1Outputs(fromId = 'PK2', toId = 'GSH') {
  const cid = createCase(fromId, toId), out = {}, errors = {};
  const plan = agentPlan(cid), ctx = plan[0].ctx;
  for (const s of plan) await s.run();
  const call = async (id, c) => { const o = await AGENTS[id].simulate(c); const e = validate(AGENTS[id].outputSchema, o); if (e) errors[id] = e; out[id] = o; return o; };
  ctx.access = await call('accessAnalyst', ctx);
  ctx.community = await call('communityAnalyst', ctx);
  const questions = await call('gapFinder', ctx);
  const findings = await call('coordinator', ctx);
  writeFindings(cid, findings, questions, 'fixture');
  const A = saveFieldAnswers(cid, C1_ANSWERS);
  const update = await call('evidenceUpdater', { cid, answers: A });
  applyEvidenceUpdate(cid, update, A);
  saveInterventions(cid, await call('policyResearcher', { cid }));
  const draft = await call('reportDrafter', { cid });
  await call('reportCritic', { cid, sentences: draft.sentences });
  return { cid, out, errors };
}
