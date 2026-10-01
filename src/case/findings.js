/* Case repository: the only place that writes agent results to SQLite. Agents return schema-validated JSON;
   nothing here is built from raw model text. */
import { q, run } from '../db/sqlite.js';
import { logCase, today } from '../ui/helpers.js';

export const CASE_TABLES = ['findings', 'evidence', 'field_questions', 'interventions', 'reports'];

/* Findings + FieldQuestions -> findings, evidence, field_questions rows. Clears the case first. */
export function writeFindings(cid, findings, questions, note) {
  CASE_TABLES.forEach(t => run(`DELETE FROM ${t} WHERE case_id = ?`, [cid]));
  findings.findings.forEach(f => {
    run('INSERT INTO findings (case_id, fid, title, kind, severity, summary, status) VALUES (?,?,?,?,?,?,?)', [cid, f.fid, f.title, f.kind, f.severity, f.summary, f.status]);
    f.evidence.forEach(e => run('INSERT INTO evidence (case_id, eid, fid, kind, status, label, detail, ref) VALUES (?,?,?,?,?,?,?,?)', [cid, e.eid, f.fid, e.kind, e.status, e.label, e.detail ?? '', e.ref]));
  });
  questions.questions.forEach((x, i) => run('INSERT INTO field_questions (case_id, qid, seq, text, type, options, gap) VALUES (?,?,?,?,?,?,?)', [cid, x.qid, i + 1, x.text, x.type, JSON.stringify(x.options || []), x.gap]));
  logCase(cid, 'Agent', 'Investigation complete', note);
}

/* The officer's field answers, stored as given. */
export function saveFieldAnswers(cid, ans) {
  q('SELECT * FROM field_questions WHERE case_id = ? ORDER BY seq', [cid]).forEach(x => {
    const a = ans[x.qid];
    if (a && (a.v !== '' && a.v != null || a.note)) run('UPDATE field_questions SET answer = ?, note = ?, answered_on = ? WHERE case_id = ? AND qid = ?', [a.v ?? '', a.note || '', today(), cid, x.qid]);
  });
  const A = {};
  q('SELECT qid, answer, note FROM field_questions WHERE case_id = ?', [cid]).forEach(x => { A[x.qid] = x; });
  return A;
}

/* EvidenceUpdate -> evidence and findings rows. */
export function applyEvidenceUpdate(cid, upd, A) {
  upd.new_evidence.forEach(e => run('INSERT OR REPLACE INTO evidence (case_id, eid, fid, kind, status, label, detail, ref) VALUES (?,?,?,?,?,?,?,?)', [cid, e.eid, e.fid, e.kind, e.status, e.label, e.detail ?? '', e.ref]));
  upd.evidence_changes.forEach(e => run('UPDATE evidence SET status = ?, label = COALESCE(?, label), detail = COALESCE(?, detail) WHERE case_id = ? AND eid = ?', [e.status, e.label ?? null, e.detail ?? null, cid, e.eid]));
  upd.finding_changes.forEach(f => run('UPDATE findings SET status = ? WHERE case_id = ? AND fid = ?', [f.status, cid, f.fid]));
  logCase(cid, 'Field officer', 'Field verification submitted', Object.entries(A).filter(([, v]) => v.answer || v.note).map(([k, v]) => `${k}: ${v.answer || v.note}`).join('; '));
}

/* Interventions -> interventions rows. Keeps the officer's selection. */
export function saveInterventions(cid, out) {
  const keep = new Set(q('SELECT code FROM interventions WHERE case_id = ? AND selected = 1', [cid]).map(x => x.code));
  run('DELETE FROM interventions WHERE case_id = ?', [cid]);
  out.interventions.forEach(v => run('INSERT INTO interventions (case_id, code, title, chunk_ids, why, inputs, formula, cost_inr, cost_type) VALUES (?,?,?,?,?,?,?,?,?)', [cid, v.code, v.title, JSON.stringify(v.chunk_ids), v.interpretation, JSON.stringify(v.cost.inputs), v.cost.formula, v.cost.cost_inr, v.cost.cost_type]));
  keep.forEach(k => run('UPDATE interventions SET selected = 1 WHERE case_id = ? AND code = ?', [cid, k]));
}
