/* Full control: one guided run of the whole flow. The officer picks ONE closing school; the AI finds the candidate receiving schools
   and researches every one (feedback, investigation, Transport Planner, Feedback Checker). It then STOPS at the field stage and
   generates a field form for the officer. After the officer enters the answers, it updates the evidence, picks the best policies
   for each candidate, calculates the budget, ranks the candidates and prepares the final screen: recommendation, comparison,
   budget, full report text. Every step is logged. Nothing is submitted, and the officer adopts or changes the choice. */
import { nearby } from '../case/analysis.js';
import { chooseFinal, createCase, invRow, tracks } from '../case/options.js';
import { q, q1, run, save } from '../db/sqlite.js';
import { logCase, school } from '../ui/helpers.js';
import { ensureFeedback } from './feedbackAgents.js';
import { addFieldQuestions, runResearch, runSuggestion } from './research.js';
import { CONFIG } from './provider.js';
import { runDraft, runFieldUpdate, runInvestigation, runPolicy } from './runner.js';
import { tools } from './tools.js';
import { savedRun } from './loop.js';

export const STAGES = [['school', 'Closing school'], ['research', 'AI research'], ['field', 'Field form'], ['policy', 'Policies and budget'], ['decision', 'Decision']];
const now = () => new Date().toISOString().slice(0, 19).replace('T', ' ');
export const fullRow = inv => { const r = q1('SELECT * FROM full_runs WHERE inv_id = ?', [inv]); return r && { ...r, log: JSON.parse(r.log || '[]'), out: r.out ? JSON.parse(r.out) : null }; };
const setStage = (inv, stage, out) => { run('UPDATE full_runs SET stage = ?, updated = ?' + (out ? ', out = ?' : '') + ' WHERE inv_id = ?', out ? [stage, now(), JSON.stringify(out), inv] : [stage, now(), inv]); save(); };
function addLog(inv, text) { const r = fullRow(inv), log = [...r.log, { t: now().slice(11), text }].slice(-300); run('UPDATE full_runs SET log = ? WHERE inv_id = ?', [JSON.stringify(log), inv]); }

export const candidatesFor = schoolId => nearby(schoolId, 12).slice(0, 3);

/* Closing schools worth reviewing: few students or a poor or unsafe building. */
export const reviewList = () => q("SELECT s.*, f.building FROM schools s LEFT JOIN school_facts f USING (school_id) WHERE s.enrol_total <= 30 OR f.building LIKE 'Poor%' OR f.building LIKE 'Unsafe%' ORDER BY (f.building LIKE 'Poor%' OR f.building LIKE 'Unsafe%') DESC, s.enrol_total, s.name");

export function startFull(schoolId) {
  const cands = candidatesFor(schoolId);
  if (!cands.length) throw new Error('No candidate receiving school within 12 km for ' + school(schoolId).name);
  const inv = createCase(schoolId, cands.map(c => c.s.school_id));
  run('INSERT OR REPLACE INTO full_runs VALUES (?,?,?,?,?,NULL)', [inv, 'research', now(), now(), '[]']);
  logCase(inv, 'Officer', 'Started Full control', `${school(schoolId).name}; candidates ${cands.map(c => c.s.name).join(', ')}`);
  addLog(inv, `Closing school: ${school(schoolId).name}`); addLog(inv, `Candidates found by screening score: ${cands.map(c => `${c.s.name} (${c.score})`).join(', ')}`);
  save(); return inv;
}

/* Stage 2: research every candidate, then stop and wait for the officer's field entries. */
export async function runFullResearch(inv, onLog = () => {}) {
  const log = t => { addLog(inv, t); onLog(t); }, old = CONFIG.stepDelayMs; CONFIG.stepDelayMs = 60;
  try {
    for (const t of tracks(inv)) {
      const B = school(t.to_id);
      log(`${B.name}: reading citizen feedback (classify and summarise)`); await ensureFeedback(t.case_id);
      log(`${B.name}: investigating: students, routes, map layers, transport, feedback, gaps`); await runInvestigation(t.case_id, ev => { if (ev.type === 'step') onLog(`  ${B.name}: ${ev.label}`); });
      log(`${B.name}: Transport Planner`); const tp = await runResearch('transportPlanner', t.case_id, ev => { if (ev.type === 'step') onLog(`  ${B.name}: ${ev.tool}`); });
      log(`${B.name}: Feedback Checker`); const fc = await runResearch('feedbackChecker', t.case_id, ev => { if (ev.type === 'step') onLog(`  ${B.name}: ${ev.tool}`); });
      const n = addFieldQuestions(t.case_id, [...tp.open_questions.slice(0, 2), ...fc.open_questions.slice(0, 3)]);
      log(`${B.name}: done. ${n} extra field questions added from the research (Full control mode)`);
    }
    log('Research finished for every candidate. Waiting for the field officer.');
    setStage(inv, 'field'); logCase(inv, 'System', 'Full control stopped at the field stage', 'Field form generated for the officer');
  } finally { CONFIG.stepDelayMs = old; }
}

export const fieldForm = inv => tracks(inv).map(t => ({ track: t, school: school(t.to_id), questions: q('SELECT * FROM field_questions WHERE case_id = ? ORDER BY seq', [t.case_id]) }));

/* Best policies for one candidate by a fixed rule: for each confirmed concern take the cheapest intervention that addresses it. */
export function selectBestPolicies(cid) {
  run('DELETE FROM auto_choices WHERE case_id = ?', [cid]); run('UPDATE interventions SET selected = 0 WHERE case_id = ?', [cid]);
  const F = Object.fromEntries(q('SELECT fid, status, title FROM findings WHERE case_id = ? AND removed = 0', [cid]).map(f => [f.fid, f])), iv = Object.fromEntries(q('SELECT * FROM interventions WHERE case_id = ?', [cid]).map(v => [v.code, v]));
  const confirmed = f => f && /Confirmed|Verified/.test(f.status), pick = (code, reason) => { run('UPDATE interventions SET selected = 1 WHERE case_id = ? AND code = ?', [cid, code]); run('INSERT INTO auto_choices VALUES (?,?,?)', [cid, code, reason]); };
  if (confirmed(F.F1)) {
    const opts = ['TR', 'ES'].filter(c => iv[c]).sort((a, b) => iv[a].cost_inr - iv[b].cost_inr || a.localeCompare(b)), best = opts[0];
    if (best) pick(best, `Addresses the confirmed concern "${F.F1.title}"; the cheapest of ${opts.map(c => `${c} (${iv[c].cost_inr})`).join(' and ')}`);
  }
  if (confirmed(F.F2) && iv.SEA) pick('SEA', `Addresses the verified concern "${F.F2.title}"; no new cost`);
  logCase(cid, 'Full control', 'Selected the best policies', q('SELECT code FROM auto_choices WHERE case_id = ?', [cid]).map(x => x.code).join(', ') || 'none needed');
}

/* Stage 3 to 5: enter the field answers, then policies, budget, ranking and the final screen. */
export async function submitFieldAndDecide(inv, answers, onLog = () => {}) {
  const log = t => { addLog(inv, t); onLog(t); }, old = CONFIG.stepDelayMs; CONFIG.stepDelayMs = 60;
  try {
    setStage(inv, 'policy');
    for (const t of tracks(inv)) { log(`${school(t.to_id).name}: updating the evidence from the field answers`); await runFieldUpdate(t.case_id, answers[t.case_id] || {}); }
    for (const t of tracks(inv)) { const B = school(t.to_id); log(`${B.name}: retrieving policy and pricing interventions`); await runPolicy(t.case_id); selectBestPolicies(t.case_id); log(`${B.name}: selected ${q('SELECT code FROM auto_choices WHERE case_id = ?', [t.case_id]).map(x => x.code).join(', ') || 'no intervention (none needed)'}`); }
    log('Comparing the candidates and ranking them'); const sg = await runSuggestion(inv), cmp = await tools.compare_options({ inv_id: inv }), sug = await tools.suggest_option({ comparison: cmp });
    const out = buildFinal(inv, cmp, sug, sg);
    log('Drafting the report'); const bestId = out.best_if_merge, ct = tracks(inv).find(t => t.to_id === bestId), { draft, critique } = await runDraft(ct.case_id);
    out.report = buildReport(inv, out, ct.case_id, draft.sentences, critique);
    setStage(inv, 'final', out); logCase(inv, 'Full control', 'Final screen ready', `${out.recommended_name}; nothing submitted, the officer decides`); log('Final screen ready.');
  } finally { CONFIG.stepDelayMs = old; }
}

const fmt = n => Number(n).toLocaleString('en-IN');
function buildFinal(inv, C, S, sg) {
  const I = invRow(inv), A = school(I.from_id), best = C.options.find(o => o.school_id === (S.ranking[0] || S.best?.school_id)) || C.options.slice().sort((a, b) => a.walk_min - b.walk_min)[0];
  const cols = tracks(inv).map(t => {
    const sel = q('SELECT * FROM interventions WHERE case_id = ? AND selected = 1', [t.case_id]), why = Object.fromEntries(q('SELECT code, reason FROM auto_choices WHERE case_id = ?', [t.case_id]).map(x => [x.code, x.reason]));
    const yearly = sel.filter(s => s.cost_type === 'per year').reduce((a, s) => a + s.cost_inr, 0), oneTime = sel.filter(s => s.cost_type === 'one-time').reduce((a, s) => a + s.cost_inr, 0);
    const con = q('SELECT sum(sup) s, sum(opp) o, sum(n) n FROM concerns WHERE case_id = ?', [t.case_id])[0], fc = savedRun(t.case_id, 'feedbackChecker')?.out?.counts;
    return { school_id: t.to_id, name: school(t.to_id).name, case_id: t.case_id, items: sel.map(s => ({ code: s.code, title: s.title, cost_inr: s.cost_inr, cost_type: s.cost_type, formula: s.formula, reason: why[s.code] || '' })), yearly, oneTime, firstYear: yearly + oneTime, threeYear: yearly * 3 + oneTime,
      stance: { support: con.s || 0, oppose: con.o || 0, messages: con.n || 0 }, claims: fc || null };
  });
  const ret = q("SELECT * FROM interventions WHERE code = 'RET' AND case_id IN (SELECT case_id FROM cases WHERE inv_id = ?) ORDER BY case_id LIMIT 1", [inv])[0];
  const keep = ret ? { title: ret.title, cost_inr: ret.cost_inr, cost_type: ret.cost_type, formula: ret.formula } : null;
  const winner = S.suggested === 'keep' ? null : C.options.find(o => o.school_id === S.suggested);
  const whyNot = C.options.filter(o => !winner || o.school_id !== winner.school_id).map(o => {
    const pts = [], ref = winner || best;
    if (!o.enough_seats) pts.push(`Not enough seats: ${o.seats_available} free for ${C.students} students`);
    if (o.walk_km > C.walk_limit_km) pts.push(`Walking distance ${o.walk_km} km is beyond the ${C.walk_limit_km} km limit`);
    if (ref && o.school_id !== ref.school_id) {
      if (o.confirmed_concerns > ref.confirmed_concerns) pts.push(`More confirmed concerns: ${o.confirmed_concerns} against ${ref.confirmed_concerns} for ${ref.name}`);
      if (o.walk_min > ref.walk_min) pts.push(`Longer walk: about ${o.walk_min} min against ${ref.walk_min} min for ${ref.name}`);
      if (o.first_year_total > ref.first_year_total) pts.push(`Higher first-year cost: ₹${fmt(o.first_year_total)} against ₹${fmt(ref.first_year_total)} for ${ref.name}`);
    }
    return { school_id: o.school_id, name: o.name, points: pts.length ? pts : ['Close to the recommended option on every measure'] };
  });
  const reasons = (sg.reasons || []).map(r => ({ text: r.text, refs: r.refs }));
  const open = [];
  tracks(inv).forEach(t => { const B = school(t.to_id).name, un = q("SELECT count(*) n FROM field_questions WHERE case_id = ? AND answer = '' AND note = ''", [t.case_id])[0].n; if (un) open.push(`${B}: ${un} field question(s) left unanswered`);
    const tp = savedRun(t.case_id, 'transportPlanner')?.out; if (tp?.open_questions?.length) open.push(`${B}: bus timetable and pickup stops still need confirmation on the ground`);
    const fc = savedRun(t.case_id, 'feedbackChecker')?.out?.counts; if (fc?.unchecked) open.push(`${B}: ${fc.unchecked} citizen claims could not be checked`); });
  return { ranking: S.ranking, recommended: S.suggested, recommended_name: S.suggested_name, best_if_merge: best.school_id, best_if_merge_name: best.name, closing_school: A.name, students: C.students, walk_limit_km: C.walk_limit_km, reasons, would_change: sg.would_change || [], comparison: C, why_not: whyNot, budget: { columns: cols, keep }, open_issues: open, mode: sg.mode };
}

function buildReport(inv, out, cid, draftSentences, critique) {
  const A = out.closing_school, B = out.best_if_merge_name, tp = savedRun(cid, 'transportPlanner')?.out, fc = savedRun(cid, 'feedbackChecker')?.out, col = out.budget.columns.find(c => c.case_id === cid);
  const sections = [
    { title: 'Summary', sentences: [{ text: `${A} has ${out.students} students. ${out.recommended === 'keep' ? `The analysis suggests keeping and repairing ${A}; if the merger goes ahead the best candidate is ${B}.` : `The analysis suggests ${out.recommended_name} as the receiving school.`} This is a suggestion; the officer decides.`, refs: [] }] },
    { title: 'Rationale (drafted from the case evidence)', sentences: draftSentences },
    ...(fc ? [{ title: 'What citizens say and what checks show', sentences: fc.sentences }] : []), ...(tp ? [{ title: 'Transport plan', sentences: tp.sentences }] : []),
    { title: 'Why this option', sentences: [...out.reasons, ...out.would_change] },
    { title: 'Budget', sentences: (col?.items.length ? col.items.map(i => ({ text: `${i.title}: ${i.cost_inr ? `₹${fmt(i.cost_inr)} ${i.cost_type}` : 'no new cost'} (${i.formula}). ${i.reason}`, refs: [] })) : [{ text: 'No intervention was found necessary for this candidate.', refs: [] }]).concat(col ? [{ text: `First-year total ₹${fmt(col.firstYear)}; three-year total ₹${fmt(col.threeYear)} (yearly costs counted three times plus one-time costs).`, refs: [] }] : []) },
    { title: 'Still to be confirmed', sentences: (out.open_issues.length ? out.open_issues : ['No outstanding checks were found.']).map(t => ({ text: t, refs: [] })) },
  ];
  return { case_id: cid, sections, critique: { pass: critique.pass, issues: critique.issues } };
}
export const reportText = (out, header) => `${header}\n\n` + out.report.sections.map(s => `${s.title.toUpperCase()}\n${s.sentences.map(x => `- ${x.text}${x.refs?.length ? ` [${x.refs.join(', ')}]` : ''}`).join('\n')}`).join('\n\n') + '\n\nThis report was prepared by PathShala Full control. It is a suggestion; the officer decides and submits.\n';

/* Officer adopts the recommendation: records the choice; submitting stays on the Report step. */
export function adoptRecommendation(inv) {
  const f = fullRow(inv), out = f.out;
  if (out.recommended === 'keep') { run('UPDATE suggestions SET accepted = 1 WHERE inv_id = ?', [inv]); logCase(inv, 'Officer', 'Adopted: keep and repair the closing school', out.closing_school); save(); return null; }
  run('UPDATE suggestions SET accepted = 1 WHERE inv_id = ?', [inv]); chooseFinal(inv, out.recommended); return out.recommended;
}
