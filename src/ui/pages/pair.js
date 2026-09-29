import { q, q1 } from '../../db/sqlite.js';
import { evalPair } from '../../engine/evalPair.js';
import { checksHtml, feedbackHtml } from '../components.js';
import { P, STATUS_CLS, esc, go, inr, mCrumbs, school, tone } from '../helpers.js';

export function renderPair(pg, m, gid) {
  const g = q1('SELECT * FROM merge_groups WHERE group_id = ? AND merge_id = ?', [gid, m.merge_id]); if (!g) { go('m/' + m.merge_id); return; }
  const s = school(g.sending_id), r = school(g.receiving_id), a = q1('SELECT * FROM analysis WHERE group_id = ?', [gid]), R = P();
  const rt = q1('SELECT * FROM routes WHERE group_id = ?', [gid]) || {}, hz = q('SELECT * FROM hazards WHERE group_id = ?', [gid]);
  const ev = evalPair(s, r, R, { straight: rt.straight_km, walk: a.walk_km, hazards: hz, unsurveyed: !['real', 'survey'].includes(rt.source) });
  const items = q("SELECT * FROM plan_items WHERE group_id = ? AND kind != 'rejected' ORDER BY seq", [gid]);
  const limit = s.level_code === 'primary' ? R.walk_limit_primary_km : R.walk_limit_upper_km;
  const fb = q('SELECT * FROM feedback WHERE group_id = ?', [gid]), tn = tone(fb);
  pg.innerHTML = `${mCrumbs(m, [s.name])}
    <section class="ph"><div class="eyebrow">Closing school → ${esc(r.name)} · ${gid}</div><h1>${esc(s.name)}</h1>
      <div class="sub"><span class="mchip ${ev.match}">${ev.label}</span><span class="pill ${STATUS_CLS[g.status] || 's-pending'}">${esc(g.status)}</span><b class="t-${a.health}">${esc(a.verdict)}</b></div></section>
    <section class="big4">
      <div class="tile"><span class="tl">Children moving</span><b>${a.moving}</b><span class="ts">${s.enrol_total} on roll${a.stay_local ? ` · ${a.stay_local} stay local` : ''}</span></div>
      <div class="tile ${a.walk_km > limit ? 'flag' : ''}"><span class="tl">Walk</span><b>${(+a.walk_km).toFixed(1)} km</b><span class="ts">${rt.walk_min ? rt.walk_min + ' min · ' : ''}limit ${limit} km · <span class="tag ${rt.source}">${rt.source}</span></span></div>
      <div class="tile ${hz.length ? 'flag' : ''}"><span class="tl">Route hazards</span><b>${hz.length}</b><span class="ts">${hz.map(h => esc(h.kind)).join(', ') || 'none recorded'}</span></div>
      <div class="tile"><span class="tl">Feedback</span><b>${fb.length}</b><span class="ts">${tn.neg} negative · ${tn.pos} positive</span></div>
    </section>
    <section class="card"><h2>Match check <small>${ev.label.toLowerCase()} for ${esc(r.name)}</small></h2>
      <div class="fx" style="display:grid;gap:6px">${ev.problems.map(p => `<div class="fxr ${p.sev}"><span>${esc(p.t)}</span><span>${esc(p.fix)}</span></div>`).join('') || '<p class="muted">No problems found.</p>'}</div></section>
    <section><div class="sechd"><h2>Policies for this school</h2></div><div class="pcards">${items.map((it, i) => `<a class="pcard ${it.kind}" href="#/m/${m.merge_id}/p/${gid}/${it.code}"><span class="pn">${i + 1}</span><span class="pt">${esc(it.title)}</span><span class="pc">${inr(it.cost_inr)}${it.cost_inr ? ` <small>${it.cost_type}</small>` : ''}</span></a>`).join('')}</div></section>
    ${checksHtml(g, s, r)}
    ${feedbackHtml(gid)}`;
}

/* ---------- plan item ---------- */
