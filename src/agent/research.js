/* Runs the research agents and saves what they found. They only PROPOSE: results go to research_* and suggestions.
   Field questions, the choice of school and every evidence status change only when the officer acts. */
import { invRow, optionIds, trackRow } from '../case/options.js';
import { q, q1, run, save } from '../db/sqlite.js';
import { logCase, school, today } from '../ui/helpers.js';
import { RESEARCH_AGENTS } from './agents/researchAgents.js';
import { runLoop, saveRun } from './loop.js';

export async function runResearch(agentId, cid, onEvent) {
  const agent = RESEARCH_AGENTS[agentId], c = trackRow(cid), A = school(c.from_id), B = school(c.to_id);
  const q2 = q1("SELECT answer FROM field_questions WHERE case_id = ? AND qid = 'Q2'", [cid]), students = q2 && +q2.answer > 0 ? +q2.answer : null;   // a field-verified count, if the officer gave one
  const r = await runLoop({ agent, cid, ctx: { A, B, students, names: `${A.name} ${B.name}` }, onEvent });
  saveRun(cid, agentId, r);
  return r.out;
}

export async function runSuggestion(inv, onEvent) {
  const I = invRow(inv), A = school(I.from_id), agent = RESEARCH_AGENTS.suggestion;
  const r = await runLoop({ agent, cid: inv, ctx: { A, names: [A.name, ...optionIds(inv).map(id => school(id).name)].join(' ') }, onEvent });
  saveRun(inv, 'suggestion', r);
  run('INSERT OR REPLACE INTO suggestions VALUES (?,?,?,?,0,COALESCE((SELECT officer_choice FROM suggestions WHERE inv_id = ?), NULL),?)', [inv, r.out.mode, r.out.suggested, JSON.stringify(r.out), inv, today()]);
  logCase(inv, 'Agent', 'Suggestion ready', `${r.out.suggested_name} (${r.out.mode}); nothing selected`);
  save();
  return r.out;
}
export const suggestionRow = inv => { const r = q1('SELECT * FROM suggestions WHERE inv_id = ?', [inv]); return r && { ...r, out: JSON.parse(r.out) }; };

/* Officer actions. */
export function acceptSuggestion(inv) { run('UPDATE suggestions SET accepted = 1 WHERE inv_id = ?', [inv]); logCase(inv, 'Officer', 'Accepted the AI suggestion as a starting point', 'The choice itself is still made by the officer'); save(); }
export function ignoreSuggestion(inv) { run('UPDATE suggestions SET accepted = -1 WHERE inv_id = ?', [inv]); logCase(inv, 'Officer', 'Ignored the AI suggestion'); save(); }

/* Officer approves the checker's proposed field questions: only now do they enter the case. */
export function addFieldQuestions(cid, questions) {
  let seq = 1 + (q1('SELECT max(seq) AS n FROM field_questions WHERE case_id = ?', [cid]).n || 0), n = 1 + (q('SELECT qid FROM field_questions WHERE case_id = ?', [cid]).map(x => +x.qid.slice(1) || 0).reduce((a, b) => Math.max(a, b), 0));
  const have = new Set(q('SELECT text FROM field_questions WHERE case_id = ?', [cid]).map(x => x.text)); let added = 0;
  questions.forEach(x => { if (have.has(x.text)) return; run('INSERT INTO field_questions (case_id, qid, seq, text, type, options, gap, answer, note) VALUES (?,?,?,?,?,?,?,?,?)', [cid, 'Q' + n++, seq++, x.text, 'choice', JSON.stringify(['Confirmed', 'Not confirmed', 'Unknown']), x.gap, '', '']); added++; });
  if (added) { logCase(cid, 'Officer', `Added ${added} field questions from the research agent`); save(); }
  return added;
}
