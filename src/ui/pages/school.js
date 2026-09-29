import { q } from '../../db/sqlite.js';
import { crumbs, esc, go, school } from '../helpers.js';

export function renderSchool(pg, id) {
  const s = school(id); if (!s) { go(''); return; }
  const ms = q(`SELECT g.group_id, g.merge_id, g.status, g.sending_id, g.receiving_id, m.verdict FROM merge_groups g JOIN merge_summary m USING (merge_id) WHERE g.sending_id = ? OR g.receiving_id = ?`, [id, id]);
  const free = !ms.length;
  pg.innerHTML = `${crumbs([['Map', '#/'], [s.name]])}
    <section class="ph"><div class="eyebrow">${esc(s.level)} · ${esc(s.district)} · ${esc(s.block)}</div><h1>${esc(s.name)}</h1>
      <div class="sub"><span>${esc(s.village)}</span>${s.udise_code ? `<span class="mono">UDISE ${esc(s.udise_code)}</span>` : ''}<span class="tag ${s.source}">${s.source}</span><span class="small">${esc(s.source_note || '')}</span></div></section>
    <section class="big4">
      <div class="tile"><span class="tl">Students</span><b>${s.enrol_total}</b><span class="ts">${s.enrol_primary} in Classes 1–5</span></div>
      <div class="tile"><span class="tl">Pre-primary</span><b>${s.enrol_preprimary}</b><span class="ts">${s.anganwadi_on_site ? 'anganwadi on site' : 'no anganwadi on site'}</span></div>
      <div class="tile"><span class="tl">Teachers</span><b>${s.teachers}</b><span class="ts">${(s.enrol_total / Math.max(1, s.teachers)).toFixed(0)} pupils per teacher</span></div>
      <div class="tile"><span class="tl">Classrooms</span><b>${s.classrooms}</b><span class="ts">${(s.enrol_total / Math.max(1, s.classrooms)).toFixed(0)} per room</span></div>
    </section>
    <section class="card"><h2>Merges</h2>${ms.length ? ms.map(x => `<p style="margin:6px 0"><a href="#/m/${x.merge_id}">${esc(school(x.sending_id).name)} → ${esc(school(x.receiving_id).name)}</a> · ${esc(x.status)} · ${esc(x.verdict)}</p>`).join('') : `<p class="muted">Not in any merge. <a href="#/new/${id}">Plan a merge with ${esc(s.name)} as the receiving school</a></p>`}</section>`;
}

/* ---------- new merge planner ---------- */
