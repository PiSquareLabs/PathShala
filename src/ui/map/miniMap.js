import L from 'leaflet';
import { q } from '../../db/sqlite.js';
import { RECEIVER_ISSUES } from '../../engine/merges.js';
import { $, css, go, school, short, tone } from '../helpers.js';
import { baseMap } from './baseMap.js';
import { districts } from './districts.js';

export function miniMap(m, ps, r) {
  if (typeof L === 'undefined') { $('#mmap').innerHTML = '<p style="padding:16px;color:var(--muted)">Map library could not load.</p>'; return; }
  const map = baseMap('mmap');
  const pts = [[r.lat, r.lng], ...ps.map(g => { const s = school(g.sending_id); return [s.lat, s.lng]; })];
  map.fitBounds(L.latLngBounds(pts).pad(0.35), { maxZoom: 14 });
  districts(map, new Set([m.district]), false);
  const fbAll = q('SELECT f.* FROM feedback f JOIN merge_groups g USING (group_id) WHERE g.merge_id = ?', [m.merge_id]);
  ps.forEach(g => {
    const s = school(g.sending_id);
    const tn = tone(q('SELECT sentiment, issue FROM feedback WHERE group_id = ?', [g.group_id]).filter(f => !RECEIVER_ISSUES.includes(f.issue)));
    L.polyline([[s.lat, s.lng], [r.lat, r.lng]], { color: css('--muted'), weight: 2, dashArray: '4 4' }).addTo(map);
    L.circleMarker([s.lat, s.lng], { radius: 8, color: '#fff', weight: 2, fillColor: tn.col, fillOpacity: 1 })
      .bindTooltip(`${s.name} · ${s.enrol_total}`, { permanent: true, className: 'rlabel', direction: s.lng < r.lng ? 'left' : 'right', offset: s.lng < r.lng ? [-10, 0] : [10, 0] })
      .on('click', () => go(`m/${m.merge_id}/g/${g.group_id}`)).addTo(map);
  });
  const tr = tone(fbAll.filter(f => RECEIVER_ISSUES.includes(f.issue)));
  L.circleMarker([r.lat, r.lng], { radius: 12, color: css('--ink'), weight: 2.5, fillColor: tr.col, fillOpacity: 1 })
    .bindTooltip(`${short(r.name)} · ${r.enrol_total} → ${m.after_total}`, { permanent: true, className: 'rlabel on', direction: 'top', offset: [0, -12] })
    .on('click', () => go('s/' + r.school_id)).addTo(map);
}

/* ---------- one closing school ---------- */
