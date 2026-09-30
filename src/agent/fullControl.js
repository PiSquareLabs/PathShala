/* Full control: one guided run of the whole flow. The officer picks ONE closing school; the AI finds the candidate receiving schools
   and researches every one (feedback, investigation, Transport Planner, Feedback Checker). It then STOPS at the field stage and
   generates a field form for the officer. After the officer enters the answers, it updates the evidence, picks the best policies
   for each candidate, calculates the budget, ranks the candidates and prepares the final screen: recommendation, comparison,
   budget, full report text. Every step is logged. Nothing is submitted, and the officer adopts or changes the choice. */
import { nearby } from '../case/analysis.js';
import { chooseFinal, createCase, hasResults, invRow, tracks } from '../case/options.js';
import { saveFieldAnswers } from '../case/findings.js';
import { q, q1, run, save } from '../db/sqlite.js';
import { logCase, school } from '../ui/helpers.js';
import { ensureFeedback } from './feedbackAgents.js';
import { addFieldQuestions, runResearch, runSuggestion } from './research.js';
import { CONFIG } from './provider.js';
import { runDraft, runFieldUpdate, runInvestigation, runPolicy } from './runner.js';
import { tools } from './tools.js';
import { savedRun } from './loop.js';
import { plainStep } from './plain.js';
import { llmConfigured, llmJson } from './llm.js';

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

/* ---- Step workers. Full control drives the ordinary case screens: each screen's automatic work is done here, then the
   screen is shown and the flow moves on. Stages: research -> field (waits for the officer) -> answered -> policy -> report -> final. ---- */
export const AUTO_NEXT = { compare: 'feedback', feedback: 'evidence', evidence: 'investigate', policy: 'report' };
const done = (t, a) => !!savedRun(t.case_id, a);
export function needsWork(inv, step) {
  const f = fullRow(inv); if (!f) return false;
  const ts = tracks(inv);
  if (step === 'feedback') return ts.some(t => !done(t, 'feedbackChecker'));
  if (step === 'evidence') return ts.some(t => !done(t, 'transportPlanner'));
  if (step === 'investigate') return f.stage === 'answered' || (f.stage === 'research' && ts.every(t => done(t, 'feedbackChecker') && done(t, 'transportPlanner')));
  if (step === 'policy') return f.stage === 'policy';
  if (step === 'report') return f.stage === 'report';
  return false;
}
/* The next screen whose work is still to be done, or null while waiting for the field officer or when everything is finished.
   The background runner calls this in a loop, so the AI keeps going whichever screen the officer is looking at. */
export function nextWork(inv, tried = new Set()) { return ['feedback', 'evidence', 'investigate', 'policy', 'report'].find(s => needsWork(inv, s) && !tried.has(s + ':' + fullRow(inv).stage)) || null; }
/* What the banner and the auto-advance do next for a finished screen: a step name, 'wait' or null. */
const seen = new Set();   // screens the officer has already been taken to (in this browser session)
export const markSeen = (inv, step) => seen.add(inv + step);
export function nextAfter(inv, step) {
  const f = fullRow(inv); if (!f) return null;
  const early = f.stage === 'research' || (f.stage === 'field' && !seen.has(inv + 'investigate'));   // the first pass through the screens; afterwards the officer navigates freely
  if (step === 'compare') return early ? 'feedback' : null;
  if (step === 'feedback') return early && !needsWork(inv, 'feedback') ? 'evidence' : null;
  if (step === 'evidence') return early && !needsWork(inv, 'evidence') ? 'investigate' : null;
  if (step === 'investigate') return f.stage === 'field' ? 'wait' : ['policy', 'report', 'final'].includes(f.stage) && !seen.has(inv + 'policy') ? 'policy' : null;
  if (step === 'policy') return (f.stage === 'report' || f.stage === 'final') && !seen.has(inv + 'report') ? 'report' : null;
  return null;
}
async function each(inv, log, fn) { const old = CONFIG.stepDelayMs; CONFIG.stepDelayMs = 60; try { for (const t of tracks(inv)) await fn(t, school(t.to_id), t => log(`${school(t.to_id).name}: `)); } finally { CONFIG.stepDelayMs = old; } }
export async function runWork(inv, step, onLog = () => {}) {
  const log = t => { addLog(inv, t); onLog(t, { level: 'stage' }); };
  const steps = () => { const ids = {}; return ev => { if (ev.type === 'start') ids[ev.seq] = onLog(plainStep(ev.tool, ev.args), { level: 'step', state: 'run', why: ev.reason }); else if (ev.type === 'step') onLog(null, { update: ids[ev.seq], state: 'done', summary: ev.summary }); }; };
  if (step === 'feedback') return each(inv, log, async (t, B) => { log(`${B.name}: reading what parents and villagers say`); await ensureFeedback(t.case_id); log(`${B.name}: checking what people say against the records, the map and news reports`); await runResearch('feedbackChecker', t.case_id, steps()); });
  if (step === 'evidence') return each(inv, log, async (t, B) => { log(`${B.name}: planning how the children could travel there`); await runResearch('transportPlanner', t.case_id, steps()); });
  if (step === 'investigate') {
    const f = fullRow(inv);
    if (f.stage === 'research') {
      await each(inv, log, async (t, B) => {
        if (!hasResults(t.case_id)) { log(`${B.name}: studying the school: children affected, the route, the geography, transport and what is still unknown`); await runInvestigation(t.case_id, ev => { if (ev.type === 'step') onLog(ev.label, { level: 'step', state: 'done' }); }); }
        const tp = savedRun(t.case_id, 'transportPlanner')?.out, fc = savedRun(t.case_id, 'feedbackChecker')?.out;
        run("DELETE FROM field_questions WHERE case_id = ? AND qid IN ('Q4','Q5') AND COALESCE(answer,'') = '' AND COALESCE(note,'') = ''", [t.case_id]);   // the form stays short: three standard questions and the one the research found most important for this school
        const n = addFieldQuestions(t.case_id, [...(tp?.open_questions || []), ...(fc?.open_questions || [])].slice(0, 1)); log(`${B.name}: field form ready (${q('SELECT count(*) n FROM field_questions WHERE case_id = ?', [t.case_id])[0].n} questions, tailored to this school)`);
      });
      log('The field form is ready. Waiting for the field officer to fill it in.'); setStage(inv, 'field'); logCase(inv, 'System', 'Full control is waiting for the field officer', 'Field form generated');
    } else if (f.stage === 'answered') {
      await each(inv, log, async (t, B) => { log(`${B.name}: updating the picture with the field officer's answers`); const ans = Object.fromEntries(q('SELECT qid, answer, note FROM field_questions WHERE case_id = ?', [t.case_id]).map(x => [x.qid, { v: x.answer || '', note: x.note || '' }])); await runFieldUpdate(t.case_id, ans); });
      setStage(inv, 'policy');
    }
    return;
  }
  if (step === 'policy') { await each(inv, log, async (t, B) => { log(`${B.name}: finding the government rules that apply and working out the costs`); await runPolicy(t.case_id); const r = await selectBestPolicies(t.case_id); log(`${B.name}: ${r.mode === 'Gemini' ? 'Gemini' : 'rules'} chose ${r.pick.join(', ') || 'no intervention (none needed)'}, with a reason for every option`); }); setStage(inv, 'report'); return; }
  if (step === 'report') {
    const old = CONFIG.stepDelayMs; CONFIG.stepDelayMs = 60;
    try {
      log('Comparing the schools and weighing the trade-offs'); const sg = await runSuggestion(inv), cmp = await tools.compare_options({ inv_id: inv }), sug = await tools.suggest_option({ comparison: cmp }), out = buildFinal(inv, cmp, sug, sg);
      log('Writing the report'); const ct = tracks(inv).find(t => t.to_id === out.best_if_merge), { draft, critique } = await runDraft(ct.case_id);
      out.report = buildReport(inv, out, ct.case_id, draft.sentences, critique); setStage(inv, 'final', out); logCase(inv, 'Full control', 'Final report ready', `${out.recommended_name}; nothing submitted, the officer decides`); log('Final report ready.');
    } finally { CONFIG.stepDelayMs = old; }
  }
}

/* The officer changed policies after the report was built: rebuild the report from the new ticks when it is next opened. */
export function reopenReport(inv) { const f = fullRow(inv); if (f?.stage === 'final') setStage(inv, 'report'); }

/* The officer submits the field form: answers are stored and the flow continues automatically. */
export function submitFieldForm(inv, answers) { Object.entries(answers).forEach(([cid, a]) => saveFieldAnswers(cid, a)); setStage(inv, 'answered'); logCase(inv, 'Officer', 'Submitted the field form', 'Full control continues'); }

export const fieldForm = inv => tracks(inv).map(t => ({ track: t, school: school(t.to_id), questions: q('SELECT * FROM field_questions WHERE case_id = ? ORDER BY seq', [t.case_id]) }));

/* Best policies for one candidate. The rule below always runs: for each confirmed concern take the cheapest intervention that
   addresses it. With a Gemini key the model chooses from the same list and must give a reason for every option; its answer is
   accepted only if every code exists, otherwise the rule's choice stands. The reasons are stored (auto_choices: a chosen code
   holds its reason, "not:<reason>" a rejected one, "_mode" who chose) and shown on the Policy screen; the officer can change any tick. */
function ruleChoice(cid) {
  const F = Object.fromEntries(q('SELECT fid, status, title FROM findings WHERE case_id = ? AND removed = 0', [cid]).map(f => [f.fid, f])), iv = Object.fromEntries(q('SELECT * FROM interventions WHERE case_id = ?', [cid]).map(v => [v.code, v]));
  const confirmed = f => f && /Confirmed|Verified/.test(f.status), pick = {}, no = {};
  if (confirmed(F.F1)) {
    const opts = ['TR', 'ES'].filter(c => iv[c]).sort((a, b) => iv[a].cost_inr - iv[b].cost_inr || a.localeCompare(b)), best = opts[0];
    if (best) { pick[best] = `Addresses the confirmed concern "${F.F1.title}"; the cheapest of ${opts.map(c => `${c} (${fmt(iv[c].cost_inr)})`).join(' and ')}`; opts.slice(1).forEach(c => { no[c] = `Also addresses "${F.F1.title}" but costs more than ${best}`; }); }
  } else ['TR', 'ES'].filter(c => iv[c]).forEach(c => { no[c] = 'The distance and travel concern is not confirmed, so no transport cost is needed'; });
  if (iv.SEA) { if (confirmed(F.F2)) pick.SEA = `Addresses the verified concern "${F.F2.title}"; no new cost`; else no.SEA = 'No verified seasonal-access concern'; }
  Object.keys(iv).forEach(c => { if (!pick[c] && !no[c]) no[c] = 'No confirmed concern needs it'; });
  return { pick, no };
}
export async function selectBestPolicies(cid) {
  const iv = q('SELECT code, title, cost_inr, cost_type, why FROM interventions WHERE case_id = ?', [cid]), base = ruleChoice(cid); let { pick, no } = base, mode = 'rules';
  if (llmConfigured() && iv.length) {
    try {
      const fnd = q("SELECT fid, title, status FROM findings WHERE case_id = ? AND removed = 0", [cid]);
      const out = await llmJson({ system: 'You choose school-merger interventions for a district education officer. Choose only from the listed codes. Prefer interventions that address a confirmed finding at the lowest cost. Reply as JSON: {"choices":[{"code":"TR","chosen":true,"reason":"one plain sentence"}]} with one entry for every listed code. Do not invent numbers.', messages: [{ role: 'user', content: JSON.stringify({ findings: fnd, interventions: iv }) }], max_tokens: 1024 }, 2);
      const ch = out.choices; if (!Array.isArray(ch) || iv.some(v => !ch.find(c => c.code === v.code && typeof c.reason === 'string' && c.reason))) throw new Error('choices not understood');
      pick = {}; no = {}; ch.filter(c => iv.find(v => v.code === c.code)).forEach(c => { (c.chosen ? pick : no)[c.code] = c.reason; }); mode = 'Gemini';
    } catch (e) { addLogCase(cid, `Gemini policy choice not used (${e.message}); the rule's choice stands`); pick = base.pick; no = base.no; }
  }
  run('DELETE FROM auto_choices WHERE case_id = ?', [cid]); run('UPDATE interventions SET selected = 0 WHERE case_id = ?', [cid]);
  Object.entries(pick).forEach(([c, r]) => { run('UPDATE interventions SET selected = 1 WHERE case_id = ? AND code = ?', [cid, c]); run('INSERT INTO auto_choices VALUES (?,?,?)', [cid, c, r]); });
  Object.entries(no).forEach(([c, r]) => run('INSERT INTO auto_choices VALUES (?,?,?)', [cid, c, 'not:' + r])); run('INSERT INTO auto_choices VALUES (?,?,?)', [cid, '_mode', mode]);
  logCase(cid, 'Full control', `Selected the best policies (${mode})`, Object.keys(pick).join(', ') || 'none needed'); save();
  return { pick: Object.keys(pick), mode };
}
const addLogCase = (cid, t) => logCase(cid, 'Full control', t, '');
/* What the AI chose for one candidate, for the Policy screen. */
export function policyChoice(cid) {
  const rows = q('SELECT code, reason FROM auto_choices WHERE case_id = ?', [cid]); if (!rows.length) return null;
  const by = {}; let mode = 'rules'; rows.forEach(r => { if (r.code === '_mode') mode = r.reason; else by[r.code] = r.reason.startsWith('not:') ? { chosen: false, reason: r.reason.slice(4) } : { chosen: true, reason: r.reason }; });
  return { by, mode };
}

const fmt = n => Number(n).toLocaleString('en-IN');
function buildFinal(inv, C, S, sg) {
  const I = invRow(inv), A = school(I.from_id), best = C.options.find(o => o.school_id === (S.ranking[0] || S.best?.school_id)) || C.options.slice().sort((a, b) => a.walk_min - b.walk_min)[0];
  const cols = tracks(inv).map(t => {
    const sel = q('SELECT * FROM interventions WHERE case_id = ? AND selected = 1', [t.case_id]), why = Object.fromEntries(q('SELECT code, reason FROM auto_choices WHERE case_id = ?', [t.case_id]).map(x => [x.code, x.reason]));
    const yearly = sel.filter(s => s.cost_type === 'per year').reduce((a, s) => a + s.cost_inr, 0), oneTime = sel.filter(s => s.cost_type === 'one-time').reduce((a, s) => a + s.cost_inr, 0);
    const con = q('SELECT sum(sup) s, sum(opp) o, sum(n) n FROM concerns WHERE case_id = ?', [t.case_id])[0], fc = savedRun(t.case_id, 'feedbackChecker')?.out?.counts;
    return { school_id: t.to_id, name: school(t.to_id).name, case_id: t.case_id, items: sel.map(s => ({ code: s.code, title: s.title, cost_inr: s.cost_inr, cost_type: s.cost_type, formula: s.formula, reason: why[s.code] && !why[s.code].startsWith('not:') ? why[s.code] : 'Added by the officer' })), yearly, oneTime, firstYear: yearly + oneTime, threeYear: yearly * 3 + oneTime,
      stance: { support: con.s || 0, oppose: con.o || 0, messages: con.n || 0 }, claims: fc || null };
  });
  const ret = q("SELECT * FROM interventions WHERE code = 'RET' AND case_id IN (SELECT case_id FROM cases WHERE inv_id = ?) ORDER BY case_id LIMIT 1", [inv])[0];
  const keep = ret ? { title: ret.title, cost_inr: ret.cost_inr, cost_type: ret.cost_type, formula: ret.formula } : null;
  const byCost = cols.slice().sort((a, b) => a.firstYear - b.firstYear || a.name.localeCompare(b.name)), notes = [];
  const rc = cols.find(c => c.school_id === best.school_id);
  notes.push(`For each school the AI picked only the policies that school's problems call for (${cols.map(c => `${c.name}: ${c.items.length ? c.items.map(i => i.title).join(' + ') : 'none needed'}`).join('; ')}), then compared the budgets.`);
  if (byCost.length > 1) notes.push(`Lowest first-year cost: ${byCost[0].name} at ${byCost[0].firstYear ? '₹' + fmt(byCost[0].firstYear) : 'no new cost'}; highest: ${byCost[byCost.length - 1].name} at ${byCost[byCost.length - 1].firstYear ? '₹' + fmt(byCost[byCost.length - 1].firstYear) : 'no new cost'}.`);
  if (rc && byCost.length > 1) { const d = rc.firstYear - byCost[0].firstYear; notes.push(d > 0 ? `${rc.name}, the best candidate if the merger goes ahead, costs ₹${fmt(d)} more in the first year than the cheapest option, ${byCost[0].name}.` : `${rc.name}, the best candidate if the merger goes ahead, is also the cheapest in the first year.`); }
  if (keep) notes.push(`Keeping and repairing ${A.name} would cost ₹${fmt(keep.cost_inr)} ${keep.cost_type}.`);
  const winner = S.suggested === 'keep' ? null : C.options.find(o => o.school_id === S.suggested);
  const whyNot = C.options.filter(o => !winner || o.school_id !== winner.school_id).map(o => {
    const pts = [], ref = winner || best;
    if (S.scores?.[o.school_id] && ref && ref.school_id !== o.school_id && S.scores[ref.school_id]) pts.push(`Overall score ${S.scores[o.school_id].total} against ${S.scores[ref.school_id].total} for ${ref.name}`);
    if (!o.enough_seats) pts.push(`Not enough seats: ${o.seats_available} free for ${C.students} students`);
    if (o.walk_km > C.walk_limit_km) pts.push(`Walking distance ${o.walk_km} km is beyond the ${C.walk_limit_km} km limit`);
    if (ref && o.school_id !== ref.school_id) {
      if (o.confirmed_concerns > ref.confirmed_concerns) pts.push(`More confirmed concerns: ${o.confirmed_concerns} against ${ref.confirmed_concerns} for ${ref.name}`);
      if ((o.terrain || []).length > (ref.terrain || []).length) pts.push(`More terrain risk on the way: ${o.terrain.join(', ')} (${ref.name}: ${ref.terrain.length ? ref.terrain.join(', ') : 'none recorded'})`);
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
  return { scores: S.scores || {}, weights: S.weights || {}, edge: S.edge || null, ranking: S.ranking, recommended: S.suggested, recommended_name: S.suggested_name, best_if_merge: best.school_id, best_if_merge_name: best.name, closing_school: A.name, students: C.students, walk_limit_km: C.walk_limit_km, reasons, would_change: sg.would_change || [], comparison: C, why_not: whyNot, budget: { columns: cols, keep }, open_issues: open, mode: sg.mode, budget_notes: notes };
}

function buildReport(inv, out, cid, draftSentences, critique) {
  const A = out.closing_school, B = out.best_if_merge_name, tp = savedRun(cid, 'transportPlanner')?.out, fc = savedRun(cid, 'feedbackChecker')?.out, col = out.budget.columns.find(c => c.case_id === cid);
  const sections = [
    { title: 'Summary', sentences: [{ text: `${A} has ${out.students} students. ${out.recommended === 'keep' ? `The analysis suggests keeping and repairing ${A}; if the merger goes ahead the best candidate is ${B}.` : `The analysis suggests ${out.recommended_name} as the receiving school.`} This is a suggestion; the officer decides.`, refs: [] }] },
    { title: 'Rationale (drafted from the case evidence)', sentences: draftSentences },
    ...(fc ? [{ title: 'What citizens say and what checks show', sentences: fc.sentences }] : []), ...(tp ? [{ title: 'Transport plan', sentences: tp.sentences }] : []),
    { title: 'Why this option', sentences: [...out.reasons, ...out.would_change] },
    { title: 'Budget compared across schools', sentences: out.budget_notes.map(t => ({ text: t, refs: [] })) },
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
