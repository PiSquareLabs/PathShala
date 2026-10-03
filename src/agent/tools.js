/* Every agent tool is an async (input) => output over plain JSON, running on sql.js in the browser.
   The same functions serve the simulated agents now and Gemini function calling later (`toolSchemas`,
   Gemini function-declaration format). Tools never write to the database: the case repository does. */
import { SCHOOL_WINDOWS, nearby, routeHazards, walkProfile } from '../case/analysis.js';
import { draftSentences } from '../case/draft.js';
import { q, q1 } from '../db/sqlite.js';
import { retrieve } from '../retrieval/bm25.js';
import { feedbackAbout } from './feedbackAgents.js';
import { optionSummary, routeInfo, invRow, tracks, trackId } from '../case/options.js';
import { placesFor, search } from './rag.js';
import { P, place, capOf, facts, haversine, inr, linkOf, school } from '../ui/helpers.js';

export const tools = {};
export const toolSchemas = [];

function defineTool(name, description, properties, required, fn) {
  tools[name] = fn;
  toolSchemas.push({ name, description, parameters: { type: 'object', properties, required } });
}
const str = description => ({ type: 'string', description });
const strs = description => ({ type: 'array', items: { type: 'string' }, description });

/* ---------- sql_query: read-only ---------- */
const FORBIDDEN = /\b(insert|update|delete|drop|alter|create|replace|attach|detach|pragma|vacuum|reindex)\b/i;
export function checkReadOnlySql(sql) {
  const bare = sql.replace(/--.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '').trim().replace(/;\s*$/, '');
  if (!/^(select|with)\b/i.test(bare)) throw new Error('sql_query only accepts SELECT or WITH statements');
  const noStrings = bare.replace(/'(?:[^']|'')*'/g, "''").replace(/"(?:[^"]|"")*"/g, '""');
  if (noStrings.includes(';')) throw new Error('sql_query accepts a single statement');
  if (FORBIDDEN.test(noStrings)) throw new Error('sql_query is read-only');
  const known = new Set(q("SELECT name FROM sqlite_master WHERE type IN ('table','view')").map(t => t.name.toLowerCase()));
  const ctes = new Set([...noStrings.matchAll(/\b(\w+)\s+as\s*\(/gi)].map(m => m[1].toLowerCase()));
  for (const m of noStrings.matchAll(/\b(?:from|join)\s+"?([A-Za-z_]\w*)"?/gi)) {
    const t = m[1].toLowerCase();
    if (!known.has(t) && !ctes.has(t)) throw new Error(`Table "${m[1]}" is not available to agents`);
  }
  return bare;
}
defineTool('sql_query', 'Run a read-only SQL query (SELECT or WITH) on the PathShala database. Returns rows as objects.',
  { sql: str('A single SELECT or WITH statement') }, ['sql'],
  async ({ sql }) => ({ rows: q(checkReadOnlySql(sql)) }));

/* ---------- schools, routes, GIS, transport ---------- */
defineTool('school_profile', 'School row (UDISE+), facts (building condition, head teacher, toilets, ramp) and the habitations near it.',
  { school_id: str('School id') }, ['school_id'],
  async ({ school_id }) => { const sc = school(school_id); return { school: sc || null, capacity: sc ? capOf(sc) : null, facts: facts(school_id), habitations: q('SELECT * FROM habitations WHERE school_id = ?', [school_id]) }; });

defineTool('nearby_schools', 'Schools of a suitable level within max_km, with a transparent screening score (not a recommendation).',
  { school_id: str('School that would close'), max_km: { type: 'number', description: 'Search radius in km (default 12)' } }, ['school_id'],
  async ({ school_id, max_km = 12 }) => nearby(school_id, max_km).map(x => ({ school_id: x.s.school_id, road_km: x.road, walk_min: x.walkMin, capacity: x.cap, available: x.avail, hazards: x.hz, score: x.score, parts: x.parts, estimated: x.est })));

defineTool('route_calc', "Route between two schools. Walking time uses Tobler's hiking function on the elevation profile scaled by the child pace rule (R13); road time comes from the links table.",
  { from_id: str('Start school id'), to_id: str('End school id'), mode: { type: 'string', enum: ['walk', 'road'] } }, ['from_id', 'to_id', 'mode'],
  async ({ from_id, to_id, mode }) => {
    const lk = linkOf(from_id, to_id);
    if (!lk) return { available: false, reason: 'Data unavailable' };
    if (mode === 'road') return { available: true, km: lk.road_km, minutes: lk.road_min };
    const wp = walkProfile(lk);
    if (!wp) return { available: false, reason: 'Data unavailable' };
    return { available: true, km: wp.km, minutes: wp.min, climb_m: wp.climb, descent_m: wp.descent, max_slope_pct: wp.maxSlope, steep_km: wp.steepKm, profile: wp.prof, pace: wp.pace };
  });

defineTool('gis_overlay', 'Mapped features (bridges, steep paths, landslide zones) within buffer_m of the walking or road route.',
  { from_id: str('Start school id'), to_id: str('End school id'), route: { type: 'string', enum: ['walk', 'road'] }, buffer_m: { type: 'number' }, layers: strs('Feature kinds, default bridge, steep, landslide') }, ['from_id', 'to_id', 'route'],
  async ({ from_id, to_id, route, buffer_m = 150, layers }) => {
    const lk = linkOf(from_id, to_id);
    if (!lk) return terrainFeatures(from_id).concat(terrainFeatures(to_id)).filter(f => !layers?.length || layers.includes(f.kind));   // not surveyed: the terrain recorded around the two schools
    return routeHazards(lk, route, buffer_m, layers && layers.length ? layers : undefined).map(f => ({ ...f, source_url: f.source_url ?? f.url ?? null }));
  });

/* How hard the terrain around a school is, in risk points (higher is worse). A river crossing without a bridge, a flash-flood stream or a landslide
   zone weigh most; a bridge, snow, a poor road, wildlife or a steep path weigh less. */
const terrainRisk = t => !t ? 0 : (t.crossing_kind === 'ford' ? 30 : t.crossing_kind === 'bridge' ? 10 : 0) + (t.monsoon_hazard === 'landslide' ? 25 : t.monsoon_hazard === 'flash flood' ? 25 : 0) + (t.snow_months ? 10 : 0) + (/kutcha/.test(t.road_type || '') ? 10 : /footpath/.test(t.road_type || '') ? 20 : 0) + (t.wildlife ? 10 : 0) + (t.slope_pct >= 18 ? 15 : 0);
/* Terrain around a school (PathShala synthesised data): slope, river crossing, monsoon hazard, snow, road type, wildlife.
   Turned into map-like features so the claim checks and the questions treat every school's terrain the same way. */
const terrainRow = id => q1('SELECT * FROM school_terrain WHERE school_id = ?', [id]);
function terrainFeatures(id) {
  const t = terrainRow(id), v = t && place(school(id)); if (!t) return [];
  const f = (kind, name, season, detail) => ({ feature_id: `T-${id}-${kind}`, kind, name, season, detail, status: 'synthesised', source: 'mock', source_url: null });
  return [
    t.crossing_kind && f('bridge', t.crossing_name, t.monsoon_hazard ? 'Monsoon' : '', t.crossing_kind === 'ford' ? 'Crossed on foot; rises in rain' : 'Bridge or footbridge on the way'),
    t.slope_pct >= 18 && f('steep', `Steep path near ${v}`, '', `Slope about ${t.slope_pct}%`),
    t.monsoon_hazard === 'landslide' && f('landslide', `Landslide-prone stretch near ${v}`, 'Monsoon', t.monsoon_note),
  ].filter(Boolean);
}
defineTool('terrain_profile', 'Terrain around the closing and the receiving school (slope, river crossing, monsoon hazard, snow months, road type, wildlife, elevation). Synthesised by PathShala; not a survey.',
  { school_ids: strs('School ids: closing school first, then receiving school') }, ['school_ids'],
  async ({ school_ids }) => {
    const ids = (Array.isArray(school_ids) ? school_ids : String(school_ids || '').split(/[,\s]+/)).filter(Boolean);
    const rows = ids.map(id => { const t = terrainRow(id); return t ? { ...t, name: school(id).name, village: place(school(id)) } : { school_id: id, name: school(id).name, none: true }; });
    return { closing: rows[0] || null, receiving: rows[1] || null, features: ids.flatMap(terrainFeatures), elev_diff_m: rows.length > 1 && !rows[0].none && !rows[1].none ? rows[1].elev_m - rows[0].elev_m : null, source: 'PathShala (synthesised)' };
  });

defineTool('transport_lookup', 'Public and school transport at school arrival and departure times. No timetable source is connected yet, so this reports "Data unavailable"; the answer is collected as a field question.',
  { habitation_ids: strs('Habitations to cover (optional)'), windows: strs('Time windows, e.g. 08:15-09:15') }, [],
  async ({ windows = SCHOOL_WINDOWS } = {}) => ({ available: false, reason: 'Data unavailable: no timetable source is connected', windows }));

/* ---------- community feedback ---------- */
defineTool('feedback_search', 'Citizen feedback messages about schools or habitations, in Hindi and English, with theme and status.',
  { school_ids: strs('School ids'), about_id: str('Only messages about moving to this receiving school'), hab_ids: strs('Habitation ids (optional)'), theme: str('Theme filter (optional)'), limit: { type: 'integer' } }, ['school_ids'],
  async ({ school_ids, about_id, hab_ids, theme, limit }) => {
    const where = [`f.school_id IN (${school_ids.map(() => '?').join(',')})`], args = [...school_ids];
    if (hab_ids?.length) { where.push(`f.hab_id IN (${hab_ids.map(() => '?').join(',')})`); args.push(...hab_ids); }
    if (about_id) { where.push('f.about_id = ?'); args.push(about_id); }
    if (theme) { where.push('f.theme = ?'); args.push(theme); }
    const rows = q(`SELECT f.*, h.name AS hab FROM citizen_feedback f LEFT JOIN habitations h USING (hab_id) WHERE ${where.join(' AND ')} ORDER BY f.fb_id${limit ? ' LIMIT ' + Math.floor(limit) : ''}`, args);
    return rows.map(f => ({ fb_id: f.fb_id, hab_id: f.hab_id, hab: f.hab, theme: f.theme, text_hi: f.text_hi, text_en: f.text_en, status: f.status, verified_by: f.verified_by, channel: f.channel, received: f.received }));
  });

export const THEMES = ['Transport', 'Seasonal access', 'Safety', 'Facilities', 'Other'];
defineTool('classify_feedback', 'Group feedback messages by theme (fixed list: Transport, Seasonal access, Safety, Facilities, Other). Returns counts and message ids for every count.',
  { fb_ids: { type: 'array', items: { type: 'integer' } } }, ['fb_ids'],
  async ({ fb_ids }) => {
    // Mock mode uses the stored theme column; Gemini mode sends batches of 20 with the fixed theme list.
    const themes = {};
    for (const id of fb_ids) {
      const f = q1('SELECT fb_id, hab_id, theme, status FROM citizen_feedback WHERE fb_id = ?', [id]);
      if (!f) continue;
      const t = (themes[f.theme] ||= { count: 0, verified: 0, habitations: 0, hab_ids: [], fb_ids: [] });
      t.count++; if (f.status === 'verified') t.verified++;
      if (!t.hab_ids.includes(f.hab_id)) t.hab_ids.push(f.hab_id);
      t.fb_ids.push(id);
    }
    Object.values(themes).forEach(t => { t.habitations = t.hab_ids.length; });
    return { themes };
  });

defineTool('recurring_concerns', 'Themes that recur: at least 10 responses, or responses from at least 3 habitations. "Other" is excluded.',
  { themes: { type: 'object', description: 'Output of classify_feedback: {name: {count, habitations}}' } }, ['themes'],
  async ({ themes }) => Object.entries(themes).filter(([k, v]) => k !== 'Other' && (v.count >= 10 || v.habitations >= 3)).map(([k]) => k));

defineTool('field_observations', 'Government field observations recorded for a school.',
  { school_id: str('School id') }, ['school_id'],
  async ({ school_id }) => q('SELECT * FROM field_obs WHERE school_id = ?', [school_id]));

defineTool('evidence_gaps', "Missing evidence that would change the officer's assessment (rule-based list, 5 gaps, one per field question).",
  { case_id: str('Case id') }, ['case_id'],
  async ({ case_id }) => {
    const c = q1('SELECT * FROM cases WHERE case_id = ?', [case_id]), lk = c && linkOf(c.from_id, c.to_id);
    const bridge = lk ? routeHazards(lk).some(h => h.kind === 'bridge') : false;
    return [
      bridge ? { gap: 'Bridge passability in heavy rain', why: 'A seasonal river crossing decides whether the walk is possible in the monsoon.', suggested_type: 'choice' }
        : { gap: 'Route passability in rain and snow', why: 'No mapped crossing, but the route has not been checked in the monsoon or winter.', suggested_type: 'choice' },
      { gap: 'Students who use this route', why: 'The number of affected students sets the cost of any transport support.', suggested_type: 'number' },
      { gap: 'Public transport at school times', why: 'The timetable was not verified for school arrival and departure.', suggested_type: 'choice' },
      { gap: 'Actual travel time in school hours', why: lk ? 'The calculated time has not been checked against the ground.' : 'The route was not surveyed; there is no calculated time.', suggested_type: 'minutes' },
      { gap: 'Photo or GPS evidence', why: 'Officer-collected evidence makes the findings verifiable.', suggested_type: 'evidence' },
    ];
  });

/* ---------- field answers -> evidence updates ---------- */
defineTool('apply_field_answers', 'Compute the evidence and finding status changes implied by field answers Q1..Q5. Pure: the repository persists the result.',
  { case_id: str('Case id'), answers: { type: 'object', description: '{Q1: {answer, note}, ...}' } }, ['case_id', 'answers'],
  async ({ case_id, answers: A }) => {
    const evidence_changes = [], new_evidence = [], fs = {};
    q('SELECT fid, status FROM findings WHERE case_id = ?', [case_id]).forEach(f => { fs[f.fid] = f.status; });
    const touched = new Set(), setF = (fid, s) => { fs[fid] = s; touched.add(fid); };
    const up = (eid, fid, kind, status, label, detail) => new_evidence.push({ eid, fid, kind, status, label, detail, ref: 'field' });
    if (A.Q1?.answer) {
      up('E14', 'F2', 'field', 'verified', `Field check: crossing ${A.Q1.answer === 'Yes' ? 'is passable in heavy rain' : A.Q1.answer === 'No' ? 'is not passable in heavy rain' : 'is passable only outside the monsoon'}`, A.Q1.note || '');
      setF('F2', A.Q1.answer === 'Yes' ? 'Not confirmed' : 'Verified');
    }
    if (A.Q2?.answer) up('E15', 'F1', 'field', 'verified', `${A.Q2.answer} students use this route (field count)`, A.Q2.note || '');
    if (A.Q3?.answer) {
      if (A.Q3.answer !== 'Unknown') {
        const e5 = q1("SELECT detail FROM evidence WHERE case_id = ? AND eid = 'E5'", [case_id]);
        evidence_changes.push({ eid: 'E5', status: 'verified', label: A.Q3.answer === 'No' ? 'Public transport unavailable during school hours' : 'Public transport available at school times', detail: (e5?.detail || '') + ' · checked in the field' });
      }
      setF('F1', A.Q3.answer === 'No' ? 'Confirmed concern' : A.Q3.answer === 'Yes' ? 'Partly addressed' : 'Potential issue');
    }
    if (A.Q4?.answer) up('E16', 'F1', 'field', 'verified', `Measured travel time about ${A.Q4.answer} min during school hours`, 'Compared with the calculated walking time');
    if (A.Q5?.answer || A.Q5?.note) up('E17', 'F2', 'field', 'verified', `Supporting evidence attached: ${A.Q5.answer || 'note'}`, A.Q5.note || '');
    if ((A.Q2?.answer || A.Q3?.answer === 'No') && fs.F1 !== undefined && fs.F1 !== 'Partly addressed') setF('F1', 'Confirmed concern');
    return { evidence_changes, finding_changes: [...touched].map(fid => ({ fid, status: fs[fid] })), new_evidence };
  });

/* ---------- policy and cost ---------- */
defineTool('policy_retrieve', 'Retrieve policy passages (RTE Rules, Samagra Shiksha norms, HP merger decision, court judgments) relevant to a query. BM25 now; vector search later.',
  { query: str('Search text'), k: { type: 'integer' }, doc_ids: strs('Restrict to these documents') }, ['query'],
  async ({ query, k = 5, doc_ids }) => retrieve(query, k).filter(h => !doc_ids?.length || doc_ids.includes(h.doc_id))
    .map(h => ({ chunk_id: h.chunk_id, doc_id: h.doc_id, doc_title: h.doc_title, section: h.section, text: h.text, url: h.url, verbatim: h.verbatim, score: h.score, hits: h.hits })));

defineTool('cost_calc', 'Deterministic cost of an intervention (TR transport, ES escort, SEA seasonal learning point, RET rebuild) from the rules table. The ONLY source of costs.',
  { intervention: { type: 'string', enum: ['TR', 'ES', 'SEA', 'RET'] }, inputs: { type: 'object', description: 'TR: {kids, kids_source, road_km}; ES: {kids}; SEA: {feature_id, months}; RET: {classrooms}' } }, ['intervention', 'inputs'],
  async ({ intervention, inputs: i = {} }) => {
    const R = P(), rate = R.transport_per_child, rateTxt = `${inr(rate)} per child per year (average)`;
    if (intervention === 'TR') {
      const kids = i.kids;
      return { inputs: [['Eligible students', kids, i.kids_source || 'School roll (UDISE+)'], ['Required route', `${i.road_km} km by road`, 'GIS calculation'], ['Applicable rate', rateTxt, 'Samagra Shiksha norm, C6']], formula: `${kids} × ${inr(rate)}`, cost_inr: kids * rate, cost_type: 'per year' };
    }
    if (intervention === 'ES') {
      const n = i.kids;
      return { inputs: [['Students in Classes 1–5', n, 'School roll (UDISE+)'], ['Applicable rate', rateTxt, 'C6']], formula: `${n} × ${inr(rate)}`, cost_inr: n * rate, cost_type: 'per year' };
    }
    if (intervention === 'SEA') return { inputs: [['Months', i.months || 'Jul–Sep', `Bridge season (feature ${i.feature_id || 'BR1'})`], ['Staff', '1 teacher on rotation', 'Existing staff']], formula: 'Existing staff; no new cost', cost_inr: 0, cost_type: 'none' };
    if (intervention === 'RET') {
      const rooms = i.classrooms ?? 2;
      if (!rooms) return { inputs: [['Classrooms to rebuild', 0, 'No building problem recorded']], formula: 'No new rooms', cost_inr: 0, cost_type: 'none' };
      return { inputs: [['Classrooms to rebuild', rooms, 'Existing classrooms (UDISE+)'], ['Rate', inr(R.classroom_cost) + ' per classroom', 'HP PAB 2025-26 (rule R8)']], formula: `${rooms} × ${inr(R.classroom_cost)}`, cost_inr: rooms * R.classroom_cost, cost_type: 'one-time' };
    }
    throw new Error('Unknown intervention ' + intervention);
  });

/* ---------- case memory ---------- */
defineTool('get_case_evidence', 'Everything already established in a case: findings, evidence, field answers, selected interventions and the policy chunks they cite.',
  { case_id: str('Case id') }, ['case_id'],
  async ({ case_id }) => {
    const interventions = q('SELECT * FROM interventions WHERE case_id = ? AND selected = 1', [case_id]);
    const chunk_ids = [...new Set(interventions.flatMap(v => JSON.parse(v.chunk_ids)))];
    return {
      findings: q('SELECT * FROM findings WHERE case_id = ? ORDER BY fid', [case_id]),
      evidence: q('SELECT * FROM evidence WHERE case_id = ? ORDER BY CAST(substr(eid, 2) AS INTEGER)', [case_id]),
      field_answers: q('SELECT qid, text, answer, note FROM field_questions WHERE case_id = ? ORDER BY seq', [case_id]),
      interventions,
      chunks: chunk_ids.map(id => q1('SELECT chunk_id, section, text FROM policy_chunks WHERE chunk_id = ?', [id])).filter(Boolean),
    };
  });

defineTool('draft_report', 'Draft the rationale sentences from the case evidence only. Every sentence carries evidence or policy references.',
  { case_id: str('Case id') }, ['case_id'],
  async ({ case_id }) => ({ sentences: draftSentences(case_id) }));

/* ---------- research tools: search, transport planning, claim checking, option comparison ---------- */
const COLL = { type: 'array', items: { type: 'string', enum: ['policy', 'feedback', 'reports', 'case', 'past'] }, description: 'Collections to search' };
defineTool('rag_search', 'Search the collections (policy, feedback, reports, case, past) by keywords and meaning, filtered by place, top k. Returns passages with source, date, place, exact-wording-or-summary and score, or "No source found". Cite only passages returned here.',
  { collections: COLL, query: str('What to look for'), places: strs('Places to keep (defaults to the case area)'), case_id: str('Case id (needed for the case collection)'), k: { type: 'integer' } }, ['collections', 'query'],
  async ({ collections, query, places, case_id, k = 5 }) => {
    const c = case_id && q1('SELECT * FROM cases WHERE case_id = ?', [case_id]);
    const area = places?.length ? places : c ? [...placesFor([c.from_id, c.to_id])] : undefined;
    return search({ collections, query, places: area, cid: case_id, k, about: c ? [c.from_id, c.to_id] : undefined });
  });
defineTool('web_search', 'Search public reports (news and web items). Every result is labelled "Web source, needs verification" and never changes evidence status by itself.',
  { query: str('What to look for'), places: strs('Places to keep'), case_id: str('Case id') }, ['query'],
  async ({ query, places, case_id }) => {
    const c = case_id && q1('SELECT * FROM cases WHERE case_id = ?', [case_id]);
    return search({ collections: ['reports'], query, places: places?.length ? places : c ? [...placesFor([c.from_id, c.to_id])] : undefined, k: 5 });
  });
defineTool('habitations_and_children', 'Habitations served by a school and the number of children on its roll (UDISE+). Per-habitation child counts are not recorded.',
  { school_id: str('Closing school id'), students: { type: 'integer', description: 'Field-verified count, if known' } }, ['school_id'],
  async ({ school_id, students }) => {
    const sc = school(school_id), hs = q('SELECT hab_id, name, elev_m, road_connected FROM habitations WHERE school_id = ? ORDER BY hab_id', [school_id]);
    return { habitations: hs, habitation_count: hs.length, children: students || sc.enrol_total, children_source: students ? 'Field count' : 'School roll (UDISE+)', primary_children: sc.enrol_primary };
  });
defineTool('route_estimate', 'Straight-line estimate of the road and walking distance when a route has not been surveyed (straight line x 1.4 and x 1.3). An estimate, never a survey.',
  { from_id: str('Start school'), to_id: str('End school') }, ['from_id', 'to_id'],
  async ({ from_id, to_id }) => { const r = routeInfo(from_id, to_id); return { estimate: true, straight_km: r.d, road_km: r.road_km, walk_km: r.walk_km, walk_min: r.walk_min }; });
defineTool('pickup_stops', 'Proposed pickup stops: one at each road-connected habitation; habitations with no road walk to the nearest road-connected habitation (distance from coordinates).',
  { school_id: str('Closing school id') }, ['school_id'],
  async ({ school_id }) => {
    const hs = q('SELECT * FROM habitations WHERE school_id = ? ORDER BY hab_id', [school_id]), roads = hs.filter(h => h.road_connected);
    const stops = hs.map(h => {
      if (h.road_connected) return { habitation: h.name, stop: h.name, stop_type: 'at the habitation', walk_to_stop_m: 0 };
      const near = roads.slice().sort((a, b) => haversine(h, a) - haversine(h, b))[0];
      return near ? { habitation: h.name, stop: near.name, stop_type: 'walk to the nearest road', walk_to_stop_m: Math.round(haversine(h, near) * 1000) } : { habitation: h.name, stop: null, stop_type: 'no road-connected stop', walk_to_stop_m: null };
    });
    return { stops, stop_count: new Set(stops.map(s => s.stop).filter(Boolean)).size, habitations_on_foot: stops.filter(s => s.walk_to_stop_m > 0).length };
  });
defineTool('attendance_by_month', 'Attendance percentage by month for a school (merge records only). "Data unavailable" when none is recorded.',
  { school_id: str('School id') }, ['school_id'],
  async ({ school_id }) => { const rows = q('SELECT month, pct FROM attendance WHERE school_id = ? ORDER BY month', [school_id]); return rows.length ? { available: true, months: rows } : { available: false, reason: 'Data unavailable: no attendance recorded for this school' }; });

/* Claims in citizen messages: place, time and what is said. */
const KINDS = [['social', /(panchayat|consult|identity|anganwadi|mid-day|should not close)/i], ['building', /(collapse|building)/i], ['staff', /(teachers|studies will|learn well)/i],
  ['enrolment', /(very few children|few children)/i], ['facility', /(classrooms|good rooms|ramp|toilets)/i], ['road', /(link road|kutcha|vehicles do not come)/i],
  ['transport', /(bus|taxi|fare|vehicle|walk to the main road|go with the small)/i], ['safety', /(alone|wild|animal|afraid)/i], ['hazard', /(rain|monsoon|winter|freez|stone|bridge|river|steep|climb|flood|snow|landslide|path)/i]];
export const claimKind = t => (KINDS.find(([, re]) => re.test(t)) || ['other'])[0];
defineTool('extract_claims', 'Extract distinct claims from the citizen messages about the case schools: what is said, where, when, and how many messages say it.',
  { case_id: str('Case id') }, ['case_id'],
  async ({ case_id }) => {
    const by = {};
    feedbackAbout(case_id).forEach(m => { (by[m.text_en] ||= []).push(m); });
    const claims = Object.entries(by).sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0])).map(([text, ms], i) => {
      const count = k => ms.filter(m => m[k]).reduce((a, m) => ({ ...a, [m[k]]: (a[m[k]] || 0) + 1 }), {}), top = o => Object.entries(o).sort((x, y) => y[1] - x[1])[0]?.[0] || null;
      const dates = ms.map(m => m.received).filter(Boolean).sort(), season = (text.match(/\b(winter|monsoon|rains?|7 am|9)\b/i) || [])[0];
      return { claim_id: 'CL' + (i + 1), text, kind: claimKind(text), place: top(count('hab')) || null, about_id: top(count('about_id')), time: season ? season : dates.length ? (dates[0] === dates.at(-1) ? dates[0] : `${dates[0]} to ${dates.at(-1)}`) : null, messages: ms.length, fb_ids: ms.map(m => m.fb_id) };
    });
    return { claims, claim_count: claims.length, message_count: Object.values(by).reduce((a, m) => a + m.length, 0) };
  });
/* Judge each claim against the facts gathered by the earlier steps. Supported / contradicted / unchecked, each with the source it rests on. */
defineTool('check_claims', 'Check each extracted claim against the timetable, attendance, map hazards, field observations, school records and habitation roads gathered so far. Marks supported, contradicted or unchecked, with sources. Web reports alone never make a claim supported.',
  { case_id: str('Case id'), claims: { type: 'array', items: { type: 'object' } }, facts: { type: 'object', description: 'Outputs of the earlier checks' } }, ['case_id', 'claims', 'facts'],
  async ({ case_id, claims, facts: F }) => {
    const c = q1('SELECT * FROM cases WHERE case_id = ?', [case_id]), A = school(c.from_id), B = school(c.to_id), sch = { [A.school_id]: F.profileA, [B.school_id]: F.profileB };
    const feats = F.hazards || [], obs = F.observations || [], habs = Object.fromEntries((F.profileA?.habitations || []).map(h => [h.name, h]));
    const web = (F.web?.passages || []).map(p => p.id);
    const out = claims.map(cl => {
      const sc = sch[cl.about_id] || F.profileB, S = sc?.school, f = sc?.facts || {};
      let status = 'unchecked', note = '', sources = [];
      const has = k => feats.some(x => x.kind === k), src = (ref, label) => sources.push({ ref, label });
      if (cl.kind === 'road') {
        const h = habs[cl.place]; if (h) { status = h.road_connected ? 'contradicted' : 'supported'; note = `${h.name} is ${h.road_connected ? 'road-connected' : 'not road-connected'} in the habitation records`; src('habitations', 'Habitation records'); } else note = 'No habitation recorded for this claim';
      } else if (cl.kind === 'transport') { note = F.timetable?.available ? 'Timetable available' : 'No bus timetable is available to check this'; if (F.timetable?.available === false) src('transport_lookup', 'Timetable: Data unavailable'); }
      else if (cl.kind === 'building') {
        const o = obs.find(x => x.kind === 'building'); if (o) { status = 'supported'; note = `Field observation: ${o.text}`; src(o.obs_id, `Field observation ${o.obs_id}`); } else if (/^(Poor|Unsafe)/.test(f.building || '')) { status = 'supported'; note = `Building recorded as: ${f.building}`; src('school_facts', 'School facts (UDISE+)'); }
      } else if (cl.kind === 'hazard' || cl.kind === 'safety') {
        const bridge = /(bridge|river)/i.test(cl.text), steep = /(steep|climb)/i.test(cl.text), slide = /(stones|landslide)/i.test(cl.text);
        const want = bridge ? 'bridge' : steep ? 'steep' : slide ? 'landslide' : null, feat = want && feats.find(x => x.kind === want);
        if (feat) { status = 'supported'; note = `${want === 'bridge' ? 'A river crossing is' : 'A mapped feature is'} on the route: ${feat.name}`; src(feat.feature_id, `Map feature ${feat.name}`); }
        else if (bridge) { const o = obs.find(x => x.kind === 'bridge'); if (o) { status = 'supported'; note = `Field observation: ${o.text}`; src(o.obs_id, `Field observation ${o.obs_id}`); } }
        if (status === 'unchecked') note = want ? 'Not found on the mapped route' : 'No measured data on weather or safety';
      } else if (cl.kind === 'staff' && /more teachers/i.test(cl.text)) {
        const a = F.profileA?.school?.teachers, b = F.profileB?.school?.teachers; if (a != null && b != null) { status = b > a ? 'supported' : 'contradicted'; note = `Teachers: ${b} at ${B.name}, ${a} at ${A.name}`; src('schools', 'School records (UDISE+)'); }
      } else if (cl.kind === 'enrolment' && S) { status = S.enrol_total < sc.capacity / 2 ? 'supported' : 'contradicted'; note = `${S.enrol_total} students on roll for ${sc.capacity} seats at ${S.name}`; src('schools', 'School records (UDISE+)'); }
      else if (cl.kind === 'facility' && S) {
        if (/ramp|toilets/i.test(cl.text)) { if (f.ramp != null && f.toilets_girls != null) { const ok = f.ramp === 1 && f.toilets_girls > 0; status = ok ? 'supported' : 'contradicted'; note = `Ramp ${f.ramp ? 'yes' : 'no'}, girls' toilets ${f.toilets_girls} at ${S.name}`; src('school_facts', 'School facts (UDISE+)'); } else note = 'Ramp or toilets not recorded'; }
        else if (f.building) { const ok = /^Good/.test(f.building) || (f.rooms_good > 0 && !f.rooms_major); status = ok ? 'supported' : 'contradicted'; note = `Building recorded as: ${f.building}`; src('school_facts', 'School facts (UDISE+)'); }
      }
      if (status === 'unchecked' && web.length && (cl.kind === 'hazard' || cl.kind === 'building')) note += `${note ? '. ' : ''}A public report exists (${web.join(', ')}): Web source, needs verification`;
      return { ...cl, status, note, sources };
    });
    const n = s => out.filter(x => x.status === s).length;
    return { claims: out, checked_count: out.length, supported: n('supported'), contradicted: n('contradicted'), unchecked: n('unchecked') };
  });

/* Compare the candidate schools using numbers taken from the case record and the tools. */
defineTool('compare_options', 'Compare the candidate receiving schools on walking time, free seats, confirmed concerns and cost (numbers from the case record only).',
  { inv_id: str('Investigation id') }, ['inv_id'],
  async ({ inv_id }) => {
    const I = invRow(inv_id), A = school(I.from_id), R = P(), limit = A.level_code === 'primary' ? R.walk_limit_primary_km : R.walk_limit_upper_km;
    const sums = optionSummary(inv_id);
    return { closing_school: A.name, students: A.enrol_total, walk_limit_km: limit, options: sums.map(x => {
      const r = routeInfo(A.school_id, x.school.school_id), seats = Math.max(0, capOf(x.school) - x.school.enrol_total);
      const tb = terrainRow(x.school.school_id), ta = terrainRow(A.school_id), terrain = [...terrainFeatures(A.school_id), ...terrainFeatures(x.school.school_id)].map(f => f.name), lift = tb && ta ? tb.elev_m - ta.elev_m : null;
      const cn = q('SELECT sum(sup) s, sum(opp) o, sum(n) n FROM concerns WHERE case_id = ?', [trackId(inv_id, x.school.school_id)])[0] || {}, own = terrainRisk(tb);
      return { support: cn.s || 0, oppose: cn.o || 0, messages: cn.n || 0, terrain_at_school: own, terrain_risk_points: own, terrain, elev_diff_m: lift, school_id: x.school.school_id, name: x.school.name, walk_km: r.walk_km, walk_min: r.walk_min, estimated: r.est, seats_available: seats, students: A.enrol_total, enough_seats: seats >= A.enrol_total,
        investigated: x.investigated, questions: x.questions, answered: x.answered, confirmed_concerns: x.confirmed, concerns_total: x.issues, interventions_selected: x.selected.length, yearly_cost: x.yearly, first_year_total: x.yearly + x.oneTime };
    }) };
  });
/* Weights of the ranking score. Each criterion scores 0 to 100 and the officer can see every part. */
const WEIGHTS = { walk: 25, concerns: 25, cost: 20, community: 15, terrain: 15 }, LABEL = { walk: 'distance from the closing school', concerns: 'confirmed concerns', cost: 'first-year cost', community: 'community support', terrain: 'terrain at the receiving school' };
defineTool('suggest_option', 'Rank the candidate schools that have enough seats by a weighted score (distance 25, confirmed concerns 25, first-year cost 20, community support 15, terrain at the receiving school 15) and suggest one, or keeping and repairing the closing school when no option is workable. A suggestion only; the officer decides.',
  { comparison: { type: 'object', description: 'Output of compare_options' } }, ['comparison'],
  async ({ comparison: C }) => {
    const ok = C.options.filter(o => o.enough_seats), costs = ok.map(o => o.first_year_total), lo = Math.min(...costs), hi = Math.max(...costs);
    const clamp = n => Math.max(0, Math.min(100, Math.round(n)));
    const scores = {};
    ok.forEach(o => {
      const supportShare = o.messages ? (o.support - o.oppose) / o.messages : 0, potential = Math.max(0, (o.concerns_total || 0) - o.confirmed_concerns);
      const pts = { walk: clamp(o.walk_km <= C.walk_limit_km ? 100 : 100 - 35 * (o.walk_km - C.walk_limit_km)), concerns: clamp(100 - 35 * o.confirmed_concerns - 8 * potential), cost: hi === lo ? 100 : clamp(100 * (hi - o.first_year_total) / (hi - lo)),
        community: clamp(50 + 50 * supportShare), terrain: clamp(100 - o.terrain_at_school - (o.elev_diff_m != null && o.elev_diff_m >= 250 ? 15 : 0)) };
      const total = Math.round(Object.entries(WEIGHTS).reduce((a, [k, w]) => a + pts[k] * w / 100, 0));
      scores[o.school_id] = { total, parts: Object.fromEntries(Object.entries(pts).map(([k, v]) => [k, { pts: v, weight: WEIGHTS[k] }])) };
    });
    const ranked = ok.slice().sort((a, b) => scores[b.school_id].total - scores[a.school_id].total || a.school_id.localeCompare(b.school_id));
    const allBad = ok.length > 0 && ok.every(o => o.walk_km > C.walk_limit_km && o.confirmed_concerns >= 2);   // threshold 2 is reported in the output
    const keep = !ok.length || allBad, best = ranked[0] || null, next = ranked[1] || null;
    let edge = null;   // what put the best school ahead of the runner-up
    if (best && next) { const d = Object.keys(WEIGHTS).map(k => [k, (scores[best.school_id].parts[k].pts - scores[next.school_id].parts[k].pts) * WEIGHTS[k] / 100]).sort((a, b) => b[1] - a[1])[0]; edge = { over: next.name, over_score: scores[next.school_id].total, factor: LABEL[d[0]], factor_points: Math.round(d[1]) }; }
    // plain reasons: what the best school does best, and where the runner-up falls short
    const gain = (a, b) => Object.keys(WEIGHTS).map(k => [k, (scores[a.school_id].parts[k].pts - scores[b.school_id].parts[k].pts) * WEIGHTS[k] / 100]);
    const strengths = best && next ? gain(best, next).filter(x => x[1] > 0).sort((a, b) => b[1] - a[1]).slice(0, 2).map(x => x[0]) : best ? ['walk'] : [];
    const weaknesses = best && next ? gain(best, next).filter(x => x[1] > 0).sort((a, b) => b[1] - a[1]).slice(0, 1).map(x => x[0]) : [];
    return { concern_threshold: 2, weights: WEIGHTS, scores, edge, strengths, weaknesses, runner_up: next ? { school_id: next.school_id, name: next.name, walk_min: next.walk_min, walk_km: next.walk_km, first_year_total: next.first_year_total, confirmed_concerns: next.confirmed_concerns } : null, suggested: keep ? 'keep' : best.school_id, suggested_name: keep ? 'Keep and repair the closing school' : best.name, best, ranking: ranked.map(o => o.school_id), keep_reason: !ok.length ? 'no_seats' : allBad ? 'all_over_limit_with_confirmed_concerns' : null,
      unanswered: C.options.filter(o => o.questions && o.answered < o.questions).map(o => ({ name: o.name, unanswered: o.questions - o.answered })), not_investigated: C.options.filter(o => !o.investigated).map(o => o.name) };
  });

export const toolNames = Object.keys(tools);
