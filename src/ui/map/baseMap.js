import L from 'leaflet';

export let maps = [];
export function baseMap(el, opts) {
  const map = L.map(el, Object.assign({ zoomControl: true, attributionControl: false, zoomSnap: 0.25, scrollWheelZoom: false }, opts));
  maps.push(map);
  return map;
}

export function resetMaps() { maps = []; }
