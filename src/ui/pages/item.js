import { q, q1, run } from '../../db/sqlite.js';
import { IMPL } from '../../engine/merges.js';
import { commit } from '../../engine/rules.js';
import { msgHtml, qCards, wireQuestions } from '../components.js';
import { $, esc, go, implOf, inr, mCrumbs, school, today } from '../helpers.js';

export const ITEM_Q = { transport: ['vehicle', 'walk', 'hazard'], seasonal: ['months', 'road'], winterpoint: ['road'], young: ['young'], teacher: ['capacity'], rooms: ['capacity'], warden: ['crossing', 'hazard'], girls: ['girls'], visits: ['dropout', 'satisfaction'], review: ['satisfaction'], committee: ['committee'], branch: ['vehicle'], april: ['months'], proceed: ['satisfaction', 'dropout'] };
export const ITEM_FB = { transport: ['Transport', 'Route safety'], seasonal: ['Route safety'], winterpoint: ['Route safety'], young: ['Young children'], teacher: ['Capacity'], rooms: ['Capacity'], warden: ['Route safety', 'Transport'], girls: ["Girls' safety"], committee: ['Consultation', 'School identity'], proceed: ['Quality'], visits: ['Quality', 'Capacity'] };
export function renderItem(pg, m, gid, code) {
  const r = school(m.receiving_id), s = school(q1('SELECT sending_id FROM merge_groups WHERE group_id = ?', [gid])?.sending_id || m.receiving_id);
  const all = q(`SELECT p.* FROM plan_items p JOIN merge_groups g USING (group_id) WHERE g.merge_id = ? AND p.kind != 'rejected' ORDER BY p.group_id, p.seq`, [m.merge_id]);
  const idx = all.findIndex(i => i.group_id === gid && i.code === code), it = all[idx];
  if (!it) { pg.innerHTML = `${mCrumbs(m, ['Policy'])}<div class="card"><h2>This policy is no longer in the plan</h2><p class="muted">An answer, a message or a rule change removed it.</p><p style="margin-top:10px"><a class="btn" href="#/m/${m.merge_id}">Back to the merge</a></p></div>`; return; }
  const ev = JSON.parse(it.evidence || '[]');
  const grp = { data: ev.filter(e => !/^(ans:|fb:|Precedent:)/.test(e)), fb: ev.filter(e => e.startsWith('fb:')).map(e => e.slice(3)), ans: ev.filter(e => e.startsWith('ans:')).map(e => e.slice(4)), prec: ev.filter(e => e.startsWith('Precedent:')) };
  const precRows = q('SELECT * FROM precedents').filter(p => grp.prec.some(e => e.includes(p.case_name)));
  const kinds = ITEM_Q[code] || [], iss = ITEM_FB[code] || [];
  const hasQ = kinds.length && q1(`SELECT count(*) AS n FROM questions WHERE group_id = ? AND kind IN (${kinds.map(() => '?').join(',')})`, [gid, ...kinds]).n;
  const msgs = iss.length ? q(`SELECT * FROM feedback WHERE group_id = ? AND issue IN (${iss.map(() => '?').join(',')}) ORDER BY feedback_id DESC LIMIT 4`, [gid, ...iss]) : [];
  const label = { condition: 'Condition', step: 'Step', fallback: 'Fallback' }[it.kind];
  const im = implOf(gid)[code] || {};
  pg.innerHTML = `
    ${mCrumbs(m, [`${label} ${idx + 1}`])}
    <section class="ihead">
      <div><div class="eyebrow">${label} ${idx + 1} of ${all.length} · ${esc(s.name)} → ${esc(r.name)}</div><h1 style="font-size:clamp(24px,3vw,34px);margin-top:4px">${esc(it.title)}</h1></div>
      <div class="cost"><b>${inr(it.cost_inr)}</b><span>${it.cost_inr ? it.cost_type : ''}</span></div>
      <p>${esc(it.detail)}</p>
    </section>
    ${code !== 'proceed' ? `<section class="card"><h2>Status <small>set by the district office; counts toward the success score</small></h2>
      <div class="impl"><select id="im-s" aria-label="Status">${IMPL.map(x => `<option ${x === (im.status || 'not started') ? 'selected' : ''}>${x}</option>`).join('')}</select>
        <input type="text" id="im-n" value="${esc(im.note || '')}" placeholder="Note, e.g. vehicle contract signed" style="flex:1;min-width:200px"><button class="btn primary sm" id="im-go">Save status</button></div>
      ${im.updated_on ? `<p class="small muted" style="margin-top:6px">Last updated ${esc(im.updated_on)}</p>` : ''}</section>` : ''}
    <div class="two">
      <div class="card"><h2>Who pays</h2><p>${esc(it.funding || 'No new money needed.')}</p></div>
      <div class="card"><h2>Why it is in the plan</h2><div class="evg">
        ${grp.data.length ? `<div><div class="eyebrow">From the data</div><ul>${grp.data.map(e => `<li>${esc(e)}</li>`).join('')}</ul></div>` : ''}
        ${grp.fb.length ? `<div><div class="eyebrow">From feedback</div><ul>${grp.fb.map(e => `<li>${esc(e)}</li>`).join('')}</ul></div>` : ''}
        ${grp.ans.length ? `<div><div class="eyebrow">From community answers</div><ul>${grp.ans.map(e => `<li>${esc(e)}</li>`).join('')}</ul></div>` : ''}
        ${precRows.length ? `<div><div class="eyebrow">Similar cases</div><ul>${precRows.map(p => `<li>${esc(p.case_name)}, ${esc(p.state)} ${esc(p.year)}: ${esc(p.outcome)}${p.url ? ` · <a href="${esc(p.url)}" target="_blank" rel="noopener">source</a>` : ''}</li>`).join('')}</ul></div>` : ''}
        ${!ev.length ? '<p class="muted">Follows from the rule checks.</p>' : ''}
      </div></div>
    </div>
    ${hasQ ? `<section><div class="sechd"><h2>Questions that change this policy</h2><span>answer here and the plan updates</span></div><div class="qs" id="iq">${qCards(gid, false, kinds)}</div></section>` : ''}
    ${msgs.length ? `<section class="card"><h2>What people said</h2><div class="msgs">${msgs.map(msgHtml).join('')}</div></section>` : ''}
    <div class="row"><a class="btn" href="#/m/${m.merge_id}">← Back to the merge</a>
      <span style="display:flex;gap:8px">${idx > 0 ? `<a class="btn" href="#/m/${m.merge_id}/p/${all[idx - 1].group_id}/${all[idx - 1].code}">← Previous</a>` : ''}${idx < all.length - 1 ? `<a class="btn" href="#/m/${m.merge_id}/p/${all[idx + 1].group_id}/${all[idx + 1].code}">Next →</a>` : ''}</span></div>`;
  if (hasQ) wireQuestions($('#iq'));
  const ib = $('#im-go'); if (ib) ib.onclick = () => commit(`Status saved: ${it.title}`, () => run('INSERT OR REPLACE INTO implementation VALUES (?,?,?,?,?,?)', [gid, code, $('#im-s').value, $('#im-n').value.trim(), today(), 'officer']));
}
