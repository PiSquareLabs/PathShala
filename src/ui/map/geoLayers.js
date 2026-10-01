import L from 'leaflet';
import { q } from '../../db/sqlite.js';
import { css } from '../helpers.js';

export function geoLayers(map, on) {
  const g = q('SELECT * FROM geo_features');
  const out = {};
  g.forEach(f => {
    const geom = JSON.parse(f.geometry);
    let layer = null;
    if (f.kind === 'river' && on.river) layer = L.polyline(geom, { color: '#6aa7d8', weight: 4, opacity: 0.8 });
    if (f.kind === 'road' && on.road) layer = L.polyline(geom, { color: '#9a8f80', weight: 2.5, opacity: 0.9 });
    if (f.kind === 'bridge' && on.hazards) layer = L.marker(geom, { icon: L.divIcon({ className: 'bridgeicon', html: '<span>⚠</span>', iconSize: [22, 22] }) });
    if (f.kind === 'steep' && on.hazards) layer = L.polyline(geom, { color: css('--risk'), weight: 7, opacity: 0.45 });
    if (f.kind === 'landslide' && on.hazards) layer = L.polyline(geom, { color: css('--warn'), weight: 7, opacity: 0.45 });
    if (layer) { layer.bindTooltip(`${f.name}${f.season ? ' · ' + f.season : ''}`, { className: 'slabel' }); layer.addTo(map); out[f.feature_id] = layer; }
  });
  return out;
}
