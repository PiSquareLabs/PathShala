import { crumbs, esc, go, mergesAll, pairsOf, plural, short } from '../helpers.js';

export function renderSurveys(pg) {
  const ms = mergesAll().sort((a, b) => (b.unknowns + b.open_questions) - (a.unknowns + a.open_questions));
  pg.innerHTML = `${crumbs([['Map', '#/'], ['Field surveys']])}
    <section class="ph"><div class="eyebrow">Work for field officers</div><h1>Field surveys</h1><div class="sub">Each merge gets a form with the data nobody has measured yet and the questions the community must answer.</div></section>
    <div class="links3">${ms.map(m => `<a class="lcard" href="#/m/${m.merge_id}/survey"><span class="eyebrow">${esc(m.district)} · ${esc(m.status)}</span><span style="font-family:var(--f-display);font-size:19px;font-weight:700">${esc(short(m.r_name))}</span>
      <span class="small muted">receives ${pairsOf(m.merge_id).map(g => esc(g.s_name)).join(', ')}</span>
      <span class="ln2"><b class="${m.unknowns + m.open_questions ? 't-pending' : 't-green'}">${m.unknowns + m.open_questions}</b><span>items · ${plural(m.unknowns, 'data point')}, ${plural(m.open_questions, 'question')}</span></span>
      <span class="go">Open form →</span></a>`).join('')}</div>`;
}

/* ---------- problems ---------- */
