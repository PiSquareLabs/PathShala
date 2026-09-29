/* Runs the agents: calls the provider, validates every output against its schema (retry once, then fall back
   to the simulated result and log it), streams steps to the UI, and writes results through the case repository.
   Hard rules: the model never produces numbers or approvals; only the officer approves or submits. */
import { applyEvidenceUpdate, saveFieldAnswers, saveInterventions, writeFindings } from '../case/findings.js';
import { run } from '../db/sqlite.js';
import { logCase, sleep } from '../ui/helpers.js';
import { AGENTS } from './agents/index.js';
import { agentPlan } from './plan.js';
import { CONFIG, getProvider } from './provider.js';
import { validate } from './validate.js';

/* Call one agent and return schema-valid output. */
export async function callAgent(id, ctx) {
  const agent = AGENTS[id], provider = getProvider();
  let problem = '';
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const out = await provider.call(agent, ctx);
      problem = validate(agent.outputSchema, out) || checkGrounding(id, out, ctx);
      if (!problem) return out;
    } catch (e) { problem = e.message; }
  }
  if (provider.name === 'simulated') throw new Error(`${id} output failed validation: ${problem}`);
  const out = await agent.simulate(ctx);
  const err = validate(agent.outputSchema, out);
  if (err) throw new Error(`${id} simulated output failed validation: ${err}`);
  if (ctx.cid) logCase(ctx.cid, 'System', 'Agent output failed validation; simulated result used', `${id}: ${problem}`);
  return out;
}

/* LLM mode only: the Policy Researcher may cite only chunk ids retrieved in the same run. */
function checkGrounding(id, out, ctx) {
  if (getProvider().name === 'simulated' || id !== 'policyResearcher' || !ctx.retrievedChunkIds) return '';
  const bad = out.interventions.flatMap(v => v.chunk_ids).filter(c => !ctx.retrievedChunkIds.includes(c));
  return bad.length ? `Cited chunks not retrieved in this run: ${bad.join(', ')}` : '';
}

/* The investigation: 8 tool steps, then the specialists and the Coordinator. onEvent({type:'start'|'step', label, tool, input, output, summary}) */
export async function runInvestigation(cid, onEvent = () => {}) {
  run('DELETE FROM agent_steps WHERE case_id = ?', [cid]);
  logCase(cid, 'Officer', 'Started agent investigation');
  const plan = agentPlan(cid), ctx = plan[0].ctx;
  for (let i = 0; i < plan.length; i++) {
    const s = plan[i];
    onEvent({ type: 'start', label: s.label, tool: s.tool, agent: s.agent });
    await sleep(CONFIG.stepDelayMs);
    const output = await s.run(), summary = s.sum();
    run('INSERT INTO agent_steps VALUES (?,?,?,?,?,?,?)', [cid, i + 1, s.label, s.tool, JSON.stringify(s.input), JSON.stringify(output), summary]);
    onEvent({ type: 'step', label: s.label, tool: s.tool, input: s.input, output, summary, agent: s.agent });
  }
  ctx.access = await callAgent('accessAnalyst', ctx);
  ctx.community = await callAgent('communityAnalyst', ctx);
  const questions = await callAgent('gapFinder', ctx);
  const findings = await callAgent('coordinator', ctx);
  writeFindings(cid, findings, questions, `${ctx.rec.length} recurring concerns, ${ctx.gaps.length} evidence gaps`);
  return { findings, questions };
}

/* Field answers -> Evidence Updater -> evidence and findings. */
export async function runFieldUpdate(cid, ans) {
  const A = saveFieldAnswers(cid, ans);
  const update = await callAgent('evidenceUpdater', { cid, answers: A });
  applyEvidenceUpdate(cid, update, A);
  return update;
}

/* Policy Researcher -> interventions (keeps the officer's ticks). */
export async function runPolicy(cid) {
  const out = await callAgent('policyResearcher', { cid });
  saveInterventions(cid, out);
  return out;
}

/* Drafter <-> Critic, at most two redrafts. Returns the sentences and the last critique. */
export async function runDraft(cid) {
  let draft, critique;
  for (let round = 0; round < 3; round++) {
    draft = await callAgent('reportDrafter', { cid });
    critique = await callAgent('reportCritic', { cid, sentences: draft.sentences });
    if (critique.pass) break;
  }
  return { draft, critique };
}
