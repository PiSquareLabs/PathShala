/* An investigation is one closing school and one or more candidate receiving schools. Each candidate is a "track":
   a row of `cases` (id like C1-GSH) with its own findings, field answers, policy choices and report. The agents, the
   repository and the pages all work on a track. The officer chooses ONE school at the end, after comparing the totals
   (`investigations.chosen_id`). */
import { haversine, linkOf, logCase, school, today } from '../ui/helpers.js';
import { q, q1, run, save } from '../db/sqlite.js';
import { screen, walkProfile } from './analysis.js';

export const RESULT_TABLES = ['findings', 'evidence', 'field_questions', 'interventions', 'reports', 'agent_steps', 'feedback_class', 'concerns', 'research_runs', 'research_steps', 'research_evidence', 'auto_choices'];

export const invRow = inv => q1('SELECT * FROM investigations WHERE inv_id = ?', [inv]);
export const trackRow = tid => q1('SELECT * FROM cases WHERE case_id = ?', [tid]);
export const tracks = inv => q('SELECT * FROM cases WHERE inv_id = ? ORDER BY seq', [inv]);
export const trackId = (inv, schoolId) => `${inv}-${schoolId}`;
export const optionIds = inv => tracks(inv).map(t => t.to_id);
export const hasResults = tid => !!q1('SELECT 1 AS x FROM findings WHERE case_id = ?', [tid]);

/* Route facts for a pair; never invents data: without a surveyed link the numbers are straight-line estimates. */
export function routeInfo(aId, bId) {
  const A = school(aId), B = school(bId), L = linkOf(aId, bId), d = haversine(A, B);
  const wp = L ? walkProfile(L) : null;
  return {
    L, wp, est: !L, d: +d.toFixed(1),
    road_km: L ? L.road_km : +(d * 1.4).toFixed(1),
    road_min: L ? L.road_min : null,
    walk_km: L ? L.walk_km : +(d * 1.3).toFixed(1),
    walk_min: wp ? wp.min : Math.round(d * 1.3 / 2.4 * 60),
  };
}

const nextInvId = () => 'C' + (1 + Math.max(0, ...q('SELECT inv_id FROM investigations').map(x => +x.inv_id.slice(1) || 0)));
const addTrack = (inv, aId, bId, seq, status = 'Open') => run('INSERT INTO cases VALUES (?,?,?,?,?,?,?,?,?)', [trackId(inv, bId), inv, seq, aId, bId, status, today(), null, 'DEO Kullu']);

/* Open an investigation. Reuses an open one with the same closing school and the same candidates. */
export function createCase(aId, bIds) {
  const ids = [...new Set([].concat(bIds))];
  if (!ids.length) throw new Error('Pick at least one receiving school');
  const key = ids.slice().sort().join(',');
  const ex = q("SELECT inv_id FROM investigations WHERE from_id = ? AND status != 'Withdrawn'", [aId]).find(i => optionIds(i.inv_id).slice().sort().join(',') === key);
  if (ex) return ex.inv_id;
  const A = school(aId), ranked = ids.map(id => screen(A, school(id))).sort((x, y) => y.score - x.score).map(x => x.s.school_id);
  const inv = nextInvId();
  run('INSERT INTO investigations VALUES (?,?,?,?,?,?,?)', [inv, aId, null, 'Open', today(), null, 'DEO Kullu']);
  ranked.forEach((id, i) => addTrack(inv, aId, id, i + 1));
  logCase(inv, 'Officer', 'Opened investigation', `${A.name}: comparing ${ranked.map(id => school(id).name).join(', ')}`);
  save();
  return inv;
}

export function addOption(inv, schoolId) {
  if (optionIds(inv).includes(schoolId)) return;
  addTrack(inv, invRow(inv).from_id, schoolId, 1 + q1('SELECT max(seq) AS n FROM cases WHERE inv_id = ?', [inv]).n);
  logCase(inv, 'Officer', 'Added school to compare', school(schoolId).name);
  save();
}

export function removeOption(inv, schoolId) {
  if (optionIds(inv).length < 2 || !optionIds(inv).includes(schoolId)) return;
  const tid = trackId(inv, schoolId);
  RESULT_TABLES.forEach(t => run(`DELETE FROM ${t} WHERE case_id = ?`, [tid]));
  run('DELETE FROM case_log WHERE case_id = ?', [tid]);
  run('DELETE FROM cases WHERE case_id = ?', [tid]);
  if (invRow(inv).chosen_id === schoolId) run('UPDATE investigations SET chosen_id = NULL WHERE inv_id = ?', [inv]);
  logCase(inv, 'Officer', 'Removed school from comparison', school(schoolId).name);
  save();
}

/* The officer's final choice, made after the field report and policy selection of every option. Nothing is cleared. */
export function chooseFinal(inv, schoolId) {
  run('UPDATE investigations SET chosen_id = ? WHERE inv_id = ?', [schoolId, inv]);
  logCase(inv, 'Officer', 'Chose receiving school', school(schoolId).name);
  const sg = q1('SELECT suggested FROM suggestions WHERE inv_id = ?', [inv]);      // record both when the AI suggestion and the officer differ
  if (sg) { run('UPDATE suggestions SET officer_choice = ? WHERE inv_id = ?', [schoolId, inv]); if (sg.suggested !== schoolId) logCase(inv, 'System', 'Officer choice differs from the AI suggestion', `Suggested ${sg.suggested === 'keep' ? 'keep and repair the closing school' : school(sg.suggested)?.name}; officer chose ${school(schoolId).name}`); }
  save();
}

/* Per option: how far the investigation got, what it found and what the selected interventions cost. */
export function optionSummary(inv) {
  return tracks(inv).map(t => {
    const sel = q('SELECT * FROM interventions WHERE case_id = ? AND selected = 1', [t.case_id]);
    const fq = q('SELECT answer, note FROM field_questions WHERE case_id = ?', [t.case_id]);
    const F = q('SELECT status, kind FROM findings WHERE case_id = ? AND removed = 0', [t.case_id]);
    const sum = ty => sel.filter(s => s.cost_type === ty).reduce((a, s) => a + s.cost_inr, 0);
    return {
      track: t, school: school(t.to_id), investigated: hasResults(t.case_id), policyDone: !!q1('SELECT 1 AS x FROM interventions WHERE case_id = ?', [t.case_id]),
      answered: fq.filter(x => x.answer || x.note).length, questions: fq.length,
      confirmed: F.filter(f => f.kind !== 'context' && /Confirmed|Verified/.test(f.status)).length, issues: F.filter(f => f.kind !== 'context').length,
      selected: sel, yearly: sum('per year'), oneTime: sum('one-time'), unpriced: sel.filter(s => s.cost_type === 'unpriced').length,
    };
  });
}
