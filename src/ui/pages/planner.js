import { q, run } from '../../db/sqlite.js';
import { evalPair } from '../../engine/evalPair.js';
import { commit } from '../../engine/rules.js';
import { $, $$, P, crumbs, esc, go, haversine, inr, plural, school, short, state } from '../helpers.js';
import { render } from '../router.js';

export function renderPlanner(pg, pre) {
  const R = P();
  const used = new Set(q('SELECT sending_id AS id FROM merge_groups UNION SELECT receiving_id FROM merge_groups').map(x => x.id));
  const free = q('SELECT * FROM schools ORDER BY enrol_total DESC').filter(s => !used.has(s.school_id));
  if (free.length < 2) { pg.innerHTML = `${crumbs([['Map', '#/'], ['New merge']])}<div class="card"><h2>No free schools left</h2><p class="muted">Every school is already in a merge. Reset the demo or delete a merge you created.</p></div>`; return; }
  const rid = free.some(s => s.school_id === pre) ? pre : (state.plan?.rid && free.some(s => s.school_id === state.plan.rid) ? state.plan.rid : free[0].school_id);
  const r = school(rid);
  const cands = free.filter(s => s.school_id !== rid).map(s => ({ s, ev: evalPair(s, r, R) })).filter(c => c.ev.d < 25).sort((a, b) => a.ev.d - b.ev.d);
  if (!state.plan || state.plan.rid !== rid) state.plan = { rid, sel: new Set(cands.filter(c => c.ev.match !== 'bad').map(c => c.s.school_id)) };
  const sel = state.plan.sel;
  pg.innerHTML = `${crumbs([['Map', '#/'], ['New merge']])}
    <section class="ph"><div class="eyebrow">Plan a merge</div><h1>New merge</h1><div class="sub">Pick the receiving school, then tick the schools that would close. Each one is checked on its own and all together.</div></section>
    <section class="card"><label class="f" style="max-width:520px">Receiving school<select id="pl-r">${free.map(s => `<option value="${s.school_id}" ${s.school_id === rid ? 'selected' : ''}>${esc(s.name)} · ${s.enrol_total} students · ${s.teachers} teachers · ${s.classrooms} rooms · ${esc(s.block)}</option>`).join('')}</select></label></section>
    <div class="planner">
      <div class="cands">
        <div class="eyebrow">Schools that could close into ${esc(r.name)} · nearest first</div>
        ${cands.map(({ s, ev }) => `<label class="cand ${sel.has(s.school_id) ? 'on' : ''}" data-s="${s.school_id}">
          <input type="checkbox" ${sel.has(s.school_id) ? 'checked' : ''} aria-label="Include ${esc(s.name)}">
          <span><span class="nm">${esc(s.name)}</span><br><span class="mt">${s.enrol_total} students${s.enrol_preprimary ? ` (${s.enrol_preprimary} pre-primary)` : ''} · ${ev.d.toFixed(1)} km apart · about ${ev.walk.toFixed(1)} km on foot</span></span>
          <span class="mchip ${ev.match}">${ev.label}</span>
          <span class="fx">${ev.problems.map(p => `<span class="fxr ${p.sev}"><span>${esc(p.t)}</span><span>${esc(p.fix)}</span></span>`).join('')}</span>
        </label>`).join('') || '<p class="empty">No free schools within 25 km.</p>'}
      </div>
      <div class="summ" id="pl-sum"></div>
    </div>`;
  const summ = () => {
    const chosen = cands.filter(c => sel.has(c.s.school_id));
    const kids = chosen.reduce((a, c) => a + c.s.enrol_total, 0), after = r.enrol_total + kids;
    const rooms = Math.max(0, Math.ceil(after / R.max_per_classroom) - r.classrooms);
    const teach = Math.max(0, Math.ceil(after / R.max_ptr) - r.teachers);
    const tKids = chosen.filter(c => c.ev.walk > c.ev.limit).reduce((a, c) => a + c.s.enrol_total, 0);
    const fixes = {}; chosen.forEach(c => c.ev.problems.forEach(p => { const k = p.fix.replace(/: \d+ ×.*$/, '').replace(/ for \d+ children.*$/, ''); fixes[k] = (fixes[k] || 0) + 1; }));
    const worst = chosen.some(c => c.ev.match === 'bad') ? 'bad' : chosen.some(c => c.ev.match === 'ok') ? 'ok' : 'good';
    $('#pl-sum').innerHTML = `<div class="card" style="display:grid;gap:12px">
      <div><div class="eyebrow">This merge</div><div style="font-family:var(--f-display);font-size:22px;font-weight:700;line-height:1.2;margin-top:2px">${plural(chosen.length, 'school')} into ${esc(short(r.name))}</div>
        ${chosen.length ? `<span class="mchip ${worst}" style="display:inline-block;margin-top:6px">${{ good: 'Good match overall', ok: 'Workable with conditions', bad: 'Includes a poor match' }[worst]}</span>` : ''}</div>
      <div class="kv"><span>Children affected</span><b>${kids}</b><span>${esc(short(r.name))} after merge</span><b>${r.enrol_total} → ${after}</b>
        <span>Students per room</span><b class="${after / Math.max(1, r.classrooms) > R.max_per_classroom ? 't-amber' : ''}">${(after / Math.max(1, r.classrooms)).toFixed(0)}</b>
        <span>Rooms to add</span><b>${rooms}</b><span>Teachers needed</span><b>${teach ? '+' + teach : 'enough'}</b>
        <span>Transport, per year</span><b>${inr(tKids * R.transport_per_child)}</b><span>Rooms, one-time</span><b>${inr(rooms * R.classroom_cost)}</b></div>
      ${Object.keys(fixes).length ? `<div><div class="eyebrow">Common solutions</div><ul style="margin-top:4px">${Object.entries(fixes).sort((a, b) => b[1] - a[1]).map(([k, n]) => `<li>${esc(k)}${chosen.length > 1 ? ` <span class="muted">· ${n} of ${chosen.length}</span>` : ''}</li>`).join('')}</ul></div>` : ''}
      <button class="btn primary" id="pl-go" ${chosen.length ? '' : 'disabled'}>Create merge and build the plan</button>
      <span class="small muted">Routes are estimates until the field survey. The full plan, questions and survey form are generated next.</span></div>`;
    const b = $('#pl-go'); if (b) b.onclick = () => create(chosen.map(c => c.s));
  };
  const create = senders => {
    const mn = 1 + Math.max(0, ...q('SELECT merge_id FROM merge_groups').map(x => +String(x.merge_id).slice(1) || 0));
    let gn = Math.max(0, ...q('SELECT group_id FROM merge_groups').map(x => +x.group_id.slice(1) || 0));
    const mid = 'M' + mn;
    state.plan = null;
    history.replaceState(null, '', '#/m/' + mid);
    commit(`Created ${mid}: ${senders.length} school${senders.length > 1 ? 's' : ''} into ${r.name}`, () => senders.forEach(s => {
      const gid = 'G' + (++gn), d = haversine(s, r), w = Math.round(d * 13) / 10;
      run('INSERT INTO merge_groups VALUES (?,?,?,?,?,?,?,?,?,?,?,?)', [gid, s.school_id, r.school_id, r.district, r.block, 'Proposed', 'Planned on the desk; field survey pending', null, 'desk', '', 'officer', mid]);
      run('INSERT INTO routes VALUES (?,?,?,?,?,?,?,?)', [gid, Math.round(d * 100) / 100, w, Math.round(w * 22), null, null, 'estimate', 'Estimated: 1.3 × straight line']);
    }));
    window.scrollTo(0, 0);
  };
  $('#pl-r').onchange = e => { state.plan = null; history.replaceState(null, '', '#/new/' + e.target.value); render(); };
  $$('.cand', pg).forEach(c => $('input', c).onchange = e => { e.target.checked ? sel.add(c.dataset.s) : sel.delete(c.dataset.s); c.classList.toggle('on', e.target.checked); summ(); });
  summ();
}
