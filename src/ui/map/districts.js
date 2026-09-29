import L from 'leaflet';
import { GEO } from '../../geo.js';
import { css } from '../helpers.js';

export function districts(map, active, fit) {
  const dl = L.geoJSON(GEO, { style: f => ({ color: css('--land-edge'), weight: 0.9, fillColor: active.has(f.properties.d) ? css('--land-hi') : css('--land'), fillOpacity: 1 }), interactive: false });
  if (fit) map.fitBounds(dl.getBounds(), { padding: [12, 12] });
  dl.addTo(map);
  return dl;
}

/* ---------- home ---------- */
