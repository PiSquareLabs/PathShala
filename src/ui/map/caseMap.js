import L from 'leaflet';
import { nearby } from '../../case/analysis.js';
import { optionIds } from '../../case/options.js';
import { q } from '../../db/sqlite.js';
import { GEO } from '../../geo.js';
import { $, $$, caseState, css, linkOf, school } from '../helpers.js';
import { render } from '../router.js';
import { baseMap } from './baseMap.js';
import { districts } from './districts.js';
import { geoLayers } from './geoLayers.js';

export let caseMap = null, pickLayer = null;

const roadPts = lk => JSON.parse(lk.route_road).map(p => [p[0], p[1]]);

/* Investigate home: district map of all schools; the chosen sending school gets dashed lines to its neighbours. */
export function buildCaseMap() {
  const map = baseMap('hmap', { scrollWheelZoom: true }); caseMap = map; pickLayer = null; caseState._pickLines = [];
  const dl = L.geoJSON(GEO, { style: f => ({ color: css('--land-edge'), weight: 0.9, fillColor: caseState.district === f.properties.d ? css('--land-hi') : css('--land'), fillOpacity: 1 }), interactive: false });
  const target = caseState.district === 'All' ? dl : L.geoJSON({ type: 'FeatureCollection', features: GEO.features.filter(f => f.properties.d === caseState.district) });
  map.fitBounds(target.getBounds(), { padding: [12, 12] }); dl.addTo(map);
  if (caseState.district === 'Kullu' || caseState.district === 'All') geoLayers(map, { river: true, road: true });
  const sel = caseState.sel;
  q('SELECT * FROM schools').forEach(s => {
    const small = s.enrol_total <= 10, on = s.school_id === sel;
    L.circleMarker([s.lat, s.lng], { radius: on ? 9 : Math.min(9, 4 + Math.sqrt(s.enrol_total) / 2), color: on ? css('--ink') : '#fff', weight: on ? 3 : 1.5, fillColor: small ? css('--risk') : css('--accent'), fillOpacity: 1 })
      .bindTooltip(`${s.name} · ${s.enrol_total} students`, { className: 'slabel', permanent: on, direction: 'right', offset: [10, 0] })
      .on('click', () => { caseState.sel = s.school_id; caseState.picks = new Set(); render(); }).addTo(map);
  });
  if (sel) {
    const s = school(sel);
    pickLayer = L.layerGroup().addTo(map);
    const nb = nearby(sel).slice(0, 8), pts = [[s.lat, s.lng], ...nb.map(x => [x.s.lat, x.s.lng])];
    nb.forEach(x => L.polyline([[s.lat, s.lng], [x.s.lat, x.s.lng]], { color: css('--faint'), weight: 1.5, dashArray: '3 4' }).addTo(pickLayer));
    if (pts.length > 1) map.fitBounds(L.latLngBounds(pts).pad(0.3), { maxZoom: 13 }); else map.setView([s.lat, s.lng], 12);
    drawPicks();
  }
}

/* Ticked receiving schools: a solid line from the sending school to each. */
export function drawPicks() {
  if (!caseMap || !caseState.sel || !pickLayer) return;
  (caseState._pickLines || []).forEach(l => pickLayer.removeLayer(l)); caseState._pickLines = [];
  const a = school(caseState.sel);
  caseState.picks.forEach(id => {
    const b = school(id), lk = linkOf(a.school_id, id);
    caseState._pickLines.push(L.polyline(lk ? roadPts(lk) : [[a.lat, a.lng], [b.lat, b.lng]], { color: css('--accent'), weight: 4 }).addTo(pickLayer));
  });
}

/* Map of a case: the closing school, every candidate receiving school, and the route to the chosen one. */
export function caseMapPanel() {
  return `<div class="cmapwrap"><div id="cmap" role="img" aria-label="Map of the closing school, candidate receiving schools and route"></div>
    <details class="lyrs"><summary>Map layers</summary><div class="mmleg">${[['river', 'Rivers'], ['road', 'Roads'], ['route', 'Routes'], ['habs', 'Habitations'], ['hazards', 'Bridges and hazards']].map(([k, l]) => `<label class="lyr"><input type="checkbox" data-l="${k}" ${caseState.layers[k] ? 'checked' : ''}> ${l}</label>`).join('')}</div></details></div>`;
}

export function drawCaseMap(c, step) {
  const A = school(c.from_id), opts = optionIds(c.case_id).map(school);
  const map = baseMap('cmap', { scrollWheelZoom: false });
  const habs = q('SELECT * FROM habitations WHERE school_id = ?', [A.school_id]);
  const pts = [[A.lat, A.lng], ...opts.map(o => [o.lat, o.lng]), ...habs.map(h => [h.lat, h.lng])];
  map.fitBounds(L.latLngBounds(pts).pad(0.3), { maxZoom: 14 });
  districts(map, new Set([A.district]), false);
  geoLayers(map, caseState.layers);
  if (caseState.layers.route) opts.forEach(o => {
    const lk = linkOf(A.school_id, o.school_id), chosen = o.school_id === c.to_id;
    if (lk && chosen) {
      L.polyline(roadPts(lk), { color: css('--accent'), weight: step === 'evidence' ? 5 : 3, opacity: 0.9 }).bindTooltip(`Road ${lk.road_km} km`, { className: 'slabel' }).addTo(map);
      L.polyline(JSON.parse(lk.route_walk).map(p => [p[0], p[1]]), { color: css('--ink'), weight: step === 'evidence' ? 4 : 2.5, dashArray: '6 6' }).bindTooltip(`Footpath ${lk.walk_km} km`, { className: 'slabel' }).addTo(map);
    } else L.polyline([[A.lat, A.lng], [o.lat, o.lng]], { color: chosen ? css('--accent') : css('--faint'), weight: chosen ? 3 : 1.5, dashArray: '3 5' }).addTo(map);
  });
  if (caseState.layers.habs) {
    const fb = {}; q('SELECT hab_id, theme, count(*) AS n FROM citizen_feedback WHERE about_id = ? GROUP BY 1, 2', [c.to_id]).forEach(r => { fb[r.hab_id] ||= { all: 0 }; fb[r.hab_id][r.theme] = r.n; fb[r.hab_id].all += r.n; });
    habs.forEach(h => {
      const n = step === 'evidence' ? (caseState.theme ? fb[h.hab_id]?.[caseState.theme] || 0 : fb[h.hab_id]?.all || 0) : 0;
      L.circleMarker([h.lat, h.lng], { radius: step === 'evidence' && caseState.theme ? 5 + Math.sqrt(n) * 2 : 5, color: css('--ink'), weight: 1.5, fillColor: step === 'evidence' && caseState.theme ? css('--wait') : '#fff', fillOpacity: step === 'evidence' && caseState.theme ? 0.55 : 1 })
        .bindTooltip(`${h.name}${step === 'evidence' ? ` · ${n} responses${caseState.theme ? ' on ' + caseState.theme.toLowerCase() : ''}` : ''}`, { className: 'slabel', direction: 'left', offset: [-8, 0] }).addTo(map);
    });
  }
  const mk = (s, col, label, right) => L.circleMarker([s.lat, s.lng], { radius: s.school_id === c.to_id ? 11 : 9, color: '#fff', weight: 2.5, fillColor: col, fillOpacity: 1 })
    .bindTooltip(label, { permanent: true, className: 'rlabel' + (s.school_id === c.to_id ? ' on' : ''), direction: right ? 'right' : 'left', offset: right ? [12, 0] : [-12, 0] }).addTo(map);
  mk(A, css('--risk'), `Closing: ${A.name}`, A.lng < Math.max(...opts.map(o => o.lng)));
  opts.forEach(o => mk(o, css('--accent'), o.school_id === c.to_id && opts.length > 1 ? `${o.name} · chosen` : o.name, o.lng > A.lng));
  $$('.lyr input').forEach(i => i.onchange = () => { caseState.layers[i.dataset.l] = i.checked; render(); });
}
