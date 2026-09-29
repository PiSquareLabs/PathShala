import L from 'leaflet';
import { q } from '../../db/sqlite.js';
import { $, $$, colour, css, go, mHealth, pairsOf, school, short } from '../helpers.js';
import { baseMap } from './baseMap.js';
import { districts } from './districts.js';

export function buildHomeMap(ms) {
  if (typeof L === 'undefined') { $('#hmap').innerHTML = '<p style="padding:16px;color:var(--muted)">The map library could not load. The list works.</p>'; return; }
  const map = baseMap('hmap', { scrollWheelZoom: true });
  const dl = districts(map, new Set(ms.map(m => m.district)), true);
  dl.eachLayer(l => L.tooltip({ permanent: true, direction: 'center', className: 'dlabel' }).setContent(l.feature.properties.d).setLatLng(l.getBounds().getCenter()).addTo(map));
  const used = new Set(q('SELECT sending_id AS id FROM merge_groups UNION SELECT receiving_id FROM merge_groups').map(x => x.id));
  q('SELECT * FROM schools').filter(s => !used.has(s.school_id)).forEach(s => {
    L.circleMarker([s.lat, s.lng], { radius: 4, color: css('--faint'), weight: 1.5, fillColor: '#fff', fillOpacity: 1 })
      .bindTooltip(`${s.name} · ${s.enrol_total} students · not in a merge`, { className: 'slabel' }).on('click', () => go('s/' + s.school_id)).addTo(map);
  });
  const rs = ms.map(m => Object.assign(school(m.receiving_id), { m }));
  const placed = [];
  rs.slice().sort((x, y) => y.enrol_total - x.enrol_total).forEach(r => { r._label = !placed.some(o => Math.abs(o.lat - r.lat) < 0.06 && Math.abs(o.lng - r.lng) < 0.25); if (r._label) placed.push(r); });
  const recvMarkers = {};
  rs.forEach(r => {
    const m = r.m;
    pairsOf(m.merge_id).forEach(g => {
      const s = school(g.sending_id), col = colour(g.health);
      L.polyline([[s.lat, s.lng], [r.lat, r.lng]], { color: col, weight: 2.5, dashArray: g.status === 'Merged' ? null : '4 4' }).addTo(map);
      L.circleMarker([s.lat, s.lng], { radius: 5, color: col, weight: 2.5, fillColor: '#fff', fillOpacity: 1 })
        .bindTooltip(`${s.name} · ${s.enrol_total} students · closes`, { className: 'slabel' }).on('click', () => go(`m/${m.merge_id}/g/${g.group_id}`)).addTo(map);
    });
  });
  rs.forEach(r => {
    const m = r.m, east = rs.some(o => o !== r && Math.abs(o.lat - r.lat) < 0.25 && o.lng > r.lng && o.lng - r.lng < 0.6);
    const mk = L.circleMarker([r.lat, r.lng], { radius: Math.min(15, 6 + Math.sqrt(m.after_total) / 2.2), color: '#fff', weight: 2, fillColor: colour(mHealth(m)), fillOpacity: 1 })
      .bindTooltip(short(r.name), { permanent: r._label, className: 'rlabel', direction: east ? 'left' : 'right', offset: east ? [-10, 0] : [10, 0] })
      .on('click', () => go('m/' + m.merge_id)).addTo(map);
    mk.on('mouseover', () => $(`.rcv[data-m="${m.merge_id}"]`)?.classList.add('hover'));
    mk.on('mouseout', () => $(`.rcv[data-m="${m.merge_id}"]`)?.classList.remove('hover'));
    recvMarkers[m.merge_id] = mk;
  });
  $$('.rcv').forEach(c => {
    c.addEventListener('mouseenter', () => { const mk = recvMarkers[c.dataset.m]; if (mk) { mk.setStyle({ color: css('--ink'), weight: 3 }); mk.bringToFront(); } });
    c.addEventListener('mouseleave', () => recvMarkers[c.dataset.m]?.setStyle({ color: '#fff', weight: 2 }));
  });
}

/* ---------- merge overview ---------- */
