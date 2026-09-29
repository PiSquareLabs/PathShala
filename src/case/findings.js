import L from 'leaflet';
import { walkProfile } from './analysis.js';
import { q, q1, run } from '../db/sqlite.js';
import { P, capOf, inr, linkOf, logCase, route, school, today } from '../ui/helpers.js';

export function writeFindings(cid, ctx, A, B) {
  ['findings', 'evidence', 'field_questions', 'interventions', 'reports'].forEach(t => run(`DELETE FROM ${t} WHERE case_id = ?`, [cid]));
  const th = k => ctx.themes[k] || { n: 0, verified: 0, habs: new Set() };
  const F = (fid, title, kind, severity, summary, status) => run('INSERT INTO findings (case_id, fid, title, kind, severity, summary, status) VALUES (?,?,?,?,?,?,?)', [cid, fid, title, kind, severity, summary, status]);
  const E = (eid, fid, kind, status, label, detail, ref) => run('INSERT INTO evidence (case_id, eid, fid, kind, status, label, detail, ref) VALUES (?,?,?,?,?,?,?,?)', [cid, eid, fid, kind, status, label, detail, ref]);
  const bridge = ctx.hz.find(h => h.kind === 'bridge'), obsB = ctx.obs.find(o => o.kind === 'bridge'), obsBld = ctx.obs.find(o => o.kind === 'building');
  const bus = ctx.tr.find(t => t.kind === 'bus');
  const affectedHabs = new Set([...th('Transport').habs, ...th('Seasonal access').habs]);
  F('F1', 'Transport', 'primary', 'high', 'No transport at school times from the affected habitations; the walk is long and steep for young children.', 'Potential issue');
  E('E1', 'F1', 'feedback', 'reported', `${th('Transport').n} citizen responses mention transport`, 'Community feedback, classified by theme', 'theme:Transport');
  E('E2', 'F1', 'gis', 'calculated', `Walk ${ctx.wp.km} km, about ${ctx.wp.min} min for a young child`, `Tobler's hiking function on the route profile, child pace × ${ctx.wp.pace}; ${ctx.wp.climb} m up, ${ctx.wp.descent} m down`, 'route');
  E('E3', 'F1', 'gis', 'calculated', `Road ${ctx.road.km} km, about ${ctx.road.min} min by vehicle`, 'Road route along the Pekhri link road and the valley road', 'route');
  E('E4', 'F1', 'data', 'calculated', `${affectedHabs.size} habitations affected`, ctx.habs.map(h => `${h.name} (${h.children})`).join(', '), 'habitations');
  E('E5', 'F1', 'transport', 'needs', 'Actual transport availability', bus ? `${bus.name} departs ${bus.dep.join(', ')} — none in the school-time window; timetable not verified` : 'Data unavailable', 'transport');
  F('F2', 'Seasonal access', 'secondary', 'high', `The footpath crosses the Tirthan at ${bridge ? bridge.name : 'a river crossing'}, which floods in the monsoon.`, 'Potential issue');
  E('E6', 'F2', 'feedback', th('Seasonal access').verified ? 'verified' : 'reported', `${th('Seasonal access').n} citizen responses mention seasonal access`, `${th('Seasonal access').verified} of them checked against a field observation`, 'theme:Seasonal access');
  if (bridge) E('E7', 'F2', 'gis', 'calculated', `Walking route crosses ${bridge.name}`, `${bridge.detail}. Season: ${bridge.season}`, 'feature:' + bridge.feature_id);
  if (obsB) E('E8', 'F2', 'field', 'verified', 'Field evidence: seasonal bridge issue', `${obsB.text} (${obsB.observed_by}, ${obsB.observed_on})`, 'obs:' + obsB.obs_id);
  F('F3', 'Route safety for young children', 'secondary', 'medium', 'Steep path and a river crossing; parents worry about girls walking alone.', 'Potential issue');
  E('E9', 'F3', 'feedback', 'reported', `${th('Safety').n} citizen responses mention safety`, '', 'theme:Safety');
  E('E10', 'F3', 'gis', 'calculated', `${ctx.wp.steepKm} km of path steeper than 15%`, `Steepest stretch ${ctx.wp.maxSlope}%`, 'route');
  E('E11', 'F3', 'data', 'calculated', `${ctx.girls} of ${ctx.kids} affected students are girls; ${ctx.cwsn} with a disability`, 'Habitation records', 'habitations');
  const avail = Math.max(0, capOf(B) - B.enrol_total);
  F('F4', 'Receiving-school capacity', 'context', avail >= ctx.kids ? 'low' : 'high', avail >= ctx.kids ? `${B.name} has ${avail} free seats for ${ctx.kids} students.` : `${B.name} has only ${avail} free seats for ${ctx.kids} students.`, avail >= ctx.kids ? 'No issue found' : 'Potential issue');
  E('E12', 'F4', 'data', 'calculated', `${avail} seats available at ${B.name}`, `Capacity ${capOf(B)}, enrolled ${B.enrol_total}`, 'school:' + B.school_id);
  if (obsBld) { F('F5', `Building condition at ${A.name}`, 'context', 'medium', 'The current building is unsafe. Rebuilding is an alternative to merging.', 'Verified'); E('E13', 'F5', 'field', 'verified', obsBld.text, `${obsBld.observed_by}, ${obsBld.observed_on}`, 'obs:' + obsBld.obs_id); }
  const Q = (qid, seq, text, type, options, gap) => run('INSERT INTO field_questions (case_id, qid, seq, text, type, options, gap) VALUES (?,?,?,?,?,?,?)', [cid, qid, seq, text, type, JSON.stringify(options), gap]);
  Q('Q1', 1, `Is the ${bridge ? bridge.name : 'river crossing'} passable during heavy rain?`, 'choice', ['Yes', 'No', 'Seasonal'], ctx.gaps[0]);
  Q('Q2', 2, 'How many affected students currently use this route?', 'number', [], ctx.gaps[1]);
  Q('Q3', 3, 'Is public transport available at school arrival and departure times?', 'choice', ['Yes', 'No', 'Unknown'], ctx.gaps[2]);
  Q('Q4', 4, 'What is the approximate travel time during school hours?', 'minutes', [], ctx.gaps[3]);
  Q('Q5', 5, 'Upload supporting evidence', 'evidence', ['Photo', 'GPS', 'Note'], ctx.gaps[4]);
  logCase(cid, 'Agent', 'Investigation complete', `${ctx.rec.length} recurring concerns, ${ctx.gaps.length} evidence gaps`);
}
export function applyField(cid, ans) {
  const fq = q('SELECT * FROM field_questions WHERE case_id = ? ORDER BY seq', [cid]);
  fq.forEach(x => { const a = ans[x.qid]; if (a && (a.v !== '' && a.v != null || a.note)) run('UPDATE field_questions SET answer = ?, note = ?, answered_on = ? WHERE case_id = ? AND qid = ?', [a.v ?? '', a.note || '', today(), cid, x.qid]); });
  const A = {}; q('SELECT qid, answer, note FROM field_questions WHERE case_id = ?', [cid]).forEach(x => A[x.qid] = x);
  const up = (eid, fid, kind, status, label, detail) => run('INSERT OR REPLACE INTO evidence (case_id, eid, fid, kind, status, label, detail, ref) VALUES (?,?,?,?,?,?,?,?)', [cid, eid, fid, kind, status, label, detail, 'field']);
  if (A.Q1?.answer) {
    up('E14', 'F2', 'field', 'verified', `Field check: crossing ${A.Q1.answer === 'Yes' ? 'is passable in heavy rain' : A.Q1.answer === 'No' ? 'is not passable in heavy rain' : 'is passable only outside the monsoon'}`, A.Q1.note || '');
    run('UPDATE findings SET status = ? WHERE case_id = ? AND fid = ?', [A.Q1.answer === 'Yes' ? 'Not confirmed' : 'Verified', cid, 'F2']);
  }
  if (A.Q2?.answer) up('E15', 'F1', 'field', 'verified', `${A.Q2.answer} students use this route (field count)`, A.Q2.note || '');
  if (A.Q3?.answer) {
    if (A.Q3.answer !== 'Unknown') run("UPDATE evidence SET status = 'verified', label = ?, detail = detail || ' · checked in the field' WHERE case_id = ? AND eid = 'E5'", [A.Q3.answer === 'No' ? 'Public transport unavailable during school hours' : 'Public transport available at school times', cid]);
    run('UPDATE findings SET status = ? WHERE case_id = ? AND fid = ?', [A.Q3.answer === 'No' ? 'Confirmed concern' : A.Q3.answer === 'Yes' ? 'Partly addressed' : 'Potential issue', cid, 'F1']);
  }
  if (A.Q4?.answer) up('E16', 'F1', 'field', 'verified', `Measured travel time about ${A.Q4.answer} min during school hours`, 'Compared with the calculated walking time');
  if (A.Q5?.answer || A.Q5?.note) up('E17', 'F2', 'field', 'verified', `Supporting evidence attached: ${A.Q5.answer || 'note'}`, A.Q5.note || '');
  if (A.Q2?.answer || A.Q3?.answer === 'No') run("UPDATE findings SET status = 'Confirmed concern' WHERE case_id = ? AND fid = 'F1' AND status != 'Partly addressed'", [cid]);
  logCase(cid, 'Field officer', 'Field verification submitted', Object.entries(A).filter(([, v]) => v.answer || v.note).map(([k, v]) => `${k}: ${v.answer || v.note}`).join('; '));
}
export function buildInterventions(cid, ctx) {
  const keep = new Set(q('SELECT code FROM interventions WHERE case_id = ? AND selected = 1', [cid]).map(x => x.code));
  run('DELETE FROM interventions WHERE case_id = ?', [cid]);
  const R = P(), c = q1('SELECT * FROM cases WHERE case_id = ?', [cid]), A = school(c.from_id), L = linkOf(c.from_id, c.to_id);
  const kids = +(q1("SELECT answer FROM field_questions WHERE case_id = ? AND qid = 'Q2'", [cid])?.answer) || q1('SELECT sum(children) AS n FROM habitations WHERE school_id = ?', [A.school_id]).n || A.enrol_total;
  const rate = 6000, seats = R.vehicle_seats || 30, veh = Math.ceil(kids / seats);
  const I = (code, title, chunks, why, inputs, formula, cost, type) => run('INSERT INTO interventions (case_id, code, title, chunk_ids, why, inputs, formula, cost_inr, cost_type) VALUES (?,?,?,?,?,?,?,?,?)', [cid, code, title, JSON.stringify(chunks), why, JSON.stringify(inputs), formula, cost, type]);
  I('TR', 'School transport support', ['C6', 'C4', 'C7'], 'The consolidation increases travel for the affected students, and field verification and community feedback identify transport and access constraints.',
    [['Eligible students', kids, kids === A.enrol_total ? 'School roll' : 'Field count (Q2)'], ['Required route', `${L.road_km} km by road`, 'GIS calculation'], ['Vehicle requirement', veh, `${kids} ÷ ${seats} seats, rounded up`], ['Applicable rate', '₹6,000 per child per year (average)', 'Samagra Shiksha norm, C6']],
    `${kids} × ₹6,000`, kids * rate, 'per year');
  I('ES', 'Escort for young children on the footpath', ['C6'], 'When the footbridge is open, an adult escort can walk the youngest children; the same Samagra Shiksha norm covers escort facility.',
    [['Eligible students (Classes 1–2, estimate)', Math.ceil(kids * 0.4), '40% of roll — needs verification'], ['Applicable rate', '₹6,000 per child per year (average)', 'C6']],
    `${Math.ceil(kids * 0.4)} × ₹6,000`, Math.ceil(kids * 0.4) * rate, 'per year');
  I('SEA', 'Monsoon learning point at Pekhri (Jul–Sep)', ['C3'], 'RTE Rule 6(3) asks the government to avoid dangers from floods and difficult terrain on the route; a seasonal learning point keeps children off the crossing when it floods.',
    [['Months', 'Jul–Sep', 'Bridge season (feature BR1)'], ['Staff', '1 teacher on rotation', 'Existing staff']], 'Existing staff; no new cost', 0, 'none');
  I('RET', `Keep ${A.name} and replace the building`, ['C3', 'C1'], `Children under 11 must have a school within 1 km (Rule 6(1)(a)). The case shows the alternative school is ${L.walk_km} km on foot across a flood-prone crossing.`,
    [['Classrooms', 2, 'Planning assumption'], ['Rate', inr(R.classroom_cost) + ' per classroom', 'HP PAB 2025-26 (rule R8)']], `2 × ${inr(R.classroom_cost)}`, 2 * R.classroom_cost, 'one-time');
  keep.forEach(k => run('UPDATE interventions SET selected = 1 WHERE case_id = ? AND code = ?', [cid, k]));
}
export function draftText(cid) {
  const c = q1('SELECT * FROM cases WHERE case_id = ?', [cid]), A = school(c.from_id), B = school(c.to_id), L = linkOf(c.from_id, c.to_id), wp = walkProfile(L);
  const ev = {}; q('SELECT * FROM evidence WHERE case_id = ?', [cid]).forEach(e => ev[e.eid] = e);
  const fq = {}; q('SELECT * FROM field_questions WHERE case_id = ?', [cid]).forEach(x => fq[x.qid] = x);
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
    sel.length ? [`Based on these documented conditions, ${sel.map(s => s.title.toLowerCase()).join(' and ')} may be relevant to mitigate access constraints, subject to applicable eligibility and administrative approval.`, sel.flatMap(s => JSON.parse(s.chunk_ids))] : ['No intervention has been selected yet.', []],
  ].filter(Boolean).map(([t, refs]) => [t, refs.filter(Boolean)]);
  return parts;
}

/* ---------- pages ---------- */
