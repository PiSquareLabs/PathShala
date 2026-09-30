/* Every agent tool is an async (input) => output over plain JSON, running on sql.js in the browser.
   The same functions serve the simulated agents now and Gemini function calling later (`toolSchemas`,
   Gemini function-declaration format). Tools never write to the database: the case repository does. */
import { SCHOOL_WINDOWS, nearby, routeHazards, walkProfile } from '../case/analysis.js';
import { draftSentences } from '../case/draft.js';
import { q, q1 } from '../db/sqlite.js';
import { retrieve } from '../retrieval/bm25.js';
import { P, facts, inr, linkOf, school } from '../ui/helpers.js';

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
  async ({ school_id }) => ({ school: school(school_id) || null, facts: facts(school_id), habitations: q('SELECT * FROM habitations WHERE school_id = ?', [school_id]) }));

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
    if (!lk) return [];
    return routeHazards(lk, route, buffer_m, layers && layers.length ? layers : undefined).map(f => ({ ...f, source_url: f.source_url ?? f.url ?? null }));
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

export const toolNames = Object.keys(tools);
