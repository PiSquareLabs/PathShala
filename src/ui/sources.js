/* Where the data on each page comes from. Synthesised data names PathShala as its source. */
export const SRC = {
  udise: ['School records', 'UDISE+ Know Your School (report cards where fetched); other schools from the UDISE+ school list'],
  coords: ['School locations', 'India Data Portal / Datameet UDISE coordinates'],
  merge_list: ['Merge pairs', 'HP Directorate of School Education merger list'],
  routes: ['Routes, distance and climb', 'Google Routes and Elevation APIs (Pekhri-2 area). Elsewhere: PathShala estimate from straight-line distance'],
  gis: ['Rivers, roads, bridges, hazards', 'OpenStreetMap, JRC Global Surface Water, GSI landslide susceptibility'],
  hab: ['Habitations', 'Google Open Buildings v3 for locations; PathShala for the count of children per habitation (synthesised)'],
  bounds: ['District boundaries', 'Public district GeoJSON'],
  rules: ['Rules and unit costs', 'RTE Rules 2010, HP Directorate of School Education, Samagra Shiksha financial norms, The Tribune (HP proposal)'],
  feedback: ['Citizen feedback', 'PathShala (synthesised for demo from real complaint patterns)'],
  outcomes: ['Attendance, success scores, survey answers', 'PathShala (synthesised for demo)'],
  agents: ['Agent findings and drafts', 'PathShala agents (rules, or Gemini when an AI key is connected), reading only the sources above'],
  officer: ['Field answers, choices, report', 'Entered by the officer in this app'],
};
const BY_ROUTE = {
  '': ['udise', 'coords', 'bounds', 'gis'],
  cases: ['udise', 'officer'],
  merges: ['merge_list', 'udise', 'outcomes', 'rules'],
  m: ['merge_list', 'udise', 'routes', 'gis', 'hab', 'outcomes', 'rules', 'officer'],
  s: ['udise', 'coords', 'hab', 'feedback'],
  new: ['udise', 'coords', 'routes', 'rules'],
  inbox: ['feedback', 'officer'],
  rules: ['rules'],
  ai: ['agents'],
  sql: ['udise', 'merge_list', 'routes', 'feedback', 'outcomes', 'rules'],
};
const CASE = { compare: ['udise', 'coords', 'routes', 'gis', 'hab', 'rules', 'feedback'], feedback: ['feedback', 'agents'], evidence: ['udise', 'routes', 'gis', 'hab', 'feedback', 'agents'], investigate: ['agents', 'officer', 'feedback', 'routes'], policy: ['rules', 'agents', 'officer'], report: ['agents', 'officer', 'rules', 'udise'] };
export const sourcesFor = r => (r[0] === 'case' ? CASE[{ access: 'evidence', community: 'evidence' }[r[2]] || r[2]] || CASE.compare : BY_ROUTE[r[0] || ''] || BY_ROUTE['']).map(k => SRC[k]);
export const sourcesHtml = r => `<details class="srcs" id="srcs"><summary>Sources of data on this page</summary><dl>${sourcesFor(r).map(([l, s]) => `<dt>${l}</dt><dd class="${/PathShala \(/.test(s) ? 'syn' : ''}">${s}</dd>`).join('')}</dl></details>`;
