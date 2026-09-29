import { q, q1 } from '../../db/sqlite.js';
import { crumbs, esc, school } from '../helpers.js';

export function renderCases(pg) {
  const cs = q('SELECT * FROM cases ORDER BY case_id DESC');
  pg.innerHTML = `${crumbs([['Case map', '#/'], ['Investigations']])}<section class="ph"><div class="eyebrow">Consolidation investigations</div><h1>Investigations</h1><div class="sub">Start one from the case map: click a school, pick a receiving school, then Investigate.</div></section>
    <div class="links3">${cs.map(c => `<a class="lcard" href="#/case/${c.case_id}"><span class="eyebrow">${c.case_id} · ${esc(c.created_on)}</span><span style="font-family:var(--f-display);font-size:19px;font-weight:700">${esc(school(c.from_id).name)} → ${esc(school(c.to_id).name)}</span>
      <span class="small muted">${q1('SELECT count(*) AS n FROM findings WHERE case_id = ?', [c.case_id]).n} findings · ${q1('SELECT count(*) AS n FROM evidence WHERE case_id = ?', [c.case_id]).n} evidence items</span><span class="pill ${c.status === 'Ready for administrative review' ? 's-green' : 's-pending'}" style="justify-self:start">${esc(c.status)}</span></a>`).join('') || '<p class="muted">No investigations yet. <a href="#/">Open the case map</a>.</p>'}</div>`;
}
