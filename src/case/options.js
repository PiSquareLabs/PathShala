/* A case is one sending school and one or more candidate receiving schools that are compared side by side.
   `cases.to_id` holds the option the officer chose to investigate further; case_options holds all candidates. */
import { haversine, linkOf, logCase, school, today } from '../ui/helpers.js';
import { q, q1, run, save } from '../db/sqlite.js';
import { screen, walkProfile } from './analysis.js';

export const CASE_RESULT_TABLES = ['findings', 'evidence', 'field_questions', 'interventions', 'reports', 'agent_steps'];

export const caseRow = cid => q1('SELECT * FROM cases WHERE case_id = ?', [cid]);

/* Candidate receiving schools of a case, in the order they were added. */
export function optionIds(cid) {
  const rows = q('SELECT school_id FROM case_options WHERE case_id = ? ORDER BY seq', [cid]).map(r => r.school_id);
  return rows.length ? rows : [caseRow(cid).to_id];
}

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

const nextCaseId = () => 'C' + (1 + Math.max(0, ...q('SELECT case_id FROM cases').map(x => +x.case_id.slice(1) || 0)));

/* Open an investigation: one sending school, several candidate receivers. Reuses an open case with the same set. */
export function createCase(aId, bIds) {
  const ids = [...new Set([].concat(bIds))];
  if (!ids.length) throw new Error('Pick at least one receiving school');
  const key = ids.slice().sort().join(',');
  const ex = q("SELECT case_id FROM cases WHERE from_id = ? AND status != 'Withdrawn'", [aId]).find(c => optionIds(c.case_id).slice().sort().join(',') === key);
  if (ex) return ex.case_id;
  const A = school(aId), ranked = ids.map(id => screen(A, school(id))).sort((x, y) => y.score - x.score).map(x => x.s.school_id), best = ranked[0];
  const cid = nextCaseId();
  run('INSERT INTO cases VALUES (?,?,?,?,?,?,?)', [cid, aId, best, 'Open', today(), null, 'DEO Kullu']);
  ranked.forEach((id, i) => run('INSERT INTO case_options VALUES (?,?,?)', [cid, id, i + 1]));
  logCase(cid, 'Officer', 'Opened investigation', `${A.name}: comparing ${ranked.map(id => school(id).name).join(', ')}`);
  save();
  return cid;
}

export function hasResults(cid) { return !!q1('SELECT 1 AS x FROM findings WHERE case_id = ?', [cid]); }

/* Choosing a different receiver invalidates the investigation results (they describe one specific route). */
export function chooseOption(cid, schoolId) {
  const c = caseRow(cid);
  if (c.to_id === schoolId) return false;
  const cleared = hasResults(cid);
  CASE_RESULT_TABLES.forEach(t => run(`DELETE FROM ${t} WHERE case_id = ?`, [cid]));
  run('UPDATE cases SET to_id = ? WHERE case_id = ?', [schoolId, cid]);
  logCase(cid, 'Officer', 'Chose receiving school', school(schoolId).name + (cleared ? ' (earlier investigation results cleared)' : ''));
  save();
  return cleared;
}

export function addOption(cid, schoolId) {
  if (optionIds(cid).includes(schoolId)) return;
  if (!q1('SELECT 1 AS x FROM case_options WHERE case_id = ?', [cid])) run('INSERT INTO case_options VALUES (?,?,?)', [cid, caseRow(cid).to_id, 1]);
  run('INSERT INTO case_options VALUES (?,?,?)', [cid, schoolId, 1 + q1('SELECT max(seq) AS n FROM case_options WHERE case_id = ?', [cid]).n]);
  logCase(cid, 'Officer', 'Added school to compare', school(schoolId).name);
  save();
}

export function removeOption(cid, schoolId) {
  const ids = optionIds(cid);
  if (ids.length < 2 || !ids.includes(schoolId)) return;
  run('DELETE FROM case_options WHERE case_id = ? AND school_id = ?', [cid, schoolId]);
  logCase(cid, 'Officer', 'Removed school from comparison', school(schoolId).name);
  if (caseRow(cid).to_id === schoolId) chooseOption(cid, ids.find(id => id !== schoolId));
  save();
}
