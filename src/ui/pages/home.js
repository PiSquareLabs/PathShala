import { q1 } from '../../db/sqlite.js';
import { successHealth } from '../../engine/merges.js';
import { HC, esc, inr, mHealth, mLine, mergesAll, pairsOf, plural, short } from '../helpers.js';

/* Merges: one tile per merge. Open a tile for its schools, problems and plan. */
export function renderHome(app) {
  const ms = mergesAll();
  const order = m => ({ red: 0, pending: 1, amber: 2, green: 3 })[mHealth(m)];
  const sorted = ms.slice().sort((a, b) => order(a) - order(b));
  const done = ms.filter(m => m.status === 'Merged' && m.success != null);
  const avg = done.length ? Math.round(done.reduce((a, m) => a + m.success, 0) / done.length) : null;
  const moving = ms.reduce((a, m) => a + m.moving, 0);
  app.innerHTML = `<div class="page wide" id="pg">
    <section class="ph"><h1>${plural(ms.length, 'merge')}</h1><div class="sub muted">${moving} students moving · ${inr(ms.reduce((a, m) => a + m.yearly_inr, 0))} a year</div></section>
    <div class="stats home-stats">
      <div class="stat"><b class="t-${successHealth(avg)}">${avg == null ? '—' : avg + '%'}</b><span>average success of merged schools</span></div>
      <div class="stat"><b class="${q1("SELECT count(*) AS n FROM problems WHERE severity != 'low'").n ? 't-red' : ''}">${q1("SELECT count(*) AS n FROM problems WHERE severity != 'low'").n}</b><span>open problems</span></div>
      <div class="stat"><b>${ms.filter(m => m.status === 'Proposed').length}</b><span>proposed</span></div>
    </div>
    <div class="row"><span class="eyebrow">Each tile is one merge</span><a class="btn sm primary" href="#/new">+ New merge</a></div>
    <div class="mtiles" id="mtiles">${sorted.map(m => {
      const ps = pairsOf(m.merge_id);
      return `<div class="rcv" data-m="${m.merge_id}" style="--hc:${HC[mHealth(m)]}">
        <a class="stretch" href="#/m/${m.merge_id}" aria-label="Open merge into ${esc(m.r_name)}"></a>
        <span class="rloc">${esc(m.district)} · ${esc(m.block)} · ${esc(m.status)}</span>
        <span class="rn">${esc(short(m.r_name))}</span>
        <span class="rv t-${mHealth(m)}">${esc(mLine(m))}</span>
        <span class="rnum"><b>${m.r_enrol} → ${m.after_total}</b><span>students</span></span>
        <span class="from">${ps.map(g => `<a href="#/m/${m.merge_id}/g/${g.group_id}">← <b>${esc(g.s_name)}</b> · ${g.moving} students · ${(+g.walk_km).toFixed(1)} km</a>`).join('')}</span>
        <span class="small muted tmeta">${m.problems ? plural(m.problems, 'problem') : 'No problems'} · ${inr(m.yearly_inr)} a year</span>
      </div>`; }).join('')}</div>
  </div>`;
}
