import { routeHazards } from '../../case/analysis.js';
import { routeInfo } from '../../case/options.js';
import { q } from '../../db/sqlite.js';
import { $, $$, P, caseState, esc, evChip } from '../helpers.js';
import { fold, tile } from '../kit.js';
import { render } from '../router.js';
import { concernsCard } from './feedback.js';

/* Evidence for the chosen receiving school: the route, what is on it, and what citizens say. */
export function stepEvidence(el, c, A, B) {
  const rt = routeInfo(A.school_id, B.school_id), Lk = rt.L, wp = rt.wp, R = P();
  const hz = Lk ? routeHazards(Lk) : [], rhz = Lk ? routeHazards(Lk, 'road') : [];
  const limit = A.level_code === 'primary' ? R.walk_limit_primary_km : R.walk_limit_upper_km;
  const fb = q('SELECT f.*, h.name AS hab FROM citizen_feedback f LEFT JOIN habitations h USING (hab_id) WHERE f.about_id = ? ORDER BY received DESC', [B.school_id]);
  const th = {}; fb.forEach(f => { th[f.theme] ||= { n: 0, v: 0 }; th[f.theme].n++; if (f.status === 'verified') th[f.theme].v++; });
  const order = Object.entries(th).sort((a, b) => b[1].n - a[1].n), sel = caseState.theme, list = sel ? fb.filter(f => f.theme === sel) : [];
  const route = [...hz.map(h => [h, 'walking route']), ...rhz.filter(h => !hz.some(w => w.feature_id === h.feature_id)).map(h => [h, 'road route'])];
  el.innerHTML = `<div class="card"><h2>Getting to ${esc(B.name)}${rt.est ? ' <small>route not surveyed: estimates</small>' : ''}</h2>
      <div class="big4" style="grid-template-columns:repeat(2,minmax(0,1fr))">
        ${tile('On foot', wp ? wp.km + ' km' : `about ${rt.walk_km} km*`, wp ? `~${wp.min} min for a young child · limit ${limit} km` : `~${rt.walk_min} min (estimate) · limit ${limit} km`, rt.walk_km > limit ? 'flag' : '')}
        ${tile('By road', Lk ? Lk.road_km + ' km' : `about ${rt.road_km} km*`, Lk ? `~${Lk.road_min} min by vehicle` : 'time not available')}</div>
      ${wp ? fold('Elevation profile', `${profileSvg(wp, hz, A, B)}<p class="small muted">${wp.climb} m up, ${wp.descent} m down, steepest ${wp.maxSlope}%. Travel time uses Tobler's hiking function on each segment's slope, at ${wp.pace} × adult pace for a Class 1 child (rule R13).</p>`, { id: 'ev-profile' }) : ''}
      <div class="sechead">On the route</div>
      <div class="hz">${route.map(([h, where]) => `<div><i class="sev-${h.kind === 'bridge' ? 'high' : 'medium'}"></i><span><b>${esc(h.name)}</b> — ${esc(h.detail)}${h.source_url ? ` · <a href="${esc(h.source_url)}" target="_blank" rel="noopener">source</a>` : ''}</span><small>${esc(h.season || h.status || '')} · ${where}</small></div>`).join('') || `<p class="muted">${Lk ? 'No mapped hazards.' : 'Data unavailable: the route has not been mapped.'}</p>`}</div>
      <dl class="kv2" style="margin-top:12px"><dt>Public transport</dt><dd>Data unavailable (no timetable source). Asked as a field question.</dd>
        <dt>Not connected yet</dt><dd>Snow cover (MODIS), rainfall (CHIRPS)</dd></dl></div>
    ${concernsCard(c.case_id)}
    <div class="card"><h2>What people say <small>${fb.length ? `${fb.length} messages · synthesised for the demo` : ''}</small></h2>
      ${fb.length ? `<div class="themes">${order.map(([k, v]) => `<button class="theme ${sel === k ? 'on' : ''}" data-t="${esc(k)}"><b>${v.n}</b><span>${esc(k)}</span><small>${v.v ? v.v + ' verified' : 'all reported'}</small></button>`).join('')}</div>` : '<p class="muted">Data unavailable: no citizen feedback recorded about moving to this school.</p>'}
      ${sel ? `<div class="row" style="margin-top:12px"><b>${esc(sel)}</b><button class="btn sm ghost" id="th-clear">Close</button></div><div class="msgs">${list.map(f => `<div class="msg"><span class="who">${esc(f.sender_role)} · ${esc(f.hab || '')} · ${esc(f.channel)} · ${esc(f.received)}</span>
        <span class="orig hi" lang="hi">“${esc(f.text_hi)}”</span><span class="en">“${esc(f.text_en)}”</span><span class="vf">${evChip(f.status)}${f.verified_by ? `<span class="small">${esc(f.verified_by)}</span>` : ''}</span></div>`).join('')}</div>` : ''}</div>`;
  $$('.theme', el).forEach(b => b.onclick = () => { caseState.theme = caseState.theme === b.dataset.t ? null : b.dataset.t; render(); });
  const cl = $('#th-clear'); if (cl) cl.onclick = () => { caseState.theme = null; render(); };
}

export function profileSvg(wp, hz, A, B) {
  const W = 560, H = 150, pl = 34, pr = 10, pt = 10, pb = 22, pts = wp.prof, maxX = pts[pts.length - 1][0];
  const ys = pts.map(p => p[1]), lo = Math.min(...ys) - 20, hi = Math.max(...ys) + 20;
  const x = v => pl + v / maxX * (W - pl - pr), y = v => pt + (hi - v) / (hi - lo) * (H - pt - pb);
  const low = pts.reduce((a, p) => p[1] < a[1] ? p : a, pts[0]);
  let s = `<svg viewBox="0 0 ${W} ${H}" class="chart" aria-label="Elevation profile"><path d="M${x(0)},${H - pb} ${pts.map(p => `L${x(p[0])},${y(p[1])}`).join(' ')} L${x(maxX)},${H - pb} Z" fill="var(--accent-soft)"/>`;
  s += `<polyline points="${pts.map(p => `${x(p[0])},${y(p[1])}`).join(' ')}" fill="none" stroke="var(--accent)" stroke-width="2.2"/>`;
  [lo + 20, (lo + hi) / 2, hi - 20].forEach(v => s += `<text x="${pl - 4}" y="${y(v) + 4}" text-anchor="end" class="ct">${Math.round(v)}</text>`);
  s += `<text x="${x(0)}" y="${H - 6}" class="ct">${esc(A.name)}</text><text x="${x(maxX)}" y="${H - 6}" text-anchor="end" class="ct">${esc(B.name)} · ${maxX.toFixed(1)} km</text>`;
  if (hz.some(h => h.kind === 'bridge')) s += `<line x1="${x(low[0])}" x2="${x(low[0])}" y1="${pt}" y2="${H - pb}" stroke="var(--risk)" stroke-dasharray="3 3"/><text x="${x(low[0]) + 4}" y="${pt + 10}" class="ct" style="fill:var(--risk)">river crossing · ${low[1]} m</text>`;
  return s + '</svg>';
}
