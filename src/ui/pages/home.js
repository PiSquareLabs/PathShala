import { q } from '../../db/sqlite.js';
import { successHealth } from '../../engine/merges.js';
import { HC, esc, inr, mHealth, mLine, mergesAll, pairsOf, plural, school, short } from '../helpers.js';
import { buildHomeMap } from '../map/homeMap.js';

export function renderHome(app) {
  const ms = mergesAll();
  const order = m => ({ red: 0, pending: 1, amber: 2, green: 3 })[mHealth(m)];
  const sorted = ms.slice().sort((a, b) => order(a) - order(b));
  const done = ms.filter(m => m.status === 'Merged' && m.success != null);
  const avg = done.length ? Math.round(done.reduce((a, m) => a + m.success, 0) / done.length) : null;
  const probs = q("SELECT count(*) AS n FROM problems WHERE severity != 'low'").n;
  const moving = ms.reduce((a, m) => a + m.moving, 0);
  app.innerHTML = `<div class="home">
    <div class="mapwrap"><div id="hmap" role="img" aria-label="Map of Himachal Pradesh with schools and merges"></div>
      <div class="maplegend"><b>On the map</b>
        <span class="lgc"><span class="lg"><i class="c-amber"></i>Receives</span><span class="lg"><i class="hollow"></i>Closes</span><span class="lg"><i class="grey"></i>Not in a merge</span></span>
        <span class="lgc"><span class="lg"><i class="c-green"></i>Working / as planned</span><span class="lg"><i class="c-amber"></i>Conditions</span><span class="lg"><i class="c-red"></i>Failing / risk</span><span class="lg"><i class="c-pending"></i>Awaiting answers</span></span>
      </div>
    </div>
    <aside class="panel">
      <div><div class="eyebrow">Himachal Pradesh · school merges</div>
        <h1 class="ptitle">${plural(ms.length, 'merge')} · ${moving} children moving</h1></div>
      <div class="stats">
        <div class="stat"><b class="t-${successHealth(avg)}">${avg == null ? '—' : avg + '%'}</b><span>average success of ${plural(done.length, 'completed merge')}</span></div>
        <div class="stat"><b class="${probs ? 't-red' : ''}">${probs}</b><span>problems to address</span></div>
        <div class="stat"><b>${inr(ms.reduce((a, m) => a + m.yearly_inr, 0))}</b><span>per year for conditions</span></div>
        <div class="stat"><b class="${ms.reduce((a, m) => a + m.unknowns + m.open_questions, 0) ? 't-pending' : ''}">${ms.reduce((a, m) => a + m.unknowns + m.open_questions, 0)}</b><span>items for field surveys</span></div>
      </div>
      <div class="row"><span class="eyebrow">Receiving schools</span><a class="btn sm primary" href="#/new">+ New merge</a></div>
      <div class="rlist">${sorted.map(m => {
        const ps = pairsOf(m.merge_id);
        return `<div class="rcv" data-m="${m.merge_id}" style="--hc:${HC[mHealth(m)]}">
          <a class="stretch" href="#/m/${m.merge_id}" aria-label="Open merge into ${esc(m.r_name)}"></a>
          <span class="rloc">${esc(m.district)} · ${esc(m.block)} · ${esc(m.status)}</span>
          <span class="rn">${esc(short(m.r_name))}</span>
          <span class="rv t-${mHealth(m)}">${esc(mLine(m))}</span>
          <span class="rnum"><b>${m.r_enrol} → ${m.after_total}</b><span>students</span></span>
          <span class="from">${ps.map(g => `<a href="#/m/${m.merge_id}/g/${g.group_id}">← <b>${esc(g.s_name)}</b> · ${g.moving} children · ${(+g.walk_km).toFixed(1)} km</a>`).join('')}</span>
        </div>`; }).join('')}</div>
      <p class="small muted">Click a receiving school, on the map or in this list, to open its merge.</p>
    </aside>
  </div>`;
  buildHomeMap(ms);
}
