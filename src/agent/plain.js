/* Plain-language descriptions of what the agents are doing, for officers (no tool names, no jargon). */
const SAY = {
  habitations_and_children: 'Finding the villages the children come from and counting the children',
  terrain_profile: 'Studying the geography around both schools: hills, rivers, snow and landslide risk',
  route_calc: 'Working out the road route between the two schools',
  route_estimate: 'Estimating the distance, because this route has not been surveyed',
  transport_lookup: 'Checking whether a bus runs at school times',
  web_search: 'Looking for news reports about this route and these schools',
  pickup_stops: 'Planning where a vehicle could pick the children up',
  cost_calc: 'Working out what it would cost, using the official rate',
  extract_claims: 'Reading what parents and villagers say and picking out the specific claims',
  attendance_by_month: 'Checking whether children stay away in certain months',
  gis_overlay: 'Checking the map for bridges, steep paths and landslide zones on the way',
  field_observations: "Reading the government officers' site notes",
  school_profile: 'Reading the school records',
  check_claims: 'Checking each claim against the records, the map and the site notes',
  compare_options: 'Comparing the candidate schools side by side',
  suggest_option: 'Weighing the trade-offs to find the best fit',
};
const RAG = { policy: 'Looking up the government rules that apply', feedback: 'Reading what parents and villagers say', past: 'Looking at similar past cases', reports: 'Looking at news reports', case: 'Re-reading the case notes' };
export function plainStep(tool, args) {
  if (tool === 'rag_search') { const c = Array.isArray(args?.collections) ? args.collections : [args?.collections]; return RAG[c[0]] || 'Searching the sources'; }
  return SAY[tool] || 'Working';
}
