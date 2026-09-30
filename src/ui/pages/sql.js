import { SQL, db, q, q1, run } from '../../db/sqlite.js';
import { commit } from '../../engine/rules.js';
import { $, $$, esc, state } from '../helpers.js';

export const SAMPLE_SQL = [
  ['Verdicts', 'SELECT g.group_id, s.name AS closing, r.name AS receiving, a.verdict, a.one_time_inr, a.yearly_inr\nFROM merge_groups g\nJOIN schools s ON s.school_id = g.sending_id\nJOIN schools r ON r.school_id = g.receiving_id\nJOIN analysis a USING (group_id);'],
  ['Merge success', 'SELECT m.merge_id, r.name AS receiving, m.senders, m.status, m.success, m.success_label, m.problems, m.unknowns\nFROM merge_summary m JOIN schools r ON r.school_id = m.receiving_id;'],
  ['Problems', 'SELECT merge_id, severity, title, detail FROM problems ORDER BY merge_id, seq;'],
  ['Plan items', "SELECT group_id, seq, kind, title, cost_inr, cost_type FROM plan_items WHERE kind != 'rejected' ORDER BY group_id, seq;"],
  ['Open questions', 'SELECT q.group_id, q.role, q.text_en FROM questions q\nLEFT JOIN answers a USING (group_id, kind)\nWHERE a.choice IS NULL;'],
  ['Feedback by issue', "SELECT group_id, issue, count(*) AS n, sum(sentiment = 'negative') AS negative\nFROM feedback GROUP BY 1, 2 ORDER BY n DESC;"],
  ['Transport cost total', "SELECT sum(cost_inr) AS yearly_transport FROM plan_items WHERE code = 'transport';"],
  ['Add a hazard (write)', "INSERT INTO hazards (group_id, kind, label, months, month_list, severity, data_source, source)\nVALUES ('G2', 'road', 'New bypass road near Chhat', 'All year', '', 'high', 'Officer note', 'officer');"],
];
export function renderSql(app) {
  const tables = q("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").map(t => ({ name: t.name, n: q1(`SELECT count(*) AS n FROM "${t.name}"`).n }));
  const engine = ['checks', 'plan_items', 'questions', 'analysis', 'merge_summary', 'problems', 'unknowns', 'investigations', 'cases', 'case_log', 'feedback_class', 'concerns', 'feedback_class', 'concerns', 'agent_steps', 'findings', 'evidence', 'field_questions', 'interventions', 'reports'];
  const tbtn = t => `<button data-t="${t.name}"><span>${t.name}</span><span class="muted">${t.n}</span></button>`;
  app.innerHTML = `<div class="sqlgrid">
    <div class="card"><div class="tlist">
      <div class="kind">Input data</div>${tables.filter(t => !engine.includes(t.name)).map(tbtn).join('')}
      <div class="kind">Written by the engine</div>${tables.filter(t => engine.includes(t.name)).map(tbtn).join('')}
    </div></div>
    <div style="display:grid;gap:12px;min-width:0">
      <div class="card" style="display:grid;gap:10px">
        <h2 style="margin:0">SQLite console <small>the real database behind the app. Writes re-run the analysis.</small></h2>
        <div class="samples">${SAMPLE_SQL.map((s, i) => `<button data-s="${i}">${esc(s[0])}</button>`).join('')}</div>
        <textarea id="sql" spellcheck="false" aria-label="SQL">${esc(state.sqlText || SAMPLE_SQL[0][1])}</textarea>
        <div class="row"><span class="small muted">Ctrl + Enter runs</span><button class="btn primary" id="runsql">Run</button></div>
      </div>
      <div id="sqlres"></div>
    </div>
  </div>`;
  $$('.tlist button', app).forEach(b => b.onclick = () => { $('#sql').value = `SELECT * FROM ${b.dataset.t} LIMIT 100;`; exec(); });
  $$('.samples button', app).forEach(b => b.onclick = () => { $('#sql').value = SAMPLE_SQL[b.dataset.s][1]; exec(); });
  $('#runsql').onclick = exec;
  $('#sql').addEventListener('keydown', e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); exec(); } });
  if (state.sqlResult) $('#sqlres').innerHTML = state.sqlResult; else exec();
}
export function exec() {
  const text = $('#sql').value; state.sqlText = text;
  const isWrite = /^\s*(insert|update|delete|replace|create|drop|alter)/im.test(text.replace(/--.*$/gm, ''));
  try {
    let res;
    if (isWrite) {
      let changed = 0;
      state.sqlResult = '<p class="small muted">Running…</p>';
      commit('SQL write applied', () => { db.run(text); changed = db.getRowsModified(); });
      res = [{ columns: ['rows changed'], values: [[changed]] }];
    } else res = db.exec(text);
    const r = res[res.length - 1];
    state.sqlResult = r ? `<div class="res"><table><thead><tr>${r.columns.map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${r.values.map(v => `<tr>${v.map(x => `<td title="${esc(x)}">${x === null ? '<span class="muted">NULL</span>' : esc(x)}</td>`).join('')}</tr>`).join('')}</tbody></table></div><p class="small muted" style="margin-top:6px">${r.values.length} row${r.values.length === 1 ? '' : 's'}</p>` : '<p class="small muted">Done. No rows returned.</p>';
  } catch (e) { state.sqlResult = `<div class="card err">${esc(e.message)}</div>`; }
  const o = $('#sqlres'); if (o) o.innerHTML = state.sqlResult;
}
