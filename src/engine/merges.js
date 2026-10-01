import { q, q1, run } from '../db/sqlite.js';
import { school } from '../ui/helpers.js';

export const RANK = { red: 0, pending: 1, amber: 2, green: 3 };
export const ISSUE_ITEMS = {
  'Route safety': ['transport', 'seasonal', 'warden', 'winterpoint'], 'Transport': ['transport', 'warden', 'branch'],
  'Capacity': ['rooms', 'teacher'], "Girls' safety": ['girls'], 'Consultation': ['committee'], 'School identity': ['committee'],
  'Young children': ['young'], 'Quality': ['review'], 'Board and cost': [], 'Enrolment': [], 'Other': [],
};
export const RECEIVER_ISSUES = ['Capacity', 'Quality', "Girls' safety", 'Board and cost'];
export const IMPL = ['not started', 'in progress', 'done'];
export const successLabel = v => v == null ? null : v >= 70 ? 'Working' : v >= 40 ? 'Partly working' : 'Failing';
export const successHealth = v => v == null ? 'pending' : v >= 70 ? 'green' : v >= 40 ? 'amber' : 'red';

/* Pure check of a possible sender → receiver pair, used by the planner and the sender pages. */
export function computeMerges(R) {
  ['merge_summary', 'problems', 'unknowns'].forEach(t => run(`DELETE FROM ${t}`));
  const gs = q(`SELECT g.*, a.* FROM merge_groups g JOIN analysis a USING (group_id) ORDER BY g.group_id`);
  const byM = {}; gs.forEach(g => (byM[g.merge_id] ||= []).push(g));
  Object.entries(byM).forEach(([mid, list]) => {
    const r = school(list[0].receiving_id);
    const worst = list.slice().sort((a, b) => RANK[a.health] - RANK[b.health])[0];
    const sum = k => list.reduce((a, g) => a + (g[k] || 0), 0);
    const status = list[0].status;
    let reason = worst.reason;
    if (list.length > 1) reason = list.map(g => `${school(g.sending_id).name}: ${g.verdict.replace('Provisional: ', '')}`).join(' · ') + '. ' + worst.reason;

    /* ---- success, for merges already done ---- */
    let success = null, parts = [];
    if (status === 'Merged') {
      const acc = { att: [], fb: [], sv: [], pol: [] };
      list.forEach(g => {
        const w = Math.max(1, g.moving);
        const att = q('SELECT month, avg(pct) AS pct FROM attendance WHERE group_id = ? GROUP BY month ORDER BY month', [g.group_id]);
        if (att.length && g.order_date) {
          const cut = g.order_date.slice(0, 7), pre = att.filter(a => a.month < cut), post = att.slice(-3);
          const avg = a => a.reduce((x, y) => x + y.pct, 0) / a.length;
          if (pre.length && post.length) { const drop = avg(pre) - avg(post); acc.att.push([drop <= 0 ? 100 : Math.max(0, 100 - drop * 8), w, `${avg(pre).toFixed(0)}% → ${avg(post).toFixed(0)}%`]); }
        }
        const fb = q('SELECT sentiment FROM feedback WHERE group_id = ? AND received >= ?', [g.group_id, g.order_date || '0']);
        const pos = fb.filter(f => f.sentiment === 'positive').length, neg = fb.filter(f => f.sentiment === 'negative').length;
        if (pos + neg) acc.fb.push([100 * pos / (pos + neg), w, `${pos} positive, ${neg} negative since the merge`]);
        const A = {}; q('SELECT kind, choice FROM answers WHERE group_id = ?', [g.group_id]).forEach(a => A[a.kind] = a.choice);
        const sv = []; if (A.satisfaction) sv.push({ better: 100, same: 60, worse: 10 }[A.satisfaction]); if (A.dropout) sv.push({ none: 100, few: 50, many: 0 }[A.dropout]);
        if (sv.length) acc.sv.push([sv.reduce((a, b) => a + b, 0) / sv.length, w, [A.satisfaction && 'parents say ' + A.satisfaction, A.dropout && 'drop-outs: ' + A.dropout].filter(Boolean).join(', ')]);
        const items = q("SELECT code FROM plan_items WHERE group_id = ? AND kind != 'rejected' AND code != 'proceed'", [g.group_id]);
        const st = {}; q('SELECT code, status FROM implementation WHERE group_id = ?', [g.group_id]).forEach(x => st[x.code] = x.status);
        const done = items.filter(i => st[i.code] === 'done').length, prog = items.filter(i => st[i.code] === 'in progress').length;
        acc.pol.push([items.length ? 100 * (done + prog / 2) / items.length : 100, w, items.length ? `${done} of ${items.length} delivered, ${prog} in progress` : 'Nothing needed']);
      });
      const W = { att: 30, fb: 30, sv: 20, pol: 20 }, NAME = { att: 'Attendance', fb: 'Feedback', sv: 'Field survey', pol: 'Policies delivered' };
      let tw = 0, tv = 0;
      Object.keys(W).forEach(k => {
        const a = acc[k]; if (!a.length) { parts.push({ k: NAME[k], v: null, w: W[k], note: 'No data yet' }); return; }
        const ww = a.reduce((x, y) => x + y[1], 0), v = a.reduce((x, y) => x + y[0] * y[1], 0) / ww;
        parts.push({ k: NAME[k], v: Math.round(v), w: W[k], note: a.map(x => x[2]).join(' · ') }); tw += W[k]; tv += v * W[k];
      });
      success = tw ? Math.round(tv / tw) : null;
    }

    /* ---- problems to address ---- */
    const probs = [];
    const P_ = (group_id, severity, title, detail, kind, link) => probs.push({ group_id, severity, title, detail, kind, link });
    list.forEach(g => {
      const s = school(g.sending_id), tag = list.length > 1 ? ` (${s.name})` : '';
      const items = q("SELECT code, title FROM plan_items WHERE group_id = ? AND kind != 'rejected'", [g.group_id]);
      const st = {}; q('SELECT code, status FROM implementation WHERE group_id = ?', [g.group_id]).forEach(x => st[x.code] = x.status);
      const neg = q("SELECT issue, severity FROM feedback WHERE group_id = ? AND sentiment = 'negative'", [g.group_id]);
      const byI = {}; neg.forEach(f => (byI[f.issue] ||= []).push(f));
      Object.entries(byI).forEach(([issue, fs]) => {
        const cover = items.find(i => (ISSUE_ITEMS[issue] || []).includes(i.code));
        const s2 = cover ? (st[cover.code] || 'not started') : null;
        if (cover && s2 === 'done') return;
        const sev = fs.some(f => f.severity === 'high') ? 'high' : 'medium';
        P_(g.group_id, cover ? (status === 'Merged' ? sev : 'medium') : sev, `${issue}${tag}`,
          `${fs.length} negative message${fs.length > 1 ? 's' : ''}. ` + (cover ? `Covered by “${cover.title}” — ${s2}.` : 'No policy in the plan covers this yet.'),
          'feedback', cover ? `#/m/${mid}/p/${g.group_id}/${cover.code}` : `#/m/${mid}/feedback`);
      });
      q("SELECT name, value, detail FROM checks WHERE group_id = ? AND status = 'flag'", [g.group_id]).forEach(c =>
        P_(g.group_id, /attendance/i.test(c.name) ? 'high' : 'medium', c.name + tag, `${c.value}. ${c.detail}`, 'check', `#/m/${mid}/g/${g.group_id}`));
      if (status === 'Merged' || status === 'Stayed') items.filter(i => i.code !== 'proceed' && st[i.code] !== 'done').forEach(i =>
        P_(g.group_id, status === 'Merged' ? 'medium' : 'low', `Not delivered: ${i.title}`, `Status: ${st[i.code] || 'not started'}.`, 'policy', `#/m/${mid}/p/${g.group_id}/${i.code}`));
      const openKey = q('SELECT count(*) AS n FROM questions qn LEFT JOIN answers a USING (group_id, kind) WHERE qn.group_id = ? AND qn.critical = 1 AND a.choice IS NULL', [g.group_id])[0].n;
      if (openKey) P_(g.group_id, 'medium', `${openKey} key question${openKey > 1 ? 's' : ''} unanswered${tag}`, 'The verdict stays provisional until the community answers.', 'survey', `#/m/${mid}/survey`);
    });

    /* ---- unknown data points, for the field survey form ---- */
    const done = new Set(q('SELECT group_id || ":" || field AS k FROM surveys WHERE merge_id = ?', [mid]).map(x => x.k));
    const unk = [];
    const U = (group_id, field, label, unit, current, target) => { if (!done.has(group_id + ':' + field)) unk.push({ group_id, field, label, unit, current: current == null ? '' : String(current), target }); };
    list.forEach((g, i) => {
      const s = school(g.sending_id), rt = q1('SELECT * FROM routes WHERE group_id = ?', [g.group_id]) || {};
      if (!['real', 'survey'].includes(rt.source)) {
        U(g.group_id, 'walk_min', `Walk time for a Class 1 child, ${s.name} → ${r.name}`, 'minutes', rt.walk_min, 'routes.walk_min');
        U(g.group_id, 'walk_km', `Walking distance on the path`, 'km', rt.walk_km, 'routes.walk_km');
      }
      if (rt.climb_m == null) U(g.group_id, 'climb_m', 'Climb on the path', 'metres', null, 'routes.climb_m');
      if (rt.road_km == null) U(g.group_id, 'road_km', 'Distance by road, for a vehicle', 'km', null, 'routes.road_km');
      if (status === 'Proposed') U(g.group_id, 'enrol_seen', `Children attending ${s.name} on the day of the visit`, 'children', s.enrol_total, 'surveys');
      if (status === 'Merged') U(g.group_id, 'attendance', `Attendance of moved children this month`, '%', null, 'attendance.pct');
      if (i === 0 && r.source !== 'real') {
        U(g.group_id, 'classrooms', `Usable classrooms at ${r.name}`, 'rooms', r.classrooms, 'schools.classrooms');
        U(g.group_id, 'teachers', `Teachers in post at ${r.name}`, 'teachers', r.teachers, 'schools.teachers');
      }
    });
    if (unk.length) probs.push({ group_id: list[0].group_id, severity: 'low', title: `${unk.length} data points not known`, detail: 'Walk time, road distance and school facts to be checked on a field visit.', kind: 'survey', link: `#/m/${mid}/survey` });

    const sevRank = { high: 0, medium: 1, low: 2 };
    probs.sort((a, b) => sevRank[a.severity] - sevRank[b.severity]).forEach((p, i) => run('INSERT INTO problems VALUES (?,?,?,?,?,?,?,?)', [mid, p.group_id, i + 1, p.severity, p.title, p.detail, p.kind, p.link]));
    unk.forEach(u => run('INSERT INTO unknowns VALUES (?,?,?,?,?,?,?)', [mid, u.group_id, u.field, u.label, u.unit, u.current, u.target]));
    run('INSERT INTO merge_summary VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', [mid, r.school_id, status, list.length, worst.verdict, worst.health, reason,
      sum('moving'), list[0].after_total, sum('one_time_inr'), sum('yearly_inr'), sum('conditions'), sum('open_questions'),
      success, successLabel(success), JSON.stringify(parts), probs.filter(p => p.severity !== 'low').length, unk.length, new Date().toISOString()]);
  });
}
