import { q } from '../../db/sqlite.js';
import { $, $$, caseState, esc, evChip } from '../helpers.js';
import { render } from '../router.js';

export function stepCommunity(el, c, A, B) {
  const fb = q('SELECT f.*, h.name AS hab FROM citizen_feedback f LEFT JOIN habitations h USING (hab_id) WHERE f.school_id IN (?,?) ORDER BY received DESC', [A.school_id, B.school_id]);
  const th = {}; fb.forEach(f => { th[f.theme] ||= { n: 0, v: 0 }; th[f.theme].n++; if (f.status === 'verified') th[f.theme].v++; });
  const order = Object.entries(th).sort((a, b) => b[1].n - a[1].n), sel = caseState.theme;
  const list = sel ? fb.filter(f => f.theme === sel) : [];
  el.innerHTML = `<div class="card"><h2>Feedback summary <small>${fb.length} responses about ${esc(A.name)}, ${esc(B.name)} and the habitations · classified by theme (simulated Gemini)</small></h2>
    <div class="themes">${order.map(([k, v]) => `<button class="theme ${sel === k ? 'on' : ''}" data-t="${esc(k)}"><b>${v.n}</b><span>${esc(k)}</span><small>${v.v ? v.v + ' verified' : 'all reported'}</small></button>`).join('')}</div>
    <p class="small muted" style="margin-top:8px">Click a theme to read the responses behind it. <span class="evs reported">Reported</span> = said by citizens. <span class="evs verified">Verified</span> = checked against a government field observation.</p></div>
    ${sel ? `<div class="card"><h2>${esc(sel)} <small>${list.length} responses</small><button class="btn sm ghost" id="th-clear" style="margin-left:auto">Close</button></h2><div class="msgs">${list.map(f => `<div class="msg"><span class="who">${esc(f.sender_role)} · ${esc(f.hab || '')} · ${esc(f.channel)} · ${esc(f.received)}</span>
      <span class="orig hi" lang="hi">“${esc(f.text_hi)}”</span><span class="en">“${esc(f.text_en)}”</span><span class="vf">${evChip(f.status)}${f.verified_by ? `<span class="small">${esc(f.verified_by)}</span>` : ''}<span class="tag mock">mock</span></span></div>`).join('')}</div></div>` : ''}`;
  $$('.theme', el).forEach(b => b.onclick = () => { caseState.theme = caseState.theme === b.dataset.t ? null : b.dataset.t; render(); });
  const cl = $('#th-clear'); if (cl) cl.onclick = () => { caseState.theme = null; render(); };
}
