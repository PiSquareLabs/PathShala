/* Draft rationale sentences, built only from evidence already in the case. Each sentence ends with its references. */
import { walkProfile } from './analysis.js';
import { q, q1 } from '../db/sqlite.js';
import { linkOf, school } from '../ui/helpers.js';

export const NO_INTERVENTION = 'No intervention has been selected yet.';

export function draftSentences(cid) {
  const c = q1('SELECT * FROM cases WHERE case_id = ?', [cid]), A = school(c.from_id), B = school(c.to_id), L = linkOf(c.from_id, c.to_id), wp = walkProfile(L);
  const ev = {}; q('SELECT * FROM evidence WHERE case_id = ?', [cid]).forEach(e => { ev[e.eid] = e; });
  const fq = {}; q('SELECT * FROM field_questions WHERE case_id = ?', [cid]).forEach(x => { fq[x.qid] = x; });
  const habs = q('SELECT count(*) AS n, sum(children) AS k FROM habitations WHERE school_id = ?', [A.school_id])[0];
  const kids = +fq.Q2?.answer || habs.k || A.enrol_total;
  const sel = q('SELECT * FROM interventions WHERE case_id = ? AND selected = 1', [cid]);
  const removed = new Set(q('SELECT fid FROM findings WHERE case_id = ? AND removed = 1', [cid]).map(x => x.fid));
  const nT = q1("SELECT count(*) AS n FROM citizen_feedback WHERE school_id IN (?,?) AND theme = 'Transport'", [A.school_id, B.school_id]).n;
  const nS = q1("SELECT count(*) AS n FROM citizen_feedback WHERE school_id IN (?,?) AND theme = 'Seasonal access'", [A.school_id, B.school_id]).n;
  const parts = [
    [`The proposed consolidation of ${A.name} into ${B.name} would affect ${kids} students across ${habs.n} habitations.`, ['E4', fq.Q2?.answer ? 'E15' : null]],
    [`The receiving school is approximately ${L.road_km} km away by road (about ${L.road_min} minutes by vehicle); the footpath is ${L.walk_km} km, an estimated ${wp.min} minutes for a young child.`, ['E2', 'E3']],
    !removed.has('F1') || !removed.has('F2') ? [`Community feedback identifies transport (${nT} responses) and seasonal access (${nS}) as recurring concerns${ev.E8 ? ', and field evidence reports a seasonal bridge issue on the walking route' : ''}.`, ['E1', 'E6', 'E8']] : null,
    fq.Q1?.answer && fq.Q1.answer !== 'Yes' ? [`Field verification confirms the river crossing is ${fq.Q1.answer === 'No' ? 'not passable' : 'not reliably passable'} in heavy rain.`, ['E14']] : null,
    fq.Q3?.answer === 'No' ? ['Public transport is not available at school arrival and departure times.', ['E5']] : null,
    sel.length ? [`Based on these documented conditions, ${sel.map(s => s.title.toLowerCase()).join(' and ')} may be relevant to mitigate access constraints, subject to applicable eligibility and administrative approval.`, sel.flatMap(s => JSON.parse(s.chunk_ids))] : [NO_INTERVENTION, []],
  ].filter(Boolean);
  return parts.map(([text, refs]) => ({ text, refs: refs.filter(Boolean) }));
}
