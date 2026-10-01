import { optionIds } from '../../case/options.js';
import { q, q1 } from '../../db/sqlite.js';
import { crumbs, esc, school } from '../helpers.js';
import { pageHead } from '../kit.js';

export function renderCases(pg) {
  const cs = q('SELECT * FROM investigations ORDER BY CAST(substr(inv_id, 2) AS INTEGER) DESC');
  pg.innerHTML = `${crumbs([['Investigate', '#/'], ['Investigations']])}${pageHead('', 'Investigations')}
    <div class="links3">${cs.map(c => { const n = optionIds(c.inv_id).length; return `<a class="lcard" href="#/case/${c.inv_id}"><span class="eyebrow">${c.inv_id} · ${esc(c.created_on)}</span><span style="font-family:var(--f-display);font-size:19px;font-weight:700">${esc(school(c.from_id).name)} → ${c.chosen_id ? esc(school(c.chosen_id).name) : n > 1 ? `${n} schools` : esc(school(optionIds(c.inv_id)[0]).name)}</span>
      <span class="small muted">${q1('SELECT count(*) AS n FROM findings WHERE case_id LIKE ?', [c.inv_id + '-%']).n} findings · ${q1('SELECT count(*) AS n FROM evidence WHERE case_id LIKE ?', [c.inv_id + '-%']).n} evidence items</span><span class="pill ${c.status === 'Ready for administrative review' ? 's-green' : 's-pending'}" style="justify-self:start">${esc(c.status)}</span></a>`; }).join('') || '<p class="empty">No investigations yet. Start one from <a href="#/">Investigate</a>: pick a school, then tick the schools to compare.</p>'}</div>`;
}
