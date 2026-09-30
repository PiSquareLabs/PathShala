import { q, q1, run } from '../db/sqlite.js';
import { successHealth } from '../engine/merges.js';
import { HAZARD_ANSWER, commit, optLabel } from '../engine/rules.js';
import { $, $$, HC, MONTHS, css, esc, route, school, state, today } from './helpers.js';

export function qCards(gid, showMerge, kinds) {
  const qs = q(`SELECT qn.*, a.choice, a.note, a.answered_on, a.source AS asrc, g.sending_id, g.receiving_id
                FROM questions qn LEFT JOIN answers a USING (group_id, kind) JOIN merge_groups g USING (group_id)
                WHERE ${gid ? 'qn.group_id = ?' : '1'} ${kinds ? `AND qn.kind IN (${kinds.map(k => `'${k}'`).join(',')})` : ''} ORDER BY qn.group_id, a.choice IS NOT NULL, qn.critical DESC`, gid ? [gid] : []);
  const list = showMerge && state.qFilter === 'open' ? qs.filter(x => !x.choice) : qs;
  if (!list.length) return '<p class="empty">No questions here. Everything is answered.</p>';
  return list.map(x => {
    const opts = JSON.parse(x.options);
    const mg = showMerge ? `<div class="eyebrow">${x.group_id} · ${esc(school(x.sending_id).name)} → ${esc(school(x.receiving_id).name)}</div>` : '';
    return `<div class="q ${x.choice ? '' : 'open'}" data-g="${x.group_id}" data-k="${x.kind}">
      ${mg}
      <div class="qh"><span class="role">To: ${esc(x.role)}</span><span>${x.critical && !x.choice ? '<span class="st crit">Key</span> ' : ''}<span class="st ${x.choice ? 'answered' : 'open'}">${x.choice ? 'Answered' : 'Open'}</span></span></div>
      <div class="en">${esc(x.text_en)}</div>
      <div class="hi" lang="hi">${esc(x.text_hi)}</div>
      <div class="why">Why: ${esc(x.why)}</div>
      <div class="opts" role="group" aria-label="Answer">${opts.map(([v, l]) => `<button data-v="${v}" aria-pressed="${x.choice === v}">${esc(l)}</button>`).join('')}</div>
      <div class="ansnote"><input type="text" placeholder="Note from the community (optional)" value="${esc(x.note || '')}" aria-label="Note">${x.choice ? '<button class="btn sm ghost" data-clear>Clear</button>' : ''}</div>
      ${x.choice ? `<div class="small muted">Answered ${esc(x.answered_on || '')} · <span class="tag ${x.asrc === 'mock' ? 'mock' : 'officer'}">${x.asrc === 'mock' ? 'mock' : 'entered here'}</span></div>` : ''}
    </div>`;
  }).join('');
}
export function wireQuestions(root) {
  $$('.q', root).forEach(card => {
    const gid = card.dataset.g, kind = card.dataset.k, note = () => $('input', card).value.trim();
    $$('.opts button', card).forEach(b => b.onclick = () => saveAnswer(gid, kind, b.dataset.v, note()));
    const clr = $('[data-clear]', card);
    if (clr) clr.onclick = () => commit(`Answer cleared for ${gid}`, () => { run('DELETE FROM answers WHERE group_id = ? AND kind = ?', [gid, kind]); if (kind === 'hazard') run("DELETE FROM hazards WHERE group_id = ? AND data_source = 'Community answer'", [gid]); });
    $('input', card).addEventListener('keydown', e => { if (e.key === 'Enter') { const on = $('.opts button[aria-pressed="true"]', card); if (on) saveAnswer(gid, kind, on.dataset.v, note()); } });
  });
}
export function saveAnswer(gid, kind, choice, note) {
  commit(`Answer saved: ${gid} · ${optLabel(kind, choice)}`, () => {
    run('INSERT OR REPLACE INTO answers VALUES (?,?,?,?,?,?)', [gid, kind, choice, note || '', today(), 'officer']);
    if (kind === 'hazard') {
      run("DELETE FROM hazards WHERE group_id = ? AND data_source = 'Community answer'", [gid]);
      const h = HAZARD_ANSWER[choice];
      if (h) run('INSERT INTO hazards (group_id, kind, label, months, month_list, severity, data_source, source) VALUES (?,?,?,?,?,?,?,?)', [gid, choice, h[0], h[1], h[2], h[3], 'Community answer', 'officer']);
    }
  });
}
export function checksHtml(g, s, r) {
  const cks = q('SELECT * FROM checks WHERE group_id = ? ORDER BY seq', [g.group_id]);
  const rt = q1('SELECT * FROM routes WHERE group_id = ?', [g.group_id]);
  const hz = q('SELECT * FROM hazards WHERE group_id = ?', [g.group_id]);
  const pr = q(`SELECT DISTINCT p.* FROM precedents p WHERE p.pattern IN (${hz.map(h => `'${h.kind === 'court' ? 'water' : h.kind}'`).concat(["'x'"]).join(',')})
                OR (p.pattern = 'capacity' AND EXISTS (SELECT 1 FROM plan_items WHERE group_id = ? AND code = 'rooms'))
                OR (p.pattern = 'girls' AND EXISTS (SELECT 1 FROM plan_items WHERE group_id = ? AND code = 'girls'))
                OR (p.pattern = 'short' AND ? < 1)`, [g.group_id, g.group_id, rt ? rt.walk_km : 9]);
  const rowsS = [['Level', s.level, r.level], ['Students', s.enrol_total, r.enrol_total], ['Classes 1–5', s.enrol_primary, r.enrol_primary], ['Pre-primary', s.enrol_preprimary, r.enrol_preprimary], ['Teachers', s.teachers, r.teachers], ['Classrooms', s.classrooms, r.classrooms], ['UDISE code', s.udise_code || '—', r.udise_code || '—'], ['Data', `<span class="tag ${s.source}">${s.source}</span>`, `<span class="tag ${r.source}">${r.source}</span>`]];
  return `<div style="display:grid;gap:16px">
    <div class="card"><h2>Rule checks <small>rules are editable in the Rules tab</small></h2>
      <div class="checks">${cks.map(c => `<div class="chk"><span class="cs ${c.status}">${c.status}</span><span><b>${esc(c.name)}</b> · ${esc(c.value)}</span><span class="cr">${esc(c.rule_id)}</span><span class="cd">${esc(c.detail)}</span></div>`).join('')}</div>
    </div>
    <div class="two">
      <div class="card"><h2>Schools</h2>
        <table class="tbl"><thead><tr><th></th><th>${esc(s.name)}</th><th>${esc(r.name)}</th></tr></thead><tbody>${rowsS.map(x => `<tr><td class="muted">${x[0]}</td><td>${x[1] === x[1] + '' && x[1].startsWith('<') ? x[1] : esc(x[1])}</td><td>${x[2] === x[2] + '' && x[2].startsWith('<') ? x[2] : esc(x[2])}</td></tr>`).join('')}</tbody></table>
      </div>
      <div class="card"><h2>Route and hazards ${rt ? `<span class="tag ${rt.source}">${rt.source}</span>` : ''}</h2>
        ${rt ? `<table class="tbl"><tbody>
          <tr><td class="muted">Straight line</td><td>${rt.straight_km} km</td></tr>
          <tr><td class="muted">On foot</td><td>${rt.walk_km} km${rt.walk_min ? ', ' + rt.walk_min + ' min' : ''}</td></tr>
          <tr><td class="muted">Climb</td><td>${rt.climb_m != null ? rt.climb_m + ' m' : 'Not measured'}</td></tr>
          <tr><td class="muted">By road</td><td>${rt.road_km != null ? rt.road_km + ' km' : '—'}</td></tr>
          <tr><td class="muted">Note</td><td class="small">${esc(rt.source_note || '')}</td></tr></tbody></table>` : '<p class="empty">No route.</p>'}
        <div class="sechead">Hazards</div>
        <div class="hz">${hz.length ? hz.map(h => `<div><i class="sev-${h.severity}"></i><span>${esc(h.label)}</span><small>${esc(h.months || '')} · ${esc(h.data_source)}</small></div>`).join('') : '<p class="empty">None recorded. Ask the community (Questions tab).</p>'}</div>
      </div>
    </div>
    <div class="two">
      <div class="card chart"><h2>Attendance <small>monthly %</small></h2>${attChart(g)}</div>
      <div class="card"><h2>Similar cases</h2><div class="prec">${pr.length ? pr.map(p => `<div><span>${esc(p.case_name)}<small>${esc(p.outcome)}</small></span><small>${esc(p.state)} ${esc(p.year)}${p.url ? ` · <a href="${esc(p.url)}" target="_blank" rel="noopener">source</a>` : ''}</small></div>`).join('') : '<p class="empty">No matching precedent.</p>'}</div></div>
    </div>
  </div>`;
}
export function attChart(g) {
  const rows = q('SELECT month, school_id, pct FROM attendance WHERE group_id = ? ORDER BY month', [g.group_id]);
  if (!rows.length) return '<p class="empty">No attendance data for this merge yet.</p>';
  const months = [...new Set(rows.map(r => r.month))], W = 520, H = 180, pl = 30, pr = 10, pt = 10, pb = 24;
  const x = i => pl + i * (W - pl - pr) / Math.max(1, months.length - 1), y = v => pt + (100 - v) / 40 * (H - pt - pb);
  let svg = `<svg viewBox="0 0 ${W} ${H}" aria-label="Attendance chart">`;
  [60, 80, 100].forEach(v => svg += `<line class="ax" x1="${pl}" x2="${W - pr}" y1="${y(v)}" y2="${y(v)}"/><text x="${pl - 6}" y="${y(v) + 4}" text-anchor="end">${v}</text>`);
  months.forEach((m, i) => { if (i % 2 === 0) svg += `<text x="${x(i)}" y="${H - 6}" text-anchor="middle">${MONTHS[+m.slice(5)]} ${m.slice(2, 4)}</text>`; });
  if (g.order_date) { const i = months.indexOf(g.order_date.slice(0, 7)); if (i >= 0) svg += `<line x1="${x(i)}" x2="${x(i)}" y1="${pt}" y2="${H - pb}" stroke="${css('--accent')}" stroke-dasharray="3 3"/><text x="${x(i) + 4}" y="${pt + 10}" style="fill:${css('--accent')}">merge</text>`; }
  const pts = rows.map(r => `${x(months.indexOf(r.month))},${y(r.pct)}`).join(' ');
  svg += `<polyline points="${pts}" fill="none" stroke="${css('--ink')}" stroke-width="2" stroke-linejoin="round"/>`;
  rows.forEach(r => svg += `<circle cx="${x(months.indexOf(r.month))}" cy="${y(r.pct)}" r="2.6" fill="${r.pct < 80 ? css('--risk') : css('--ink')}"><title>${r.month}: ${r.pct}%</title></circle>`);
  return svg + `</svg><p class="small muted" style="margin-top:6px">School: ${esc(school(rows[0].school_id).name)} · red dots are below 80% · <span class="tag mock">mock</span></p>`;
}
export function feedbackHtml(gid) {
  const fb = q('SELECT * FROM feedback WHERE group_id = ? ORDER BY feedback_id DESC', [gid]);
  const by = {}; fb.forEach(f => { by[f.issue] ||= { negative: 0, neutral: 0, positive: 0 }; by[f.issue][f.sentiment]++; });
  const max = Math.max(1, ...Object.values(by).map(o => o.negative + o.neutral + o.positive));
  return `<div class="card"><h2>Feedback on this merge <small>${fb.length} messages</small><a class="btn sm" href="#/inbox/${gid}" style="margin-left:auto">+ Log feedback</a></h2>
    <div class="bars">${Object.entries(by).sort((a, b) => (b[1].negative + b[1].neutral + b[1].positive) - (a[1].negative + a[1].neutral + a[1].positive)).map(([k, o]) => { const n = o.negative + o.neutral + o.positive; return `<div class="brow"><span>${esc(k)}</span><span class="track" style="width:${n / max * 100}%"><span class="neg" style="flex:${o.negative}"></span><span class="neu" style="flex:${o.neutral}"></span><span class="pos" style="flex:${o.positive}"></span></span><b>${n}</b></div>`; }).join('')}</div>
    <div class="legend" style="margin-bottom:6px"><span><i class="c-red"></i>Negative</span><span><i style="background:var(--muted)"></i>Neutral</span><span><i class="c-green"></i>Positive</span></div>
    <div class="msgs">${fb.map(msgHtml).join('') || '<p class="empty">No feedback yet.</p>'}</div></div>`;
}
export function msgHtml(f) {
  const v = f.verification === 'verified' ? 'verified' : f.verification === 'partly verified' ? 'partly' : '';
  return `<div class="msg">
    <span class="who">${esc(f.sender_role)} · ${esc(f.channel)} · ${esc(f.received)}${f.group_id && route()[0] === 'inbox' ? ' · ' + f.group_id : ''}</span>
    <span class="orig ${f.language === 'hi' ? 'hi' : ''}" lang="${f.language}">${esc(f.text_original)}</span>
    ${f.language === 'hi' ? `<span class="en">${f.text_en ? esc(f.text_en) : '<i>English translation is added by Gemini in the full build.</i>'}</span>` : ''}
    <span class="vf"><span class="chip">${esc(f.issue)}</span><span class="chip ${f.sentiment}">${esc(f.sentiment)}</span><span class="chip ${v}">${esc(f.verification)}</span></span>
  </div>`;
}

/* ---------- inbox ---------- */
export function successHtml(m) {
  const parts = JSON.parse(m.success_parts || '[]'), h = successHealth(m.success);
  return `<section class="succ" style="--hc:${HC[h]}">
    <div><div class="eyebrow">Success of this merge</div><div class="big">${m.success == null ? '—' : m.success + '%'}</div><div class="lbl">${esc(m.success_label || 'Not enough data')}</div>
      <p class="small muted" style="margin-top:6px">Weighted: attendance 30, feedback 30, field survey 20, policies delivered 20.</p></div>
    <div class="sbars">${parts.map(p => `<div class="sb"><span>${esc(p.k)}</span><span class="tr"><i style="width:${p.v ?? 0}%;background:${p.v == null ? 'transparent' : HC[successHealth(p.v)]}"></i></span><b>${p.v == null ? '—' : p.v + '%'}</b><span class="nt">${esc(p.note)}</span></div>`).join('')}</div>
  </section>`;
}
