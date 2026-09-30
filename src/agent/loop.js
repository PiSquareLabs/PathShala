/* The agent loop shared by the research agents:
     plan -> pick ONE tool or search -> run it -> save the result as evidence (source + status) -> check it -> decide the next step
     -> stop when answered, when no tool can help (mark "Data unavailable" and raise a field question), or after 12 steps.
   Simulated mode: the agent's fixed rules choose every step. Gemini mode: Gemini picks the next tool and writes the plan,
   reasons and wording; tools and search always produce the facts. If a Gemini reply is invalid or fails, the simulated
   step is used and the fallback is logged. Numbers come only from tools. Agents only propose: nothing here touches the
   case's findings, evidence, field questions or choices. */
import { q, run, save } from '../db/sqlite.js';
import { logCase, sleep } from '../ui/helpers.js';
import { llmConfigured, llmJson } from './llm.js';
import { CONFIG } from './provider.js';
import { toolSchemas, tools } from './tools.js';

export const MAX_STEPS = 12;
const SEARCH_TOOLS = new Set(['rag_search', 'web_search']);
export const modeName = () => (llmConfigured() ? 'Gemini' : 'Simulated');
const short = v => { const s = typeof v === 'string' ? v : JSON.stringify(v); return s.length > 30000 ? s.slice(0, 30000) + '…' : s; };
const numbersIn = s => [...String(s).replace(/\[[^\]]*\]/g, ' ').matchAll(/\d[\d,]*(?:\.\d+)?/g)].map(m => m[0].replace(/,/g, ''));
/* Every number a tool produced in this run (from outputs and the school and route records the tools read). */
export const toolNumbers = state => new Set([...state.steps.flatMap(s => numbersIn(JSON.stringify(s.output))), ...numbersIn(state.ctx.names || '')]);   // school names may contain digits (Pekhri-2)

function schemaOf(name) { return toolSchemas.find(t => t.name === name); }
function validArgs(name, args) {
  const sch = schemaOf(name); if (!sch || typeof args !== 'object' || !args) return false;
  return (sch.parameters.required || []).every(k => args[k] !== undefined && args[k] !== null && args[k] !== '');
}

/* Gemini chooses the next step. Returns a decision or null (caller falls back to the simulated decision). */
async function geminiNext(agent, state) {
  const list = agent.tools.map(n => { const t = schemaOf(n); return `- ${n}(${Object.keys(t.parameters.properties).join(', ')}): ${t.description}`; }).join('\n');
  const system = `You are the ${agent.title} for PathShala, used by district education officers in Himachal Pradesh. ${agent.goal}
Choose the ONE next step. Tools produce all facts; you never state numbers. Reply ONLY with JSON: {"tool": "<name>", "args": {...}, "reason": "<one short line>"} or {"stop": true, "reason": "<why the question is answered>"}.
Tools:\n${list}\nDo not repeat a step. You may stop only when every needed check has been made or no tool can help.`;
  const user = JSON.stringify({ case: agent.brief(state), steps_so_far: state.steps.map(s => ({ n: s.seq, tool: s.tool, args: s.input, result: s.summary })), evidence: state.evidence.map(e => `${e.eid}: ${e.label} [${e.status}]`) });
  const out = await llmJson({ system, messages: [{ role: 'user', content: user }], max_tokens: 1024 }, 2);
  if (out.stop) return agent.required(state).length ? null : { stop: true, reason: String(out.reason || 'Answered') };
  if (!agent.tools.includes(out.tool) || !validArgs(out.tool, out.args)) return null;
  if (state.steps.some(s => s.tool === out.tool && JSON.stringify(s.input) === JSON.stringify(out.args))) return null;
  return { tool: out.tool, args: out.args, reason: String(out.reason || '').slice(0, 200) };
}

/* Validate sentences written for a run: every sentence cited, every citation returned by this run, no number a tool did not produce. */
export function checkSentences(sentences, state) {
  const ok = new Set([...state.evidence.map(e => e.eid), ...state.retrieved]), nums = toolNumbers(state), bad = [];
  if (!Array.isArray(sentences) || !sentences.length) return ['no sentences'];
  sentences.forEach((s, i) => {
    if (!s || typeof s.text !== 'string' || !s.text.trim()) bad.push(`sentence ${i + 1} is empty`);
    else if (!Array.isArray(s.refs) || !s.refs.length) bad.push(`sentence ${i + 1} has no citation`);
    else {
      s.refs.filter(r => !ok.has(r)).forEach(r => bad.push(`sentence ${i + 1} cites ${r}, which this run did not produce`));
      numbersIn(s.text).filter(n => !nums.has(n)).forEach(n => bad.push(`sentence ${i + 1} has the number ${n}, which no tool produced`));
    }
  });
  return bad;
}

async function geminiWording(agent, state, fixed) {
  const system = `You write the findings of the ${agent.title} for PathShala. Use ONLY the evidence and passages given. Every sentence ends with citations (ids from the list). Do not state any number that is not in the evidence. Do not recommend approving anything; the officer decides.
Reply ONLY with JSON: {"sentences": [{"text": "...", "refs": ["<id>", ...]}]} with 3 to 6 sentences.`;
  const user = JSON.stringify({ evidence: state.evidence.map(e => ({ id: e.eid, label: e.label, status: e.status, source: e.source })), passages: [...state.passages.values()].map(p => ({ id: p.id, source: p.source, wording: p.wording, text: p.text.slice(0, 300) })), draft_facts: fixed.map(s => s.text) });
  const out = await llmJson({ system, messages: [{ role: 'user', content: user }], max_tokens: 2048 }, 2);
  return out.sentences;
}

/* Run one agent. onEvent({type:'plan'|'start'|'step'|'done', ...}) drives the live step list. Returns {out, steps, evidence, mode, fallbacks}. */
export async function runLoop({ agent, cid, ctx, onEvent = () => {}, delay = CONFIG.stepDelayMs }) {
  const gem = llmConfigured(), mode = modeName(), fallbacks = [];
  const state = { cid, ctx, mode, steps: [], evidence: [], questions: [], retrieved: new Set(), passages: new Map(), facts: {}, done: new Set() };
  const note = m => { fallbacks.push(m); logCase(cid, 'System', `${agent.title}: Gemini result not used`, m); };
  let plan = agent.plan(state);
  if (gem) {
    try { const out = await llmJson({ system: `You are the ${agent.title} for PathShala. ${agent.goal} Write a short plan of 4 to 7 steps as JSON: {"plan": ["...", ...]}. No numbers.`, messages: [{ role: 'user', content: JSON.stringify(agent.brief(state)) }], max_tokens: 512 }, 2); if (Array.isArray(out.plan) && out.plan.length && out.plan.every(x => typeof x === 'string')) plan = out.plan.slice(0, 8); else throw new Error('plan not understood'); }
    catch (e) { note(`plan: ${e.message}`); }
  }
  logCase(cid, 'Agent', `${agent.title} started (${mode})`, plan.join(' → '));
  onEvent({ type: 'plan', plan, mode });
  let stopReason = '', failedMsg = '';
  for (let n = 1; n <= MAX_STEPS; n++) {
    let d = null, src = 'rules';
    if (gem) { try { d = await geminiNext(agent, state); if (d) src = 'gemini'; else note(`step ${n}: reply invalid or repeated a step`); } catch (e) { note(`step ${n}: ${e.message}`); } }
    if (!d) d = agent.next(state);
    if (d.stop) { stopReason = d.reason; break; }
    if (d.unavailable) {                                                   // no tool can help: say so and raise a field question
      const eid = agent.eid(state); state.evidence.push({ eid, label: `Data unavailable: ${d.unavailable}`, source: 'No tool or source can answer this', status: 'needs verification', ref: '', step: n });
      if (d.question) state.questions.push(d.question);
      stopReason = 'No tool can help; marked Data unavailable and raised a field question'; break;
    }
    const kind = SEARCH_TOOLS.has(d.tool) ? 'search' : 'tool';
    onEvent({ type: 'start', seq: n, kind, tool: d.tool, reason: d.reason });
    if (delay) await sleep(delay);
    let output, err = '';
    try { output = await tools[d.tool](d.args); } catch (e) { err = e.message; output = { error: err }; }
    if (err) {                                   // a failed tool ends the run honestly: Data unavailable, a field question, no repeated retries
      state.steps.push({ seq: n, kind, tool: d.tool, reason: d.reason, input: d.args, output, passages: null, src, summary: `Failed: ${err}`, check: 'Step failed; nothing saved from it' });
      state.evidence.push({ eid: agent.eid(state), label: `Data unavailable: the ${d.tool} step failed (${err})`, source: 'Tool error, logged', status: 'needs verification', ref: '', step: n });
      onEvent({ type: 'step', ...state.steps.at(-1) }); failedMsg = `${d.tool}: ${err}`; stopReason = 'A tool failed; marked Data unavailable'; logCase(cid, 'System', `${agent.title}: a tool failed`, failedMsg); break;
    }
    const step = { seq: n, kind, tool: d.tool, reason: d.reason, input: d.args, output, passages: output?.passages || null, src, summary: '' };
    state.steps.push(step); state.done.add(d.tool + ':' + (d.tag || ''));
    (output?.passages || []).forEach(p => { state.retrieved.add(p.id); state.passages.set(p.id, p); });
    const ev = err ? [] : agent.record(state, step, d) || [];
    ev.forEach(e => state.evidence.push({ ...e, eid: agent.eid(state), step: n }));
    step.evidence = state.evidence.filter(e => e.step === n).map(e => e.eid);
    step.summary = err ? `Failed: ${err}` : agent.summary(state, step, d);
    step.check = err ? 'Step failed; nothing saved from it' : agent.check(state, step, d);
    onEvent({ type: 'step', ...step });
    if (agent.answered(state)) { stopReason = 'Answered'; break; }
    if (n === MAX_STEPS) stopReason = 'Stopped after 12 steps';
  }
  let out = failedMsg ? agent.failed(state, failedMsg, state.evidence.at(-1).eid) : agent.finish(state);
  if (gem && !failedMsg && !out.wordingFailed) {
    try { const s = await geminiWording(agent, state, out.sentences), bad = checkSentences(s, state); if (bad.length) throw new Error(bad[0]); out = { ...out, sentences: s, wording: 'gemini' }; }
    catch (e) { note(`wording: ${e.message}`); }
  }
  const badFixed = checkSentences(out.sentences, state);
  if (badFixed.length) throw new Error(`${agent.title} produced an unchecked sentence: ${badFixed[0]}`);
  out = { ...out, stop_reason: stopReason, plan, mode, fallbacks };
  onEvent({ type: 'done', out });
  return { out, state };
}

/* Save a finished run. Only research_* tables are written: the case record is not touched. */
export function saveRun(cid, agentId, { out, state }) {
  ['research_steps', 'research_evidence', 'research_runs'].forEach(t => run(`DELETE FROM ${t} WHERE case_id = ? AND agent = ?`, [cid, agentId]));
  state.steps.forEach(s => run('INSERT INTO research_steps VALUES (?,?,?,?,?,?,?,?,?,?,?)', [cid, agentId, s.seq, s.kind, s.tool, s.reason, JSON.stringify(s.input), short(s.output), s.passages ? JSON.stringify(s.passages) : null, s.summary + (s.check ? ' · ' + s.check : ''), s.src]));
  state.evidence.forEach(e => run('INSERT INTO research_evidence VALUES (?,?,?,?,?,?,?,?)', [cid, agentId, e.eid, e.label, e.source, e.status, e.ref || '', e.step]));
  run('INSERT INTO research_runs VALUES (?,?,?,?,?,?)', [cid, agentId, state.mode, 'done', new Date().toISOString().slice(0, 19).replace('T', ' '), JSON.stringify(out)]);
  logCase(cid, 'Agent', `${agentId} finished (${state.mode})`, `${state.steps.length} steps, ${state.evidence.length} evidence items; ${out.stop_reason}`);
  save();
}
export const savedRun = (cid, agent) => {
  const r = q('SELECT * FROM research_runs WHERE case_id = ? AND agent = ?', [cid, agent])[0]; if (!r) return null;
  return { ...r, out: JSON.parse(r.out), steps: q('SELECT * FROM research_steps WHERE case_id = ? AND agent = ? ORDER BY seq', [cid, agent]).map(s => ({ ...s, input: JSON.parse(s.input || 'null'), passages: s.passages ? JSON.parse(s.passages) : null })),
    evidence: q('SELECT * FROM research_evidence WHERE case_id = ? AND agent = ? ORDER BY step, eid', [cid, agent]) };
};
