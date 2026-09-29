import L from 'leaflet';
import { nearby } from '../../case/analysis.js';
import { q } from '../../db/sqlite.js';
import { GEO } from '../../geo.js';
import { $, $$, caseState, css, linkOf, route, school } from '../helpers.js';
import { baseMap } from './baseMap.js';
import { districts } from './districts.js';
import { geoLayers } from './geoLayers.js';
import { render } from '../router.js';

export let caseMap = null, pickLayer = null;
export function buildCaseMap() {
  if (typeof L === 'undefined') { $('#hmap').innerHTML = '<p style="padding:16px;color:var(--muted)">Map library could not load.</p>'; return; }
  const map = baseMap('hmap', { scrollWheelZoom: true }); caseMap = map;
  const dl = L.geoJSON(GEO, { style: f => ({ color: css('--land-edge'), weight: 0.9, fillColor: caseState.district === f.properties.d ? css('--land-hi') : css('--land'), fillOpacity: 1 }), interactive: false });
  const target = caseState.district === 'All' ? dl : L.geoJSON(GEO.features ? { type: 'FeatureCollection', features: GEO.features.filter(f => f.properties.d === caseState.district) } : GEO);
  map.fitBounds(target.getBounds(), { padding: [12, 12] }); dl.addTo(map);
  if (caseState.district === 'Kullu' || caseState.district === 'All') geoLayers(map, { river: true, road: true });
  const sel = caseState.sel;
  q('SELECT * FROM schools').forEach(s => {
    const small = s.enrol_total <= 10, on = s.school_id === sel;
    L.circleMarker([s.lat, s.lng], { radius: on ? 9 : Math.min(9, 4 + Math.sqrt(s.enrol_total) / 2), color: on ? css('--ink') : '#fff', weight: on ? 3 : 1.5, fillColor: small ? css('--risk') : css('--accent'), fillOpacity: 1 })
      .bindTooltip(`${s.name} · ${s.enrol_total} students`, { className: 'slabel', permanent: on, direction: 'right', offset: [10, 0] })
      .on('click', () => { caseState.sel = s.school_id; caseState.pick = null; render(); }).addTo(map);
  });
  if (sel) {
    const s = school(sel);
    pickLayer = L.layerGroup().addTo(map);
    const nb = nearby(sel).slice(0, 6), pts = [[s.lat, s.lng], ...nb.map(x => [x.s.lat, x.s.lng])];
    nb.forEach(x => L.polyline([[s.lat, s.lng], [x.s.lat, x.s.lng]], { color: css('--faint'), weight: 1.5, dashArray: '3 4' }).addTo(pickLayer));
    q('SELECT * FROM habitations WHERE school_id = ?', [sel]).forEach(h => L.circleMarker([h.lat, h.lng], { radius: 4, color: css('--ink'), weight: 1, fillColor: '#fff', fillOpacity: 1 }).bindTooltip(`${h.name} · ${h.children} children`, { className: 'slabel' }).addTo(pickLayer));
    if (pts.length > 1) map.fitBounds(L.latLngBounds(pts).pad(0.3), { maxZoom: 13 }); else map.setView([s.lat, s.lng], 12);
    drawPick();
  }
}
export function drawPick() {
  if (!caseMap || !caseState.sel || !caseState.pick || !pickLayer) return;
  const L_ = linkOf(caseState.sel, caseState.pick);
  if (caseState._pickLine) pickLayer.removeLayer(caseState._pickLine);
  const a = school(caseState.sel), b = school(caseState.pick);
  caseState._pickLine = L.polyline(L_ ? JSON.parse(L_.route_road).map(p => [p[0], p[1]]) : [[a.lat, a.lng], [b.lat, b.lng]], { color: css('--accent'), weight: 4 }).addTo(pickLayer);
}
export function caseMapPanel(c, step) {
  return `<div class="cmapwrap"><div id="cmap" role="img" aria-label="Map of the two schools, habitations and route"></div>
    <div class="mmleg">${[['river', 'Rivers'], ['road', 'Roads'], ['route', 'Routes'], ['habs', 'Habitations'], ['hazards', 'Bridges and hazards']].map(([k, l]) => `<label class="lyr"><input type="checkbox" data-l="${k}" ${caseState.layers[k] ? 'checked' : ''}> ${l}</label>`).join('')}
    <span class="muted">Geometry approximate; bridge from The Tribune</span></div></div>`;
}
export function drawCaseMap(c, step) {
  if (typeof L === 'undefined') return;
  const A = school(c.from_id), B = school(c.to_id), Lk = linkOf(c.from_id, c.to_id);
  const map = baseMap('cmap', { scrollWheelZoom: false });
  const habs = q('SELECT * FROM habitations WHERE school_id = ?', [A.school_id]);
  const pts = [[A.lat, A.lng], [B.lat, B.lng], ...habs.map(h => [h.lat, h.lng])];
  map.fitBounds(L.latLngBounds(pts).pad(0.35), { maxZoom: 14 });
  districts(map, new Set([A.district]), false);
  geoLayers(map, caseState.layers);
  if (caseState.layers.route && Lk) {
    L.polyline(JSON.parse(Lk.route_road).map(p => [p[0], p[1]]), { color: css('--accent'), weight: step === 'access' ? 5 : 3, opacity: 0.9 }).bindTooltip(`Road ${Lk.road_km} km`, { className: 'slabel' }).addTo(map);
    L.polyline(JSON.parse(Lk.route_walk).map(p => [p[0], p[1]]), { color: css('--ink'), weight: step === 'access' ? 4 : 2.5, dashArray: '6 6' }).bindTooltip(`Footpath ${Lk.walk_km} km`, { className: 'slabel' }).addTo(map);
  }
  if (caseState.layers.habs) {
    const fb = {}; q('SELECT hab_id, theme, count(*) AS n FROM citizen_feedback WHERE school_id IN (?,?) GROUP BY 1, 2', [A.school_id, B.school_id]).forEach(r => { fb[r.hab_id] ||= { all: 0 }; fb[r.hab_id][r.theme] = r.n; fb[r.hab_id].all += r.n; });
    habs.forEach(h => {
      const n = step === 'community' ? (caseState.theme ? fb[h.hab_id]?.[caseState.theme] || 0 : fb[h.hab_id]?.all || 0) : 0;
      L.circleMarker([h.lat, h.lng], { radius: step === 'community' ? 5 + Math.sqrt(n) * 2 : 5 + Math.sqrt(h.children), color: css('--ink'), weight: 1.5, fillColor: step === 'community' ? css('--wait') : '#fff', fillOpacity: step === 'community' ? 0.55 : 1 })
        .bindTooltip(`${h.name} · ${h.children} children${step === 'community' ? ` · ${n} responses${caseState.theme ? ' on ' + caseState.theme.toLowerCase() : ''}` : ''}`, { className: 'slabel', permanent: true, direction: 'left', offset: [-8, 0] }).addTo(map);
    });
  }
  [[A, 'School A', css('--risk')], [B, 'School B', css('--accent')]].forEach(([s, l, col]) => { const east = s.lng >= Math.max(A.lng, B.lng); L.circleMarker([s.lat, s.lng], { radius: 10, color: '#fff', weight: 2.5, fillColor: col, fillOpacity: 1 })
    .bindTooltip(`${l}: ${s.name} · ${s.enrol_total}`, { permanent: true, className: 'rlabel', direction: east ? 'left' : 'right', offset: east ? [-12, 0] : [12, 0] }).addTo(map); });
  $$('.lyr input').forEach(i => i.onchange = () => { caseState.layers[i.dataset.l] = i.checked; render(); });
}
