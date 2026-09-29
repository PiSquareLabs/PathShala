// District polygons for the 12 Himachal Pradesh districts (public/hp.json, property `d` = district name).
export let GEO = { type: 'FeatureCollection', features: [] };

export async function loadGeo() {
  const res = await fetch(import.meta.env.BASE_URL + 'hp.json');
  if (!res.ok) throw new Error('Could not load hp.json');
  GEO = await res.json();
}
