import { db, q, q1, run, save } from '../db/sqlite.js';
import { computeMerges } from './merges.js';
import { MONTHS, P, esc, haversine, inr, monthsText, place, route, school, short, state } from '../ui/helpers.js';
import { render } from '../ui/router.js';
import { toast } from '../ui/toast.js';

export const Q_OPTIONS = {
  vehicle: [['yes', 'Yes'], ['escort', 'Only with an escort'], ['no', 'No']],
  months: [['rain', 'Rainy season'], ['snow', 'Winter snow'], ['both', 'Both'], ['none', 'Never']],
  road: [['yes', 'Open all winter'], ['some', 'Closed some weeks'], ['no', 'Closed most of winter']],
  capacity: [['yes', 'Yes, space and staff'], ['teacher', 'Space, but need a teacher'], ['no', 'No, need rooms']],
  young: [['yes', 'Yes, keep them local'], ['no', 'No, send them too']],
  crossing: [['yes', 'Guard is there'], ['sign', 'Only signs'], ['none', 'Nothing']],
  girls: [['toilets', 'Separate toilets'], ['staff', 'Women teachers'], ['transport', 'Safe transport'], ['fine', 'Nothing more']],
  committee: [['reuse', 'Anganwadi or community use'], ['annexe', 'Annexe of the new school'], ['none', 'No view yet']],
  satisfaction: [['better', 'Better'], ['same', 'Same'], ['worse', 'Worse']],
  dropout: [['none', 'None'], ['few', 'A few'], ['many', 'Many']],
  walk: [['short', 'Under 20 minutes'], ['long', 'More than 20 minutes']],
  hazard: [['none', 'Nothing'], ['water', 'A stream'], ['landslide', 'Landslide spot'], ['road', 'Busy road']],
};
export const optLabel = (kind, v) => (Q_OPTIONS[kind] || []).find(o => o[0] === v)?.[1] || v;
export const HAZARD_ANSWER = {
  water: ['Stream on the way (reported by community)', 'Monsoon', '7,8', 'high'],
  landslide: ['Landslide spot on the way (reported by community)', 'Monsoon', '7,8,9', 'medium'],
  road: ['Busy road on the way (reported by community)', 'All year', '', 'high'],
};
export function analyse(gid, R, ctx = { lead: true, extraMoving: 0, extraTeachers: 0, senders: [gid] }) {
  const g = q1('SELECT * FROM merge_groups WHERE group_id = ?', [gid]);
  const s = school(g.sending_id), r = school(g.receiving_id);
  const rt = q1('SELECT * FROM routes WHERE group_id = ?', [gid]) || { straight_km: haversine(s, r), walk_km: haversine(s, r) * 1.5, walk_min: 0, climb_m: null, road_km: null, source: 'estimate' };
  const hz = q('SELECT * FROM hazards WHERE group_id = ?', [gid]);
  const A = {}; q('SELECT * FROM answers WHERE group_id = ?', [gid]).forEach(a => A[a.kind] = a);
  const fb = q('SELECT * FROM feedback WHERE group_id = ?', [gid]);
  const att = q('SELECT month, avg(pct) AS pct FROM attendance WHERE group_id = ? GROUP BY month ORDER BY month', [gid]);
  const prec = pat => q('SELECT * FROM precedents WHERE pattern = ?', [pat]).map(p => 'Precedent: ' + p.case_name + ' (' + p.year + ')');
  const budget = (item, d) => q1('SELECT amount_inr FROM budget WHERE item = ? AND district = ?', [item, d])?.amount_inr;
  const issues = {}; fb.forEach(f => (issues[f.issue] ||= []).push(f));
  const fbE = issue => issues[issue] ? ['fb:' + issues[issue].length + (issues[issue].length === 1 ? ' message on ' : ' messages on ') + issue.toLowerCase() + ' (' + issues[issue].filter(f => f.verification === 'verified').length + ' verified)'] : [];
  const ansE = kind => A[kind] ? ['ans:Answer: ' + optLabel(kind, A[kind].choice) + (A[kind].note ? ' — “' + A[kind].note + '”' : '')] : [];
  const ch = k => A[k]?.choice;

  const lvl = s.level_code;
  const terrain = hz.filter(h => ['water', 'snow', 'landslide', 'road', 'court'].includes(h.kind));
  const walkHaz = hz.filter(h => ['water', 'snow', 'landslide', 'court'].includes(h.kind) && h.severity !== 'low');
  const highTerrain = terrain.filter(h => h.severity === 'high');
  const seasonal = hz.filter(h => h.month_list && ['water', 'snow', 'landslide'].includes(h.kind));
  const roadHaz = hz.filter(h => h.kind === 'road');
  const limit = lvl === 'primary' ? R.walk_limit_primary_km : R.walk_limit_upper_km;
  let walk = rt.walk_km;
  if (ch('walk') === 'short') walk = Math.min(walk, limit * 0.9);
  if (ch('walk') === 'long') walk = Math.max(walk, limit * 1.3);
  const over = walk > limit;

  const checks = [], items = [], qs = [];
  const C = (rule_id, name, status, value, detail) => checks.push({ rule_id, name, status, value, detail });
  const I = o => items.push(Object.assign({ kind: 'condition', cost: 0, cost_type: 'none', funding: '', evidence: [] }, o));
  const Q = (kind, role, en, hi, why, critical) => qs.push({ kind, role, en, hi, why, critical: critical ? 1 : 0, options: Q_OPTIONS[kind] });

  // 1. merge criteria
  if (lvl === 'primary') {
    const ok = s.enrol_primary <= R.primary_merge_max, rok = r.enrol_primary > R.primary_merge_max;
    C('R1', 'Primary merge limit', ok && rok ? 'pass' : 'flag', `${s.enrol_primary} in Classes 1–5 here; ${r.enrol_primary} at ${r.name}`, ok && rok ? 'Meets the HP criteria.' : ok ? 'The receiving school is also below the limit.' : `Above the limit of ${R.primary_merge_max}; the order needs a written reason.`);
  } else if (lvl === 'middle') {
    const ok = s.enrol_total <= R.middle_merge_max;
    C('R3', 'Middle merge limit', ok ? 'pass' : 'flag', `${s.enrol_total} students (limit ${R.middle_merge_max})`, ok ? 'Meets the HP criteria.' : 'Above the limit; the order needs a written reason.');
  } else {
    C('—', 'Merge criteria', 'info', `${s.enrol_total} students`, 'HP enrolment criteria cover primary and middle schools only. This merge is a policy decision.');
  }
  // 2. radius
  const rOk = rt.straight_km <= R.merge_radius_km;
  C('R2', 'Merge radius', rOk ? 'pass' : 'flag', `${rt.straight_km.toFixed(2)} km straight line (limit ${R.merge_radius_km} km)`, rOk ? 'Within the radius.' : 'Outside the radius set by the state.');
  // 3. walk limit
  C(lvl === 'primary' ? 'R4' : 'R5', 'RTE walk limit', over ? 'owed' : 'pass',
    `${walk.toFixed(1)} km on foot${rt.walk_min ? ', about ' + rt.walk_min + ' min' : ''}${rt.climb_m ? ', ' + rt.climb_m + ' m climb' : ''} (limit ${limit} km)`,
    over ? 'Beyond the limit, so transport or an escort is owed (RTE Rule 6(4)).' : 'Within the walking limit.' + (ch('walk') ? ' Confirmed by the community.' : !['real', 'survey'].includes(rt.source) ? ' Route is ' + rt.source + '; check it on a field survey.' : rt.source === 'survey' ? ' Measured on a field survey.' : ''));
  // 4. terrain
  C('—', 'Terrain and route hazards', terrain.length ? 'flag' : 'pass', terrain.length ? terrain.map(h => h.label).join('; ') : 'None recorded', terrain.length ? 'Each hazard needs a matching condition in the plan.' : 'No hazards recorded yet.');
  // 5. transport
  const keepYoung = lvl === 'primary' && s.enrol_preprimary > 0 && (over || walkHaz.length > 0) && ch('young') !== 'no';
  const moving = lvl === 'primary' ? s.enrol_primary + (keepYoung ? 0 : s.enrol_preprimary) : s.enrol_total;
  const transportNeeded = over || walkHaz.length > 0;
  C('R6', 'Transport or escort', transportNeeded ? 'owed' : 'pass', transportNeeded ? `${moving} children × ${inr(R.transport_per_child)} a year` : 'Not needed', transportNeeded ? (over ? 'Walk is beyond the limit.' : 'Route is unsafe in some months.') : 'Route is within limits and has no walking hazards.');
  // 6. capacity
  const after = r.enrol_total + moving + ctx.extraMoving;
  const per = after / Math.max(1, r.classrooms);
  let rooms = ctx.lead ? Math.max(0, Math.ceil(after / R.max_per_classroom) - r.classrooms) : 0;
  if (ctx.lead && ch('capacity') === 'no') rooms = Math.max(rooms, 1);
  if (!ctx.lead) C('R7', 'Classroom space', 'info', `${after} students at ${r.name} in total`, 'Checked once for the whole merge, on the first school.');
  else C('R7', 'Classroom space', per > R.max_per_classroom || rooms > 0 ? 'flag' : 'pass', `${after} students in ${r.classrooms} rooms = ${per.toFixed(0)} per room (limit ${R.max_per_classroom})`, rooms > 0 ? `${rooms} more room${rooms > 1 ? 's' : ''} needed.` : 'Enough rooms.');
  // 7. teachers
  const ptrNo = after / Math.max(1, r.teachers), ptrWith = after / Math.max(1, r.teachers + s.teachers + ctx.extraTeachers);
  let moveT = ctx.lead && ptrNo > R.max_ptr ? Math.min(s.teachers + ctx.extraTeachers, Math.ceil(after / R.max_ptr) - r.teachers) : 0;
  if (ctx.lead && ch('capacity') === 'teacher') moveT = Math.max(moveT, 1);
  if (ctx.lead) C('R9', 'Pupils per teacher', ptrNo <= R.max_ptr && !moveT ? 'pass' : ptrWith <= R.max_ptr ? 'owed' : 'flag', `${ptrNo.toFixed(0)} per teacher at ${r.name}; ${ptrWith.toFixed(0)} if ${s.name} staff move (limit ${R.max_ptr})`, moveT ? `Move ${moveT} teacher${moveT > 1 ? 's' : ''} with the children.` : 'Enough teachers.');
  // 8. attendance
  let drop = 0, attNote = '';
  if (att.length) {
    const avg = a => a.reduce((x, y) => x + y.pct, 0) / a.length;
    if (g.status === 'Merged' && g.order_date) {
      const cut = g.order_date.slice(0, 7), pre = att.filter(a => a.month < cut), post = att.slice(-3);
      if (pre.length) { drop = avg(pre) - avg(post); attNote = `${avg(pre).toFixed(0)}% before the merge, ${avg(post).toFixed(0)}% in the last 3 months`; }
      C('R12', 'Attendance after merge', drop >= R.attendance_drop_pts ? 'flag' : 'pass', attNote, drop >= R.attendance_drop_pts ? `Down ${drop.toFixed(0)} points; alert at ${R.attendance_drop_pts}.` : 'No worrying drop.');
    } else {
      const low = att.filter(a => a.pct < 80).map(a => MONTHS[+a.month.slice(5)]);
      attNote = low.length ? 'Below 80% in ' + low.join(', ') : 'Steady';
      C('R12', 'Attendance pattern (before merge)', low.length ? 'flag' : 'info', attNote, low.length ? 'Dips line up with the unsafe months.' : 'No seasonal dips.');
    }
  }

  const tBal = budget('Transport balance', g.district), cBal = budget('Classroom balance', g.district);
  const routeE = [`Route: ${walk.toFixed(1)} km on foot${rt.climb_m ? ', ' + rt.climb_m + ' m climb' : ''}${rt.road_km ? ', ' + rt.road_km + ' km by road' : ''}`];

  /* ---- plan ---- */
  if (transportNeeded) {
    const n = moving, escort = ch('vehicle') === 'escort';
    I({ code: 'transport', title: escort ? `Escort for ${n} children` : `Vehicle or escort for ${n} children`,
      detail: `Daily pick-up from ${place(s)} to ${r.name} and back.` + (ch('vehicle') === 'yes' ? ' Parents have agreed to use it.' : escort ? ' Parents want an adult escort with the children.' : ''),
      cost: n * R.transport_per_child, cost_type: 'yearly',
      funding: `Samagra Shiksha transport and escort (RTE Rule 6(4))` + (tBal ? `. ${g.district} balance: ${inr(tBal)}` : ''),
      evidence: [...routeE, ...walkHaz.map(h => 'Hazard: ' + h.label), ...fbE('Transport'), ...fbE('Route safety'), ...ansE('vehicle'), ...prec('water').slice(0, 1)] });
  }
  if (seasonal.length && ch('months') !== 'none') {
    let ms = [...new Set(seasonal.flatMap(h => h.month_list.split(',').map(Number)))].sort((a, b) => a - b);
    if (ch('months') === 'rain') ms = [7, 8]; if (ch('months') === 'snow') ms = [1, 2, 12]; if (ch('months') === 'both') ms = [1, 2, 7, 8, 12];
    I({ code: 'seasonal', title: `Unsafe-month plan: ${monthsText(ms)}`,
      detail: `In these months the vehicle uses the road, never the footpath. If the road is shut, classes run in the ${s.name} building with a visiting teacher, so no child walks the unsafe path.`,
      evidence: [...seasonal.map(h => 'Hazard: ' + h.label + ' (' + h.months + ')'), ...(attNote && g.status !== 'Merged' ? ['Attendance: ' + attNote] : []), ...ansE('months')] });
  }
  if (ch('road') === 'some' || ch('road') === 'no') {
    I({ code: 'winterpoint', title: `Winter learning point at ${place(s)}`,
      detail: `For the weeks the road is closed, Classes 1–5 meet in the old ${s.name} building. One teacher from ${r.name} rotates there.`,
      funding: 'Existing staff and building', evidence: [...ansE('road'), ...hz.filter(h => h.kind === 'snow').map(h => 'Hazard: ' + h.label)] });
  }
  if (keepYoung) {
    I({ kind: 'step', code: 'young', title: `Keep ${s.enrol_preprimary} pre-primary children at the ${place(s)} anganwadi`,
      detail: 'The smallest children stay near home and join the receiving school in Class 1, with transport.',
      funding: s.anganwadi_on_site ? 'ICDS anganwadi, already on the school site' : 'ICDS anganwadi', evidence: [...fbE('Young children'), ...ansE('young')] });
  }
  if (moveT) {
    I({ code: 'teacher', title: `Move ${moveT} teacher${moveT > 1 ? 's' : ''} from ${ctx.senders.length > 1 ? 'the closing schools' : s.name} to ${r.name}`,
      detail: 'Redeploy the staff with the children so pupils per teacher stays within the limit.', funding: 'Existing salary; a redeployment order',
      evidence: [`Pupils per teacher: ${ptrNo.toFixed(0)} without the move`, ...fbE('Capacity'), ...ansE('capacity')] });
  }
  if (rooms > 0) {
    I({ code: 'rooms', title: `Add ${rooms} classroom${rooms > 1 ? 's' : ''} at ${r.name}`,
      detail: `${after} students in ${r.classrooms} rooms is ${per.toFixed(0)} per room. Until the rooms are built, use the ${s.name} building as an annexe.`,
      cost: rooms * R.classroom_cost, cost_type: 'one-time',
      funding: 'Samagra Shiksha civil works' + (cBal ? `. ${g.district} balance: ${inr(cBal)}` : ''),
      evidence: [...fbE('Capacity'), ...ansE('capacity'), ...prec('capacity').slice(0, 1)] });
  }
  if (roadHaz.length) {
    const has = ch('crossing') === 'yes';
    I({ code: 'warden', title: has ? 'Keep the guard at the highway crossing' : 'Crossing guard at the highway',
      detail: has ? 'A guard is already there. Add a zebra crossing and school signs.' : 'A home guard at the crossing from 8:30 to 9:30 and 2:30 to 3:30, plus a zebra crossing and signs.',
      cost: has ? 0 : R.warden_per_year, cost_type: has ? 'none' : 'yearly', funding: 'District police (home guards); PWD for signs',
      evidence: [...roadHaz.map(h => 'Hazard: ' + h.label), ...fbE('Route safety'), ...ansE('crossing'), ...prec('road').slice(0, 1)] });
  }
  const girlsNeed = issues["Girls' safety"] || (/girls/i.test(r.name) && /boys/i.test(s.name));
  if (girlsNeed && ch('girls') !== 'fine') {
    const d = { toilets: 'Separate girls’ toilets first', staff: 'A woman teacher as safety lead first', transport: 'Safe transport for girls first' }[ch('girls')] || 'Separate toilets, CCTV at the gate, a woman teacher as safety lead';
    I({ code: 'girls', title: "Girls' safety measures", detail: d + ', and a mothers’ group that meets each term.', cost: R.girls_safety_cost, cost_type: 'one-time',
      funding: 'Samagra Shiksha gender component', evidence: [...fbE("Girls' safety"), ...ansE('girls'), ...prec('girls').slice(0, 1)] });
  }
  if ((drop >= R.attendance_drop_pts) || ch('dropout') === 'few' || ch('dropout') === 'many') {
    I({ code: 'visits', title: 'Home visits for children who stopped coming', detail: (attNote ? 'Attendance: ' + attNote + '. ' : '') + 'Teachers and the committee visit each family within a month and track who returns.',
      funding: 'School management committee', evidence: [...ansE('dropout'), ...ansE('satisfaction')] });
  }
  if (ch('satisfaction') === 'worse') {
    I({ code: 'review', title: 'Parents’ review meeting', detail: 'Parents say schooling is worse. Hold a meeting, list the problems and bring them back to this plan.', evidence: [...ansE('satisfaction')] });
  }
  if (issues['Consultation'] || issues['School identity']) {
    const c = ch('committee');
    I({ kind: 'step', code: 'committee',
      title: c === 'reuse' ? `Hand the ${s.name} building to the community` : c === 'annexe' ? `Keep the ${s.name} building as an annexe` : 'Meet the school committee and panchayat',
      detail: c ? 'As agreed with the committee.' + (A.committee.note ? ' ' + A.committee.note : '') : 'Explain the plan and settle what happens to the old building before the order is final.',
      evidence: [...fbE('Consultation'), ...fbE('School identity'), ...ansE('committee')] });
  }
  if (g.status === 'Proposed' && seasonal.length) {
    I({ kind: 'step', code: 'april', title: 'Start the merge in April', detail: 'Begin with the new session, when paths are clear, with transport running from day one.', evidence: seasonal.map(h => 'Hazard: ' + h.label) });
  }
  if (ch('vehicle') === 'no') {
    I({ kind: 'fallback', code: 'branch', title: `Keep Classes 1–2 at ${s.name} as a branch`, detail: 'Parents will not use the vehicle, so the youngest stay local. Classes 3–5 move with an escort.', funding: 'Existing staff', evidence: ansE('vehicle') });
  }
  const conds = items.filter(i => i.kind === 'condition' || i.kind === 'fallback');
  if (!conds.length) {
    I({ kind: 'step', code: 'proceed', title: 'Merge as planned', detail: 'All checks pass. Review attendance and feedback after three months.', evidence: [...ansE('satisfaction'), ...fbE('Quality')] });
  }
  if (hz.some(h => h.kind === 'court')) I({ kind: 'rejected', code: 'x-court', title: 'Merge as ordered, children walk', detail: 'Rejected: the High Court found this route unsafe for small children.' });
  else if (over) I({ kind: 'rejected', code: 'x-walk', title: 'Children walk the route', detail: `Rejected: ${walk.toFixed(1)} km is above the RTE limit of ${limit} km.` });
  if (rooms > 0) I({ kind: 'rejected', code: 'x-rooms', title: 'Merge without new rooms', detail: `Rejected: ${per.toFixed(0)} students per room.` });

  /* ---- questions ---- */
  const v = place(s);
  if (transportNeeded) Q('vehicle', `Parents in ${v}`, `If a vehicle or escort takes your child to ${r.name}, will you send them?`, `अगर गाड़ी या कोई साथी आपके बच्चे को ${r.name} ले जाए, तो क्या आप भेजेंगे?`, 'Transport is the main condition. If parents say no, the plan changes.', true);
  if (seasonal.length) Q('months', `Parents and pradhan, ${v}`, `In which months is the path to ${r.name} unsafe?`, `किन महीनों में ${r.name} का रास्ता खतरनाक होता है?`, 'Sets the months for the unsafe-month plan.', false);
  if (transportNeeded && hz.some(h => h.kind === 'snow')) Q('road', `Pradhan or local driver`, `Is the road to ${r.name} open for a vehicle all winter?`, `क्या सर्दियों में ${r.name} तक की सड़क गाड़ी के लिए खुली रहती है?`, 'If the road closes, the vehicle cannot run and children need a local option.', false);
  if (ctx.lead) Q('capacity', `Head teacher, ${r.name}`, `Can ${r.name} seat ${moving + ctx.extraMoving} more children?`, `क्या ${r.name} में ${moving + ctx.extraMoving} और बच्चों के बैठने की जगह है?`, `The data says ${per.toFixed(0)} per room after the merge.`, true);
  if (lvl === 'primary' && s.enrol_preprimary > 0) Q('young', `Anganwadi worker, ${v}`, `Should the ${s.enrol_preprimary} pre-primary children stay at the anganwadi in ${v}?`, `क्या ${s.enrol_preprimary} छोटे बच्चे ${v} की आंगनवाड़ी में ही रहें?`, 'Small children should not make a long or unsafe trip.', false);
  if (roadHaz.length) Q('crossing', `Parents and panchayat, ${v}`, 'Is there a guard or zebra crossing where children cross the highway?', 'जहाँ बच्चे हाईवे पार करते हैं, क्या वहाँ कोई गार्ड या ज़ेब्रा क्रॉसिंग है?', 'Decides whether a crossing guard must be paid for.', true);
  if (girlsNeed) Q('girls', 'Mothers of girl students', `What would make your daughters feel safe at ${r.name}?`, `आपकी बेटियाँ ${r.name} में सुरक्षित महसूस करें, इसके लिए सबसे ज़रूरी क्या है?`, "Sets the first girls' safety measure.", false);
  if (issues['Consultation'] || issues['School identity']) Q('committee', `School committee and panchayat, ${v}`, `What should happen to the ${s.name} building?`, `${s.name} की इमारत का क्या उपयोग हो?`, 'People said they were not asked. This gives them the decision on the building.', false);
  if (g.status === 'Merged') {
    Q('satisfaction', `Parents of moved children`, 'Since the merge, is schooling better, the same or worse?', 'विलय के बाद पढ़ाई बेहतर है, पहले जैसी है या खराब?', 'Checks whether the merge is working for families.', false);
    Q('dropout', `Head teacher, ${r.name}`, 'How many of the moved children have stopped coming?', 'जो बच्चे आए, उनमें से कितनों ने आना बंद कर दिया?', 'Drop-outs are the clearest sign a merge is failing.', true);
  }
  if (!['real', 'survey'].includes(rt.source) && g.status !== 'Merged') Q('walk', `Parents in ${v}`, `How long does a Class 1 child take to walk to ${r.name}?`, `कक्षा 1 के बच्चे को ${r.name} तक पैदल पहुँचने में कितना समय लगता है?`, `The route is ${rt.source === 'estimate' ? 'estimated from a straight line' : 'not measured on the ground'}.`, rt.source === 'estimate');
  if (g.status === 'Proposed') Q('hazard', `Parents and pradhan, ${v}`, `Is there a stream, landslide spot or busy road on the way to ${r.name}?`, `${r.name} के रास्ते में कोई नाला, भूस्खलन वाली जगह या व्यस्त सड़क है?`, 'Hazards not on any map are only known locally.', true);

  /* ---- verdict ---- */
  const openCrit = qs.filter(x => x.critical && !A[x.kind]).length, open = qs.filter(x => !A[x.kind]).length;
  const nCond = items.filter(i => i.kind === 'condition' || i.kind === 'fallback').length;
  const oneTime = items.filter(i => i.cost_type === 'one-time' && i.kind !== 'rejected').reduce((a, i) => a + i.cost, 0);
  const yearly = items.filter(i => i.cost_type === 'yearly' && i.kind !== 'rejected').reduce((a, i) => a + i.cost, 0);
  let verdict, health, reason;
  const confirmed = ['yes', 'escort'].includes(ch('vehicle'));
  if (ch('dropout') === 'many') { verdict = 'Hold and re-plan'; health = 'red'; reason = 'Many moved children have stopped coming. Fix the causes before going further.'; }
  else if (ch('vehicle') === 'no') { verdict = 'Hold and re-plan'; health = 'red'; reason = 'Parents will not use the transport, so the route problem is not solved. A fallback is in the plan.'; }
  else if (items.some(i => i.code === 'rooms')) { verdict = 'Merge after adding capacity'; health = 'amber'; reason = `The receiving school is short of rooms. ${nCond} condition${nCond > 1 ? 's' : ''} in the plan.`; }
  else if (nCond) {
    verdict = 'Merge with conditions';
    health = highTerrain.length && !confirmed && !(roadHaz.length && ch('crossing')) ? 'red' : 'amber';
    reason = `${nCond} condition${nCond > 1 ? 's' : ''} must be in place first.` + (health === 'red' ? ' Serious route hazards and parents have not confirmed the plan yet.' : '');
  } else { verdict = 'Merge as planned'; health = 'green'; reason = 'All checks pass. No conditions needed.'; }
  if (g.status === 'Proposed' && openCrit) { verdict = 'Provisional: ' + verdict; health = 'pending'; reason += ` ${openCrit} key question${openCrit > 1 ? 's' : ''} still open.`; }

  /* ---- write ---- */
  ['checks', 'plan_items', 'questions', 'analysis'].forEach(t => run(`DELETE FROM ${t} WHERE group_id = ?`, [gid]));
  checks.forEach((c, i) => run('INSERT INTO checks VALUES (?,?,?,?,?,?,?)', [gid, i + 1, c.rule_id, c.name, c.status, c.value, c.detail]));
  items.forEach((it, i) => run('INSERT INTO plan_items VALUES (?,?,?,?,?,?,?,?,?,?)', [gid, i + 1, it.kind, it.code, it.title, it.detail, Math.round(it.cost), it.cost_type, it.funding, JSON.stringify(it.evidence)]));
  qs.forEach(x => run('INSERT INTO questions VALUES (?,?,?,?,?,?,?,?)', [gid, x.kind, x.role, x.en, x.hi, x.why, JSON.stringify(x.options), x.critical]));
  run('INSERT INTO analysis VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)', [gid, verdict, health, reason, oneTime, yearly, nCond, open, new Date().toISOString(), moving, after, Math.round(walk * 10) / 10, keepYoung ? s.enrol_preprimary : 0]);
}
export function analyseAll() {
  const R = P();
  db.exec('BEGIN');
  try {
    run("UPDATE merge_groups SET merge_id = 'M' || substr(group_id, 2) WHERE merge_id IS NULL OR merge_id = ''");
    const gs = q('SELECT group_id, merge_id, sending_id FROM merge_groups ORDER BY group_id');
    gs.forEach(g => analyse(g.group_id, R));
    const byM = {}; gs.forEach(g => (byM[g.merge_id] ||= []).push(g));
    const mv = {}; q('SELECT group_id, moving FROM analysis').forEach(a => mv[a.group_id] = a.moving);
    Object.values(byM).filter(l => l.length > 1).forEach(list => list.forEach((g, i) => {
      const others = list.filter(o => o !== g);
      analyse(g.group_id, R, { lead: i === 0, extraMoving: others.reduce((a, o) => a + mv[o.group_id], 0), extraTeachers: others.reduce((a, o) => a + school(o.sending_id).teachers, 0), senders: list.map(o => o.group_id) });
    }));
    computeMerges(R);
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
}
export function snapshot() {
  const o = {};
  q('SELECT group_id, verdict, open_questions FROM analysis').forEach(a => o[a.group_id] = { verdict: a.verdict, open: a.open_questions, items: [], det: {} });
  q("SELECT group_id, title, detail, cost_inr FROM plan_items WHERE kind != 'rejected' ORDER BY seq").forEach(p => { if (o[p.group_id]) { o[p.group_id].items.push(p.title); o[p.group_id].det[p.title] = p.detail + '|' + p.cost_inr; } });
  return o;
}
export let newItems = new Set();
export function diff(a, b) {
  const lines = []; resetNewItems();
  Object.keys(b).forEach(g => {
    const x = a[g], y = b[g];
    if (!x) { lines.push(`${g}: new merge — ${y.verdict}`); return; }
    if (x.verdict !== y.verdict) lines.push(`${g}: ${x.verdict} → <b style="display:inline;font:inherit;font-weight:700">${esc(y.verdict)}</b>`);
    y.items.filter(t => !x.items.includes(t)).forEach(t => { lines.push(`${g}: + ${esc(t)}`); newItems.add(g + '|' + t); });
    x.items.filter(t => !y.items.includes(t)).forEach(t => lines.push(`${g}: − ${esc(t)}`));
    y.items.filter(t => x.items.includes(t) && x.det[t] !== y.det[t]).forEach(t => { lines.push(`${g}: updated · ${esc(t)}`); newItems.add(g + '|' + t); });
    if (x.open !== y.open) lines.push(`${g}: open questions ${x.open} → ${y.open}`);
  });
  return lines;
}
export function commit(title, fn) {
  const before = snapshot();
  fn();
  analyseAll(); save();
  const lines = diff(before, snapshot());
  toast(title, lines.length ? lines : ['No change to any plan.']);
  render();
}

export function resetNewItems() { newItems = new Set(); }
