/* The three research agents. Each is a fixed rule set that picks the next step (simulated mode) plus the wording of its findings;
   the loop (../loop.js) runs them, and Gemini may choose steps and wording instead. Facts come only from tools. */
import { SCHOOL_WINDOWS } from '../../case/analysis.js';
import { WEB_LABEL } from '../rag.js';

const fmt = n => Number(n).toLocaleString('en-IN');
const evOf = (state, tool) => state.evidence.find(e => state.steps.find(s => s.seq === e.step)?.tool === tool)?.eid;
const evAll = (state, tool) => state.evidence.filter(e => state.steps.find(s => s.seq === e.step)?.tool === tool).map(e => e.eid);
const top = out => (out?.passages || [])[0];
const mk = (prefix) => state => prefix + (state.evidence.length + 1);
const noSource = 'No source found';

/* ---------------- Transport Planner ---------------- */
export const transportPlanner = {
  id: 'transportPlanner', title: 'Transport Planner', screen: 'Evidence',
  goal: 'Plan how the children of the closing school could travel to the receiving school: habitations and children, road route, bus timetable against school hours, pickup stops, transport policy and cost.',
  tools: ['habitations_and_children', 'route_calc', 'route_estimate', 'transport_lookup', 'web_search', 'pickup_stops', 'rag_search', 'cost_calc'],
  eid: mk('TP'),
  brief: st => ({ case_id: st.cid, closing_school: { id: st.ctx.A.school_id, name: st.ctx.A.name }, receiving_school: { id: st.ctx.B.school_id, name: st.ctx.B.name }, school_windows: SCHOOL_WINDOWS }),
  plan: () => ['Find the habitations and children', 'Get the road route', 'Compare the bus timetable with school hours', 'Search public reports for a bus route if the timetable is missing', 'Propose pickup stops', 'Find the transport policy', 'Work out the cost'],
  required(st) { const f = st.facts; return [!f.hab && 'hab', !f.route && 'route', !f.timetable && 'timetable', !f.stops && 'stops', !f.policy && 'policy', !f.cost && 'cost'].filter(Boolean); },
  next(st) {
    const { A, B } = st.ctx, cid = st.cid, f = st.facts;
    if (!f.hab) return { tool: 'habitations_and_children', args: { school_id: A.school_id, ...(st.ctx.students ? { students: st.ctx.students } : {}) }, reason: 'Who needs transport: the habitations served and the children on the roll' };
    if (!f.hab.habitation_count) return { unavailable: 'no habitations are recorded for the closing school', question: { text: `Which habitations do the children of ${A.name} come from?`, gap: 'Habitations served' } };
    if (!f.route) return { tool: 'route_calc', args: { from_id: A.school_id, to_id: B.school_id, mode: 'road' }, reason: 'Road route to the receiving school' };
    if (f.route.available === false && !f.est) return { tool: 'route_estimate', args: { from_id: A.school_id, to_id: B.school_id }, reason: 'The road route was not surveyed: use a labelled straight-line estimate' };
    if (!f.timetable) return { tool: 'transport_lookup', args: { habitation_ids: f.hab.habitations.map(h => h.hab_id), windows: SCHOOL_WINDOWS }, reason: 'Compare the bus timetable with school arrival and departure times' };
    if (f.timetable.available === false && !f.web) return { tool: 'web_search', args: { query: `bus route ${A.block} ${B.name} school timings`, case_id: cid }, reason: 'No timetable is connected: look for a public report of a bus route' };
    if (!f.stops) return { tool: 'pickup_stops', args: { school_id: A.school_id }, reason: 'Propose pickup stops for each habitation' };
    if (!f.policy) return { tool: 'rag_search', args: { collections: ['policy'], query: 'transport escort facility distance terrain habitation children', case_id: cid, k: 5 }, reason: 'Find the transport policy that applies' };
    if (!f.cost) return { tool: 'cost_calc', args: { intervention: 'TR', inputs: { kids: f.hab.children, kids_source: f.hab.children_source, road_km: (f.route.available ? f.route.km : f.est?.road_km) } }, reason: 'Cost from the cost calculator, never from the model' };
    return { stop: true, reason: 'Route plan, cost and policy are in place' };
  },
  record(st, step, d) {
    const { B } = st.ctx, o = step.output, f = st.facts;
    switch (step.tool) {
      case 'habitations_and_children': f.hab = o; return [{ label: `${o.children} children on the roll, from ${o.habitation_count} habitations`, source: `${o.children_source}; habitation records`, status: o.children_source === 'Field count' ? 'verified' : 'calculated' }];
      case 'route_calc': f.route = o; return [o.available ? { label: `Road route ${o.km} km, about ${o.minutes} min by vehicle`, source: 'Road link (Google Routes API)', status: 'calculated' } : { label: 'Road route not surveyed: Data unavailable', source: 'Links table', status: 'needs verification' }];
      case 'route_estimate': f.est = o; return [{ label: `Estimated road distance about ${o.road_km} km (straight line ${o.straight_km} km, times 1.4)`, source: 'PathShala estimate, not a survey', status: 'needs verification' }];
      case 'transport_lookup': f.timetable = o; return [{ label: 'Bus timetable against school hours: Data unavailable', source: 'No timetable source is connected', status: 'needs verification' }];
      case 'web_search': f.web = o; { const p = top(o); return [p ? { label: `Public report found: ${p.title}`, source: `${WEB_LABEL}: ${p.url}`, status: 'reported', ref: p.id } : { label: `${noSource} for a bus route to ${B.name}`, source: 'Public reports searched', status: 'needs verification' }]; }
      case 'pickup_stops': f.stops = o; return [{ label: `${o.stop_count} pickup stops; ${o.habitations_on_foot} habitations walk to the nearest road`, source: 'Habitation records and coordinates', status: 'calculated' }];
      case 'rag_search': f.policy = o; { const p = top(o); return [p ? { label: `Policy: ${p.title} (${p.wording})`, source: p.source, status: p.wording === 'exact wording' ? 'verified' : 'reported', ref: p.id } : { label: `${noSource} for the transport policy`, source: 'Policy collection searched', status: 'needs verification' }]; }
      case 'cost_calc': f.cost = o; return [{ label: `Estimated cost ${fmt(o.cost_inr)} ${o.cost_type}: ${o.formula}`, source: 'Cost calculator (Samagra Shiksha norm, rule R6)', status: 'calculated' }];
      default: return [];
    }
  },
  summary(st, step) {
    const o = step.output;
    return ({ habitations_and_children: () => `${o.children} children, ${o.habitation_count} habitations`, route_calc: () => (o.available ? `${o.km} km, ${o.minutes} min` : 'Data unavailable'), route_estimate: () => `about ${o.road_km} km (estimate)`, transport_lookup: () => 'Data unavailable',
      web_search: () => (o.none ? noSource : `${o.passages.length} report(s), ${WEB_LABEL}`), pickup_stops: () => `${o.stop_count} stops`, rag_search: () => (o.none ? noSource : `${o.passages.length} passages, best ${o.passages[0].id} (${o.passages[0].score})`), cost_calc: () => `${fmt(o.cost_inr)} ${o.cost_type}` })[step.tool]?.() || '';
  },
  check(st, step) {
    if (step.tool === 'transport_lookup') return 'Checked: no timetable, so it stays "needs verification" and becomes a field question';
    if (step.tool === 'web_search') return step.output.none ? 'Checked: nothing found, so no bus route is assumed' : 'Checked: labelled as a web source; evidence status is unchanged';
    if (step.tool === 'rag_search') return step.output.none ? 'Checked: no policy passage matched' : 'Checked: only these passages may be cited';
    if (step.tool === 'cost_calc') return 'Checked: cost comes from the calculator';
    return 'Checked: values come from the tool';
  },
  answered: st => transportPlanner.required(st).length === 0,
  finish(st) {
    const { A, B } = st.ctx, f = st.facts;
    if (!f.cost) { const u = st.evidence.at(-1); return { route_plan: null, cost: null, policy: null, web: [], open_questions: st.questions, sentences: [{ text: `No habitations are recorded for ${A.name}, so no transport plan can be made; this is marked Data unavailable.`, refs: [u.eid] }] }; }
    const e = t => evOf(st, t), km = f.route?.available ? f.route.km : f.est?.road_km, min = f.route?.available ? f.route.minutes : null, p = top(f.policy);
    const questions = [];
    if (f.timetable?.available === false) questions.push({ text: `Is there a bus or shared vehicle from the habitations of ${A.name} to ${B.name} at school arrival and departure times?`, gap: 'Bus timetable against school hours' });
    if (f.stops?.habitations_on_foot) questions.push({ text: `Confirm the pickup stops with the gram panchayat, including the walk to the road for ${f.stops.habitations_on_foot} habitations.`, gap: 'Pickup stops' });
    if (f.route?.available === false) questions.push({ text: `Survey the road route from ${A.name} to ${B.name}; only a straight-line estimate exists.`, gap: 'Road route' });
    const sentences = [
      { text: `${f.hab.children} children from ${f.hab.habitation_count} habitations would travel about ${km} km by road to ${B.name}${min ? `, about ${min} minutes by vehicle` : ' (an estimate; the route was not surveyed)'}.`, refs: [e('habitations_and_children'), e('route_calc'), e('route_estimate')].filter(Boolean) },
      { text: f.timetable?.available === false ? `No bus timetable is available for school hours, so this is marked Data unavailable and needs a field check${f.web?.none ? `; ${noSource} in public reports` : ''}.` : 'A timetable is available.', refs: [e('transport_lookup'), e('web_search')].filter(Boolean) },
      { text: `${f.stops.stop_count} pickup stops are proposed; ${f.stops.habitations_on_foot} habitations have no road connection and would walk to the nearest road.`, refs: [e('pickup_stops')] },
      { text: p ? `The most relevant policy passage found is ${p.title} (${p.wording}).` : `${noSource} for the transport policy.`, refs: p ? [p.id] : [e('rag_search')] },
      { text: `Estimated cost is ${fmt(f.cost.cost_inr)} rupees ${f.cost.cost_type} (${f.cost.formula}).`, refs: [e('cost_calc')] },
    ];
    return { route_plan: { children: f.hab.children, habitations: f.hab.habitation_count, road_km: km, road_min: min, estimated: f.route?.available === false, stops: f.stops.stops }, cost: { cost_inr: f.cost.cost_inr, cost_type: f.cost.cost_type, formula: f.cost.formula },
      policy: p ? { id: p.id, section: p.title, wording: p.wording, url: p.url } : null, web: (f.web?.passages || []).map(x => ({ id: x.id, title: x.title, label: WEB_LABEL })), open_questions: questions, sentences };
  },
};

/* ---------------- Feedback Checker ---------------- */
const KIND_QUESTION = {
  transport: (c, A, B) => ({ text: `Is there a bus or shared vehicle from ${c.place || 'the habitations'} to ${B.name} at school times, and what does it cost a family?`, gap: 'Bus timetable and fares' }),
  road: c => ({ text: `Can a vehicle reach ${c.place || 'the village'} on the link road in all seasons?`, gap: 'Road access' }),
  hazard: c => ({ text: `Is the walking route passable in heavy rain and in winter? (${c.text})`, gap: 'Seasonal access' }),
  safety: c => ({ text: `Is the path safe for young children and girls walking in a group? (${c.text})`, gap: 'Safety on the route' }),
  social: () => ({ text: 'Was the gram panchayat or school management committee consulted about the proposed merger, and what did they say?', gap: 'Consultation' }),
  staff: c => ({ text: `Check on the visit: ${c.text}`, gap: 'Teaching staff' }),
  building: c => ({ text: `Inspect the building: ${c.text}`, gap: 'Building condition' }),
  other: c => ({ text: `Check on the visit: ${c.text}`, gap: 'Unchecked claim' }),
};
export const feedbackChecker = {
  id: 'feedbackChecker', title: 'Feedback Checker', screen: 'Feedback',
  goal: 'Turn citizen messages into claims (place, time, what is said) and check each against the timetable, attendance by month, map hazards, field observations and school records, then search public reports. Mark each claim supported, contradicted or unchecked.',
  tools: ['rag_search', 'extract_claims', 'transport_lookup', 'attendance_by_month', 'gis_overlay', 'field_observations', 'school_profile', 'web_search', 'check_claims'],
  eid: mk('FC'),
  brief: st => ({ case_id: st.cid, closing_school: { id: st.ctx.A.school_id, name: st.ctx.A.name }, receiving_school: { id: st.ctx.B.school_id, name: st.ctx.B.name } }),
  plan: () => ['Retrieve the citizen feedback', 'Extract claims: place, time, what is said', 'Check the timetable, attendance and map hazards', 'Read field observations and school records', 'Search public reports', 'Mark each claim supported, contradicted or unchecked'],
  required(st) { const f = st.facts; return [!f.claims && 'claims', !f.timetable && 'timetable', !f.check && 'check'].filter(Boolean); },
  next(st) {
    const { A, B } = st.ctx, cid = st.cid, f = st.facts;
    if (!f.retrieved) return { tool: 'rag_search', args: { collections: ['feedback'], query: 'bus transport road river bridge rain path building school children', case_id: cid, k: 5 }, reason: 'Retrieve the citizen messages about these schools' };
    if (!f.claims) return { tool: 'extract_claims', args: { case_id: cid }, reason: 'Turn the messages into distinct claims with place and time' };
    if (!f.timetable) return { tool: 'transport_lookup', args: { windows: SCHOOL_WINDOWS }, reason: 'Check bus claims against the timetable' };
    if (!f.attendance) return { tool: 'attendance_by_month', args: { school_id: A.school_id }, reason: 'Check claims about children staying away against attendance by month' };
    if (!f.hazards) return { tool: 'gis_overlay', args: { from_id: A.school_id, to_id: B.school_id, route: 'walk' }, reason: 'Check route claims against mapped bridges, steep paths and landslide zones' };
    if (!f.observations) return { tool: 'field_observations', args: { school_id: A.school_id }, reason: 'Read the government field observations' };
    if (!f.profileA) return { tool: 'school_profile', args: { school_id: A.school_id }, reason: 'School record of the closing school' };
    if (!f.profileB) return { tool: 'school_profile', args: { school_id: B.school_id }, reason: 'School record of the receiving school' };
    if (!f.web) return { tool: 'web_search', args: { query: `${A.name} ${B.name} bridge river school building unsafe`, case_id: cid }, reason: 'Search public reports (they never change a claim status by themselves)' };
    if (!f.check) return { tool: 'check_claims', args: { case_id: cid, claims: f.claims.claims, facts: { timetable: f.timetable, attendance: f.attendance, hazards: f.hazards, observations: f.observations, profileA: f.profileA, profileB: f.profileB, web: f.web } }, reason: 'Judge every claim against the facts gathered' };
    return { stop: true, reason: 'Every claim has a status' };
  },
  record(st, step) {
    const { A } = st.ctx, o = step.output, f = st.facts;
    switch (step.tool) {
      case 'rag_search': f.retrieved = o; return [{ label: o.none ? `${noSource} in the citizen feedback` : `Retrieved ${o.passages.length} of the citizen messages (best ${o.passages[0].id})`, source: 'Citizen feedback (PathShala, synthesised)', status: o.none ? 'needs verification' : 'reported' }];
      case 'extract_claims': f.claims = o; return [{ label: `${o.claim_count} distinct claims in ${o.message_count} messages`, source: 'Citizen feedback (PathShala, synthesised)', status: 'calculated' }];
      case 'transport_lookup': f.timetable = o; return [{ label: 'Bus timetable: Data unavailable, bus claims cannot be checked', source: 'No timetable source is connected', status: 'needs verification' }];
      case 'attendance_by_month': f.attendance = o; return [o.available ? { label: `Attendance recorded for ${o.months.length} months`, source: 'Attendance records', status: 'calculated' } : { label: `Attendance by month for ${A.name}: Data unavailable`, source: 'Attendance records', status: 'needs verification' }];
      case 'gis_overlay': f.hazards = o; return [{ label: o.length ? `${o.length} mapped features on the walking route: ${o.map(x => x.name).join(', ')}` : 'No mapped hazards on the walking route', source: 'GIS layers (OpenStreetMap, JRC, GSI)', status: 'calculated' }];
      case 'field_observations': f.observations = o; return [{ label: `${o.length} government field observations for ${A.name}`, source: 'Field observations (The Tribune, PWD)', status: 'verified' }];
      case 'school_profile': if (!f.profileA) f.profileA = o; else f.profileB = o; return [{ label: `School record of ${o.school.name}`, source: 'UDISE+', status: 'calculated' }];
      case 'web_search': f.web = o; { const p = top(o); return [p ? { label: `Public report: ${p.title}`, source: `${WEB_LABEL}: ${p.url}`, status: 'reported', ref: p.id } : { label: `${noSource} in public reports`, source: 'Public reports searched', status: 'needs verification' }]; }
      case 'check_claims': f.check = o; return [{ label: `${o.supported} supported, ${o.contradicted} contradicted, ${o.unchecked} unchecked of ${o.checked_count} claims`, source: 'Checks against records, maps and observations', status: 'calculated' }];
      default: return [];
    }
  },
  summary(st, step) {
    const o = step.output;
    return ({ rag_search: () => (o.none ? noSource : `${o.passages.length} passages`), extract_claims: () => `${o.claim_count} claims`, transport_lookup: () => 'Data unavailable', attendance_by_month: () => (o.available ? `${o.months.length} months` : 'Data unavailable'), gis_overlay: () => `${o.length} features`, field_observations: () => `${o.length} observations`,
      school_profile: () => o.school?.name, web_search: () => (o.none ? noSource : `${o.passages.length} report(s), ${WEB_LABEL}`), check_claims: () => `${o.supported} supported · ${o.contradicted} contradicted · ${o.unchecked} unchecked` })[step.tool]?.() || '';
  },
  check(st, step) { return step.tool === 'check_claims' ? 'Checked: web reports alone never make a claim supported' : step.tool === 'web_search' ? 'Checked: labelled as a web source; evidence status is unchanged' : 'Checked: values come from the tool'; },
  answered: st => feedbackChecker.required(st).length === 0,
  finish(st) {
    const { A, B } = st.ctx, f = st.facts, c = f.check, e = t => evOf(st, t), claims = c.claims, first = s => claims.filter(x => x.status === s);
    const seen = new Set(), questions = [];
    first('unchecked').forEach(x => { const k = x.kind; if (seen.has(k) || questions.length >= 5) return; seen.add(k); questions.push({ ...KIND_QUESTION[k](x, A, B), claim_id: x.claim_id }); });
    const kinds = [...seen].join(', ');
    const sentences = [{ text: `Citizens made ${f.claims.claim_count} distinct claims in ${f.claims.message_count} messages about these schools. Supported by records, maps or observations: ${c.supported}. Contradicted: ${c.contradicted}. Could not be checked: ${c.unchecked}.`, refs: [e('extract_claims'), e('check_claims')] }];
    first('contradicted').slice(0, 2).forEach(x => sentences.push({ text: `Contradicted: "${x.text}" (${x.note}).`, refs: [e('check_claims')] }));
    first('supported').slice(0, 2).forEach(x => sentences.push({ text: `Supported: "${x.text}" (${x.note}).`, refs: [e('check_claims')] }));
    if (c.unchecked) sentences.push({ text: `${c.unchecked} claims need a field check; they concern ${kinds}.`, refs: [e('check_claims')] });
    const w = f.web?.passages || []; if (w.length) sentences.push({ text: `Public reports (${w.map(x => x.id).join(', ')}) cover some of these places; they are labelled "${WEB_LABEL}" and do not change any claim status.`, refs: w.map(x => x.id) });
    return { claims, counts: { supported: c.supported, contradicted: c.contradicted, unchecked: c.unchecked, total: c.checked_count }, open_questions: questions, web: w.map(x => ({ id: x.id, title: x.title, label: WEB_LABEL })), sentences };
  },
};

/* ---------------- AI suggestion (Report step) ---------------- */
export const suggestionAgent = {
  id: 'suggestion', title: 'AI suggestion', screen: 'Report',
  goal: 'Compare the candidate schools on walk time, free seats, confirmed concerns and cost, look at past cases and policy, and suggest one option (or keeping and repairing the closing school). A suggestion only; the officer decides.',
  tools: ['compare_options', 'rag_search', 'suggest_option'],
  eid: mk('SG'),
  brief: st => ({ investigation: st.cid, closing_school: st.ctx.A.name }),
  plan: () => ['Compare the candidate schools with tool numbers', 'Search past cases', 'Search policy', 'Apply the fixed ranking rule and suggest an option'],
  required(st) { const f = st.facts; return [!f.compare && 'compare', !f.suggest && 'suggest'].filter(Boolean); },
  next(st) {
    const f = st.facts;
    if (!f.compare) return { tool: 'compare_options', args: { inv_id: st.cid }, reason: 'Compare walk time, free seats, confirmed concerns and cost for every candidate' };
    if (!f.past) return { tool: 'rag_search', args: { collections: ['past'], query: 'walking distance river bridge unsafe route rain winter merger high court', places: ['Himachal Pradesh', 'India'], k: 5 }, reason: 'Look for past cases with a similar route problem' };
    if (!f.policy) return { tool: 'rag_search', args: { collections: ['policy'], query: 'walking distance neighbourhood school primary terrain landslide flood', places: ['Himachal Pradesh', 'India'], k: 5 }, reason: 'Find the policy on walking distance and difficult terrain', tag: 'policy' };
    if (!f.suggest) return { tool: 'suggest_option', args: { comparison: f.compare }, reason: 'Apply the fixed ranking rule to the compared numbers' };
    return { stop: true, reason: 'A suggestion, its reasons and open checks are ready' };
  },
  record(st, step) {
    const o = step.output, f = st.facts;
    switch (step.tool) {
      case 'compare_options': f.compare = o; return [{ label: `${o.options.length} candidate schools compared on walk time, seats, confirmed concerns and cost`, source: 'Case record and tools', status: 'calculated' }];
      case 'rag_search': { const p = top(o), key = f.past ? 'policy' : 'past'; f[key] = o; return [p ? { label: `${key === 'past' ? 'Past case' : 'Policy'}: ${p.title}`, source: p.source, status: p.wording === 'exact wording' ? 'verified' : 'reported', ref: p.id } : { label: `${noSource} in ${key === 'past' ? 'past cases' : 'policy'}`, source: 'Collection searched', status: 'needs verification' }]; }
      case 'suggest_option': f.suggest = o; return [{ label: `Suggested: ${o.suggested_name}`, source: 'Fixed ranking rule on tool numbers', status: 'calculated' }];
      default: return [];
    }
  },
  summary(st, step) { const o = step.output; return ({ compare_options: () => `${o.options.length} options`, rag_search: () => (o.none ? noSource : `${o.passages.length} passages, best ${o.passages[0].id}`), suggest_option: () => o.suggested_name })[step.tool]?.() || ''; },
  check(st, step) { return step.tool === 'suggest_option' ? 'Checked: a suggestion only, nothing is selected' : step.tool === 'rag_search' ? 'Checked: only these passages may be cited' : 'Checked: numbers come from the tool'; },
  answered: st => suggestionAgent.required(st).length === 0,
  finish(st) {
    const f = st.facts, C = f.compare, S = f.suggest, e = t => evOf(st, t), cmp = e('compare_options'), sg = e('suggest_option'), pp = top(f.past), pol = top(f.policy), b = S.best;
    const reasons = [];
    if (S.suggested === 'keep') {
      if (S.keep_reason === 'no_seats') reasons.push({ text: `No candidate school has enough free seats for ${C.students} students.`, refs: [cmp, sg] });
      else { const near = Math.min(...C.options.filter(o => o.enough_seats).map(o => o.walk_km)); reasons.push({ text: `Every candidate with enough seats is beyond the ${C.walk_limit_km} km walking limit (the nearest is about ${near} km) and has at least ${S.concern_threshold} confirmed concerns.`, refs: [cmp, sg] }); }
      reasons.push({ text: `Keeping and repairing ${C.closing_school} avoids moving ${C.students} students along those routes.`, refs: [cmp] });
    } else {
      reasons.push({ text: b.concerns_total ? `${b.name} has ${b.confirmed_concerns} confirmed concerns out of ${b.concerns_total}, the fewest among the options with enough seats.` : `No concerns have been assessed yet; ${b.name} ranks first among the options with enough seats on walking time and cost.`, refs: [cmp, sg] });
      reasons.push({ text: `The walk to ${b.name} is about ${b.walk_min} minutes (${b.walk_km} km) and it has ${b.seats_available} free seats for ${C.students} students.`, refs: [cmp] });
      reasons.push({ text: `First-year cost of the selected interventions is ${fmt(b.first_year_total)} rupees.`, refs: [cmp] });
    }
    const src = []; if (pp) src.push({ text: `Past case: ${pp.title}: ${pp.text.replace(pp.title + '. ', '')}`, refs: [pp.id] }); if (pol) src.push({ text: `Relevant policy: ${pol.title} (${pol.wording}).`, refs: [pol.id] });
    const would = [S.suggested === 'keep' ? { text: 'If a bus timetable and pickup stops are confirmed in the field, transport support could make a candidate school workable.', refs: [sg] } : { text: `If field checks confirm more concerns for ${b.name} than for the next option, the suggestion would change.`, refs: [sg] },
      { text: 'A different choice of interventions would change the cost comparison.', refs: [cmp] }];
    const outstanding = [...S.not_investigated.map(n => ({ text: `${n} has not been investigated yet.`, refs: [sg] })), ...S.unanswered.map(u => ({ text: `${u.name}: ${u.unanswered} field questions are unanswered.`, refs: [sg] }))];
    if (!outstanding.length) outstanding.push({ text: 'No outstanding checks were found in the case record.', refs: [sg] });
    return { suggested: S.suggested, suggested_name: S.suggested_name, reasons: [...reasons, ...src].slice(0, 4), would_change: would, outstanding, sentences: [...reasons, ...src.slice(0, 2), ...would, ...outstanding] };
  },
};
export const RESEARCH_AGENTS = { transportPlanner, feedbackChecker, suggestion: suggestionAgent };
