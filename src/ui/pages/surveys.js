import { esc, mergesAll, pairsOf, plural, short } from '../helpers.js';
import { pageHead } from '../kit.js';
import { todoTabs } from './problems.js';

export function renderSurveys(pg) {
  const ms = mergesAll().sort((a, b) => (b.unknowns + b.open_questions) - (a.unknowns + a.open_questions));
  pg.innerHTML = `${pageHead('', 'To do')}${todoTabs('surveys')}
    <div class="links3">${ms.map(m => `<a class="lcard" href="#/m/${m.merge_id}/survey"><span class="eyebrow">${esc(m.district)} · ${esc(m.status)}</span><span style="font-family:var(--f-display);font-size:19px;font-weight:700">${esc(short(m.r_name))}</span>
      <span class="small muted">receives ${pairsOf(m.merge_id).map(g => esc(g.s_name)).join(', ')}</span>
      <span class="ln2"><b class="${m.unknowns + m.open_questions ? 't-pending' : 't-green'}">${m.unknowns + m.open_questions}</b><span>items · ${plural(m.unknowns, 'data point')}, ${plural(m.open_questions, 'question')}</span></span>
      <span class="go">Open form →</span></a>`).join('')}</div>`;
}

/* ---------- problems ---------- */
