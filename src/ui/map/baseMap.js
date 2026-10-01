import L from 'leaflet';

export let maps = [];
export function baseMap(el, opts) {
  const map = L.map(el, Object.assign({ zoomControl: true, attributionControl: false, zoomSnap: 0.25, zoomAnimation: false, markerZoomAnimation: false, scrollWheelZoom: false }, opts));
  // Programmatic moves are not animated: a zoom animation still running when the page re-renders
  // and removes the map throws inside Leaflet (_onZoomTransitionEnd on a removed map).
  const fit = map.fitBounds.bind(map), view = map.setView.bind(map);
  map.fitBounds = (b, o = {}) => fit(b, { animate: false, ...o });
  map.setView = (c, z, o = {}) => view(c, z, { animate: false, ...o });
  maps.push(map);
  return map;
}

export function resetMaps() { maps = []; }
