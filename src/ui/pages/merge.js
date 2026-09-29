import { q, q1, run } from '../../db/sqlite.js';
import { evalPair } from '../../engine/evalPair.js';
import { RECEIVER_ISSUES } from '../../engine/merges.js';
import { commit, newItems } from '../../engine/rules.js';
import { successHtml } from '../components.js';
import { $, HC, P, STATUS_CLS, colour, esc, go, implOf, inr, mCrumbs, nowTime, pairsOf, plural, route, school, short, stChip, state, tone } from '../helpers.js';
import { miniMap } from '../map/miniMap.js';

export function renderMerge(pg, m) {
  const ps = pairsOf(m.merge_id), r = school(m.receiving_id), g0 = ps[0], R = P();
  const probs = q('SELECT * FROM problems WHERE merge_id = ? ORDER BY seq', [m.merge_id]);
  const items = q(`SELECT p.*, g.sending_id FROM plan_items p JOIN merge_groups g USING (group_id) WHERE g.merge_id = ? AND p.kind != 'rejected' ORDER BY p.group_id, p.seq`, [m.merge_id]).filter((it, _, arr) => !(it.code === 'proceed' && arr.some(o => o.code !== 'proceed')));
  const rej = q(`SELECT p.* FROM plan_items p JOIN merge_groups g USING (group_id) WHERE g.merge_id = ? AND p.kind = 'rejected'`, [m.merge_id]);
  const fb = q('SELECT f.* FROM feedback f JOIN merge_groups g USING (group_id) WHERE g.merge_id = ?', [m.merge_id]);
  const t = tone(fb), per = m.after_total / Math.max(1, r.classrooms);
  const far = ps.reduce((a, g) => g.walk_km > a.walk_km ? g : a, ps[0]);
  const limitOf = g => school(g.sending_id).level_code === 'primary' ? R.walk_limit_primary_km : R.walk_limit_upper_km;
  const multi = ps.length > 1;
  pg.innerHTML = `
    ${mCrumbs(m)}
    <section class="ph">
      <div class="eyebrow">Receiving school · ${esc(m.district)} · ${esc(m.block)} · ${m.merge_id}</div>
      <h1>${esc(r.name)}</h1>
      <div class="sub">receives ${ps.map(g => `<a href="#/m/${m.merge_id}/g/${g.group_id}">${esc(g.s_name)}</a>`).join(', ')}
        <span class="pill ${STATUS_CLS[m.status] || 's-pending'}">${esc(m.status)}</span>
        <span>${esc(g0.status_detail || '')}</span><span class="tag ${g0.source}">${g0.source}</span>
        ${g0.source === 'real' && g0.source_url ? `<a href="${esc(g0.source_url)}" target="_blank" rel="noopener" style="font-weight:500">News source</a>` : ''}
        ${g0.created_by === 'officer' ? '<button class="btn sm ghost" id="delm">Delete this merge</button>' : ''}</div>
    </section>
    ${m.status === 'Merged' ? successHtml(m) : ''}
    <section class="vband" style="--hc:${HC[m.health]}">
      <div><div class="eyebrow">${m.status === 'Merged' ? 'Plan verdict' : 'Verdict'}</div><div class="v1">${esc(m.verdict)}</div><p>${esc(m.reason)}</p></div>
      <div class="vside"><span>Analysed in your browser at ${state.lastRun}</span><button class="btn sm" id="rerun">Run analysis again</button></div>
    </section>
    <section class="big4">
      <div class="tile"><span class="tl">Children moving</span><b>${m.moving}</b><span class="ts">from ${plural(ps.length, 'school')}${ps.some(g => g.stay_local) ? ` · ${ps.reduce((a, g) => a + g.stay_local, 0)} pre-primary stay local` : ''}</span></div>
      <div class="tile ${far.walk_km > limitOf(far) ? 'flag' : ''}"><span class="tl">${multi ? 'Longest walk' : 'Walk to new school'}</span><b>${(+far.walk_km).toFixed(1)} km</b><span class="ts">${multi ? 'from ' + esc(far.s_name) + ' · ' : ''}limit ${limitOf(far)} km</span></div>
      <div class="tile ${per > R.max_per_classroom ? 'flag' : ''}"><span class="tl">Students after merge</span><b>${m.after_total}</b><span class="ts">${per.toFixed(0)} per room · ${r.classrooms} rooms</span></div>
      <div class="tile"><span class="tl">Cost of the plan</span><b>${m.yearly_inr ? inr(m.yearly_inr) : inr(m.one_time_inr)}</b><span class="ts">${m.yearly_inr ? 'per year' + (m.one_time_inr ? ' + ' + inr(m.one_time_inr) + ' one-time' : '') : m.one_time_inr ? 'one-time' : 'nothing extra'}</span></div>
    </section>
    <section class="mm">
      <div class="mmwrap"><div id="mmap" role="img" aria-label="Map of this merge"></div>
        <div class="mmleg"><span>Node colour = feedback about that school:</span><span><i style="background:var(--risk)"></i>mostly negative</span><span><i style="background:var(--ok)"></i>mostly positive</span><span><i style="background:var(--faint)"></i>none yet</span></div></div>
      <div class="slist">
        <div class="eyebrow">Schools in this merge</div>
        ${ps.map(g => {
          const s = school(g.sending_id), rt = q1('SELECT * FROM routes WHERE group_id = ?', [g.group_id]) || {};
          const ev = evalPair(s, r, R, { straight: rt.straight_km, walk: g.walk_km, hazards: q('SELECT * FROM hazards WHERE group_id = ?', [g.group_id]), unsurveyed: !['real', 'survey'].includes(rt.source) });
          const tn = tone(q('SELECT sentiment, issue FROM feedback WHERE group_id = ?', [g.group_id]).filter(f => !RECEIVER_ISSUES.includes(f.issue)));
          const np = probs.filter(p => p.group_id === g.group_id && p.severity !== 'low').length;
          return `<a class="srow" href="#/m/${m.merge_id}/g/${g.group_id}"><span class="fd" style="background:${tn.col}"></span>
            <span class="nm">${esc(s.name)} <span class="muted small" style="font-weight:500">closes</span></span><span class="mchip ${ev.match}">${ev.label}</span>
            <span class="mt">${s.enrol_total} students · ${(+g.walk_km).toFixed(1)} km on foot · ${tn.n ? `${tn.neg}− ${tn.pos}+ feedback` : 'no feedback'}${np ? ` · <b class="t-red">${plural(np, 'problem')}</b>` : ''}</span></a>`;
        }).join('')}
        ${(() => { const tr = tone(fb.filter(f => RECEIVER_ISSUES.includes(f.issue))); return `<a class="srow recvrow" href="#/s/${r.school_id}"><span class="fd" style="background:${tr.col}"></span><span class="nm">${esc(r.name)} <span class="muted small" style="font-weight:500">receives</span></span><span></span>
          <span class="mt">${r.enrol_total} → ${m.after_total} students · ${r.teachers} teachers · ${r.classrooms} rooms · ${tr.n ? `${tr.neg}− ${tr.pos}+ feedback` : 'no feedback'}</span></a>`; })()}
      </div>
    </section>
    <section class="card"><h2>Problems to address <small>${probs.length ? plural(probs.length, 'item') + ', worst first' : ''}</small></h2>
      ${probs.length ? `<div class="probs">${probs.map(p => `<div class="prob"><span class="sv ${p.severity}"></span><span class="pt2">${esc(p.title)}</span><a href="${p.link}">${{ survey: 'Survey →', feedback: 'Open →', check: 'Details →', policy: 'Update →' }[p.kind] || 'Open →'}</a><span class="pd2">${esc(p.detail)}</span></div>`).join('')}</div>` : '<p class="empty">No open problems.</p>'}
    </section>
    <section>
      <div class="sechd"><h2>Policies to implement</h2><span>${plural(m.conditions, 'condition')} · open one for cost, funding, evidence and status</span></div>
      <div class="pcards">${items.map((it, i) => {
        const st = implOf(it.group_id)[it.code]?.status;
        return `<a class="pcard ${it.kind}${newItems.has(it.group_id + '|' + it.title) ? ' new' : ''}" href="#/m/${m.merge_id}/p/${it.group_id}/${it.code}">
          <span class="pn">${i + 1}</span><span class="pt">${esc(it.title)}</span>
          ${multi ? `<span class="who">for ${esc(school(it.sending_id).name)}</span>` : ''}
          <span class="pc">${inr(it.cost_inr)}${it.cost_inr ? ` <small>${it.cost_type}</small>` : ''}${it.kind !== 'condition' ? ` <small>· ${it.kind}</small>` : ''}</span>
          ${m.status !== 'Proposed' && it.code !== 'proceed' ? `<span class="pst">${stChip(st)}</span>` : ''}</a>`; }).join('')}</div>
      ${rej.length ? `<div class="rej">${rej.map(it => `<span>Rejected: <b>${esc(it.title)}</b> — ${esc(it.detail.replace(/^Rejected: /, ''))}</span>`).join('')}</div>` : ''}
    </section>
    <section class="links3">
      <a class="lcard" href="#/m/${m.merge_id}/survey"><span class="eyebrow">Field survey form</span>
        <span class="ln2"><b class="${m.unknowns + m.open_questions ? 't-pending' : 't-green'}">${m.unknowns + m.open_questions}</b><span>items to collect</span></span>
        <span class="small muted">${plural(m.unknowns, 'data point')} unknown · ${plural(m.open_questions, 'question')} open</span>
        <span class="go">Open the form →</span></a>
      <a class="lcard" href="#/m/${m.merge_id}/feedback"><span class="eyebrow">Feedback</span>
        <span class="ln2"><b>${fb.length}</b><span>messages</span></span>
        <span class="sbar"><span class="neg" style="flex:${t.neg}"></span><span class="neu" style="flex:${t.n - t.neg - t.pos}"></span><span class="pos" style="flex:${t.pos}"></span></span>
        <span class="small muted">${t.neg} negative · ${t.pos} positive</span><span class="go">Read feedback →</span></a>
      <div class="lcard"><span class="eyebrow">Rule checks, route and attendance</span>
        ${ps.map(g => `<a href="#/m/${m.merge_id}/g/${g.group_id}" class="go">${esc(g.s_name)} → ${esc(short(r.name))}</a>`).join('')}
        <span class="small muted">One page per closing school.</span></div>
    </section>`;
  $('#rerun').onclick = () => { state.lastRun = nowTime(); commit('Analysis re-run', () => {}); };
  const del = $('#delm'); if (del) del.onclick = () => {
    if (!del.dataset.armed) { del.dataset.armed = 1; del.textContent = 'Click again to delete'; return; }
    const ids = ps.map(g => g.group_id);
    history.replaceState(null, '', '#/');
    commit(`Deleted ${m.merge_id}`, () => ids.forEach(gid => ['merge_groups', 'routes', 'hazards', 'answers', 'feedback', 'attendance', 'checks', 'plan_items', 'questions', 'analysis', 'implementation', 'surveys'].forEach(tb => run(`DELETE FROM ${tb} WHERE group_id = ?`, [gid]))));
  };
  miniMap(m, ps, r);
}
