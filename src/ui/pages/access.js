import { routeHazards, transportAt, walkProfile } from '../../case/analysis.js';
import { P, esc, linkOf, route, school } from '../helpers.js';

export function stepAccess(el, c, A, B) {
  const Lk = linkOf(c.from_id, c.to_id), wp = Lk ? walkProfile(Lk) : null, hz = Lk ? routeHazards(Lk) : [], rhz = Lk ? routeHazards(Lk, 'road') : [];
  const tr = transportAt(c.case_id), R = P();
  const limit = A.level_code === 'primary' ? R.walk_limit_primary_km : R.walk_limit_upper_km;
  el.innerHTML = `<div class="big4" style="grid-template-columns:repeat(2,minmax(0,1fr))">
      <div class="tile ${wp && wp.km > limit ? 'flag' : ''}"><span class="tl">Walking to ${esc(B.name)}</span><b>${wp ? wp.km + ' km' : 'Data unavailable'}</b><span class="ts">${wp ? `~${wp.min} min for a young child · RTE limit ${limit} km` : ''}</span></div>
      <div class="tile"><span class="tl">By road</span><b>${Lk ? Lk.road_km + ' km' : 'Data unavailable'}</b><span class="ts">${Lk ? `~${Lk.road_min} min by vehicle` : ''}</span></div></div>
    ${wp ? `<div class="card"><h2>Walking route profile <small>calculated · ${wp.climb} m up, ${wp.descent} m down, steepest ${wp.maxSlope}%</small></h2>${profileSvg(wp, hz)}
      <p class="small muted">Travel time uses Tobler's hiking function on each segment's slope, at ${wp.pace} × adult pace for a Class 1 child (rule R13). Elevations are mock until the Google Elevation API is connected.</p></div>` : ''}
    <div class="card"><h2>Transport</h2><table class="tbl"><tbody>
      ${tr.map(t => `<tr><td><b>${esc(t.name)}</b><div class="small muted">${esc(t.note || '')}</div></td><td>${t.kind === 'bus' ? `Departs ${t.dep.join(', ')}<div class="small ${t.atSchoolTime.length ? 't-green' : 't-red'}">${t.atSchoolTime.length ? 'Runs at school time' : 'No departure at school time'}</div>` : '<span class="muted">Data unavailable</span>'}</td><td><span class="tag ${t.source}">${t.source}</span></td></tr>`).join('')}
      <tr><td><b>Walking</b></td><td>${wp ? `${wp.km} km footpath` : 'Data unavailable'}</td><td><span class="tag mock">calculated</span></td></tr></tbody></table></div>
    <div class="card"><h2>Terrain and access along the route</h2><div class="hz">
      ${hz.map(h => `<div><i class="sev-${h.kind === 'bridge' ? 'high' : 'medium'}"></i><span><b>${esc(h.name)}</b> — ${esc(h.detail)}${h.source_url ? ` · <a href="${esc(h.source_url)}" target="_blank" rel="noopener">source</a>` : ''}</span><small>${esc(h.season || h.status)} · walking route</small></div>`).join('')}
      ${rhz.filter(h => !hz.some(w => w.feature_id === h.feature_id)).map(h => `<div><i class="sev-medium"></i><span><b>${esc(h.name)}</b> — ${esc(h.detail)}</span><small>${esc(h.season || '')} · road route</small></div>`).join('')}
      ${!hz.length && !rhz.length ? '<p class="muted">No mapped hazards.</p>' : ''}
      <div><i class="sev-low" style="background:var(--faint)"></i><span><b>Snow and ice</b></span><small>Data unavailable</small></div>
      <div><i class="sev-low" style="background:var(--faint)"></i><span><b>Road closures in the last monsoon</b></span><small>Data unavailable — HP SEOC daily reports in the full build</small></div>
    </div></div>`;
}
export function profileSvg(wp, hz) {
  const W = 560, H = 150, pl = 34, pr = 10, pt = 10, pb = 22, pts = wp.prof, maxX = pts[pts.length - 1][0];
  const ys = pts.map(p => p[1]), lo = Math.min(...ys) - 20, hi = Math.max(...ys) + 20;
  const x = v => pl + v / maxX * (W - pl - pr), y = v => pt + (hi - v) / (hi - lo) * (H - pt - pb);
  const low = pts.reduce((a, p) => p[1] < a[1] ? p : a, pts[0]);
  let s = `<svg viewBox="0 0 ${W} ${H}" class="chart" aria-label="Elevation profile"><path d="M${x(0)},${H - pb} ${pts.map(p => `L${x(p[0])},${y(p[1])}`).join(' ')} L${x(maxX)},${H - pb} Z" fill="var(--accent-soft)"/>`;
  s += `<polyline points="${pts.map(p => `${x(p[0])},${y(p[1])}`).join(' ')}" fill="none" stroke="var(--accent)" stroke-width="2.2"/>`;
  [lo + 20, (lo + hi) / 2, hi - 20].forEach(v => s += `<text x="${pl - 4}" y="${y(v) + 4}" text-anchor="end" class="ct">${Math.round(v)}</text>`);
  s += `<text x="${x(0)}" y="${H - 6}" class="ct">School A</text><text x="${x(maxX)}" y="${H - 6}" text-anchor="end" class="ct">School B · ${maxX.toFixed(1)} km</text>`;
  if (hz.some(h => h.kind === 'bridge')) s += `<line x1="${x(low[0])}" x2="${x(low[0])}" y1="${pt}" y2="${H - pb}" stroke="var(--risk)" stroke-dasharray="3 3"/><text x="${x(low[0]) + 4}" y="${pt + 10}" class="ct" style="fill:var(--risk)">river crossing · ${low[1]} m</text>`;
  return s + '</svg>';
}
