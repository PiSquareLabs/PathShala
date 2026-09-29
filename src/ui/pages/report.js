import { walkProfile } from '../../case/analysis.js';
import { runDraft } from '../../agent/runner.js';
import { q, q1, run, save } from '../../db/sqlite.js';
import { $, $$, esc, evChip, go, inr, linkOf, logCase, nowTs, route, today } from '../helpers.js';
import { render } from '../router.js';
import { toast } from '../toast.js';

export async function stepReport(el, c, A, B) {
  if (!q1('SELECT count(*) AS n FROM findings WHERE case_id = ?', [c.case_id]).n) { el.innerHTML = `<div class="card"><h2>Run the investigation first</h2><p style="margin-top:10px"><a class="btn primary" href="#/case/${c.case_id}/investigate">Go to Investigate</a></p></div>`; return; }
  const Lk = linkOf(c.from_id, c.to_id), wp = walkProfile(Lk);
  const F = q('SELECT * FROM findings WHERE case_id = ? ORDER BY fid', [c.case_id]);
  const ev = q('SELECT * FROM evidence WHERE case_id = ? ORDER BY CAST(substr(eid, 2) AS INTEGER)', [c.case_id]);
  const sel = q('SELECT * FROM interventions WHERE case_id = ? AND selected = 1', [c.case_id]);
  const fq = q('SELECT * FROM field_questions WHERE case_id = ? ORDER BY seq', [c.case_id]);
  const th = {}; q('SELECT theme, count(*) AS n FROM citizen_feedback WHERE school_id IN (?,?) GROUP BY 1', [A.school_id, B.school_id]).forEach(r => th[r.theme] = r.n);
  const rep = q1('SELECT * FROM reports WHERE case_id = ?', [c.case_id]) || {};
  const parts = (await runDraft(c.case_id)).draft.sentences.map(x => [x.text, x.refs]), plain = parts.map(p => p[0]).join(' ');
  const draft = rep.edited ? rep.draft : plain;
  const comments = JSON.parse(rep.comments || '[]');
  const outstanding = [...ev.filter(e => e.status === 'needs' && !e.officer_verified).map(e => e.label), ...(!fq.find(x => x.qid === 'Q2')?.answer ? ['Students using the route'] : []), 'Applicable transport eligibility', ...(sel.some(s => s.code === 'TR') ? ['Final vehicle cost (appraised on actual cost)'] : [])];
  const submitted = c.status === 'Ready for administrative review';
  const fStatus = fid => F.find(f => f.fid === fid);
  el.innerHTML = `<section class="card report">
      <div class="row"><div><div class="eyebrow">Investigation report · ${c.case_id}</div><h2 style="font-size:24px;margin:2px 0 0">${esc(A.name)} → ${esc(B.name)}</h2></div><span class="pill ${submitted ? 's-green' : 's-pending'}">${esc(submitted ? 'Ready for administrative review' : 'Draft')}</span></div>
      <div class="rgrid">
        <div><div class="eyebrow">Proposed consolidation</div><b>${+fq.find(x => x.qid === 'Q2')?.answer || q1('SELECT sum(children) AS n FROM habitations WHERE school_id = ?', [A.school_id]).n} affected students</b><span>${q1('SELECT count(*) AS n FROM habitations WHERE school_id = ?', [A.school_id]).n} habitations</span></div>
        <div><div class="eyebrow">Geographic impact</div><b>${Lk.road_km} km by road</b><span>~${Lk.road_min} min by vehicle · ${Lk.walk_km} km footpath, ~${wp.min} min walking</span></div>
        <div><div class="eyebrow">Community feedback</div><b>${th['Transport'] || 0} transport concerns</b><span>${th['Seasonal access'] || 0} seasonal access · ${th['Safety'] || 0} safety</span></div>
        <div><div class="eyebrow">Field verification</div><b>${fq.find(x => x.qid === 'Q1')?.answer ? (fq.find(x => x.qid === 'Q1').answer === 'Yes' ? 'Crossing passable in rain' : 'Seasonal bridge access confirmed') : 'Not yet done'}</b><span>${fq.filter(x => x.answer || x.note).length} of ${fq.length} questions answered</span></div>
      </div>
      <div class="two"><div><div class="eyebrow">Agent findings</div><ul class="flist">${F.map(f => `<li class="${f.removed ? 'rm' : ''}"><label><input type="checkbox" data-f="${f.fid}" ${f.removed ? '' : 'checked'} ${submitted ? 'disabled' : ''}> <b>${esc(f.title)}</b></label> <span class="small muted">${esc(f.status)}</span> <button class="btn sm ghost" data-show="${f.fid}">Evidence</button></li>`).join('')}</ul>
        <p class="small muted">Untick to remove a finding from the report.</p></div>
        <div><div class="eyebrow">Outstanding information</div><ul class="flist">${outstanding.map(o => `<li>${esc(o)}</li>`).join('')}</ul></div></div>
      <div class="two"><div><div class="eyebrow">Proposed mitigation</div>${sel.length ? sel.map(s => `<p style="margin:4px 0"><b>${esc(s.title)}</b> · ${inr(s.cost_inr)} ${s.cost_type === 'none' ? '' : s.cost_type}</p>`).join('') : '<p class="muted">None selected. <a href="#/case/' + c.case_id + '/policy">Choose on Policy & cost</a></p>'}</div>
        <div><div class="eyebrow">Estimated cost</div><p style="margin:4px 0"><b>${inr(sel.filter(s => s.cost_type === 'per year').reduce((a, s) => a + s.cost_inr, 0))}</b> per year${sel.some(s => s.cost_type === 'one-time') ? ` + <b>${inr(sel.filter(s => s.cost_type === 'one-time').reduce((a, s) => a + s.cost_inr, 0))}</b> one-time` : ''}</p><p class="small muted">Calculated from structured inputs and the Samagra Shiksha norm. The model does not produce these numbers.</p></div></div>
    </section>
    <section class="card"><h2>Draft rationale <small>${rep.edited ? 'edited by the officer' : 'drafted by the agent from the evidence in this case only (simulated Gemini)'}</small></h2>
      ${rep.edited ? '' : `<div class="draft">${parts.map(([t, refs]) => `${esc(t)} ${refs.map(r => `<button class="ref" data-r="${r}">${r}</button>`).join('')}`).join(' ')}</div>`}
      <textarea id="rp-text" rows="6" ${submitted ? 'disabled' : ''} aria-label="Draft rationale">${esc(draft)}</textarea>
      <div class="row" style="margin-top:8px"><span class="small muted">${parts.flatMap(p => p[1]).length} claims, each linked to evidence. Click a reference to inspect it.</span>
        ${submitted ? '' : `<span style="display:flex;gap:8px"><button class="btn sm" id="rp-reset">Re-draft from evidence</button><button class="btn sm" id="rp-save">Save edit</button></span>`}</div>
      <div id="refbox"></div></section>
    <section class="card"><h2>Evidence <small>mark items you have checked yourself</small></h2>
      <table class="tbl"><thead><tr><th>ID</th><th>Evidence</th><th>Status</th><th>Officer</th></tr></thead><tbody>${ev.map(e => `<tr id="ev-${e.eid}"><td class="mono">${e.eid}</td><td>${esc(e.label)}<div class="small muted">${esc(e.detail || '')}</div></td><td>${evChip(e.status)}</td>
        <td><label class="small"><input type="checkbox" data-v="${e.eid}" ${e.officer_verified ? 'checked' : ''} ${submitted ? 'disabled' : ''}> verified</label></td></tr>`).join('')}</tbody></table></section>
    <section class="card"><h2>Review</h2>
      <div class="cmts">${comments.map(x => `<p class="small"><b>${esc(x.by)}</b> · ${esc(x.at)} — ${esc(x.text)}</p>`).join('') || '<p class="small muted">No comments.</p>'}</div>
      ${submitted ? `<p><b class="t-green">Submitted ${esc(c.submitted_on)}.</b> Status: Ready for administrative review. The AI did not approve the merger or the intervention.</p>` : `
      <div class="impl" style="margin-top:8px"><input type="text" id="rp-cmt" placeholder="Add a comment" style="flex:1"><button class="btn sm" id="rp-cmt-go">Add comment</button></div>
      <label class="impl" style="margin-top:12px"><input type="checkbox" id="rp-ok" ${rep.approved ? 'checked' : ''}> <b>I have reviewed the evidence and approve this draft.</b></label>
      <div class="row" style="margin-top:12px"><span class="small muted">The officer is responsible for the final report. The AI never approves a merger or an intervention.</span><button class="btn primary" id="rp-submit" ${rep.approved && sel.length ? '' : 'disabled'}>Submit investigation report</button></div>`}</section>
    <section class="card"><h2>Case record</h2><div class="tl2">${q('SELECT * FROM case_log WHERE case_id = ? ORDER BY ts', [c.case_id]).map(l => `<div><span class="mono small">${esc(l.ts.slice(5, 16))}</span><b>${esc(l.actor)}</b><span>${esc(l.action)}${l.detail ? ' — ' + esc(l.detail) : ''}</span></div>`).join('')}</div></section>`;
  const upRep = (o) => { const r = q1('SELECT * FROM reports WHERE case_id = ?', [c.case_id]) || { draft: plain, edited: 0, comments: '[]', approved: 0 }; Object.assign(r, o); run('INSERT OR REPLACE INTO reports VALUES (?,?,?,?,?,?)', [c.case_id, r.draft, r.edited, r.comments, r.approved, nowTs()]); save(); };
  $$('[data-f]', el).forEach(i => i.onchange = () => { run('UPDATE findings SET removed = ? WHERE case_id = ? AND fid = ?', [i.checked ? 0 : 1, c.case_id, i.dataset.f]); logCase(c.case_id, 'Officer', i.checked ? 'Restored finding' : 'Removed finding', i.dataset.f); save(); render(); });
  $$('[data-v]', el).forEach(i => i.onchange = () => { run('UPDATE evidence SET officer_verified = ? WHERE case_id = ? AND eid = ?', [i.checked ? 1 : 0, c.case_id, i.dataset.v]); logCase(c.case_id, 'Officer', i.checked ? 'Marked evidence verified' : 'Unmarked evidence', i.dataset.v); save(); render(); });
  $$('[data-show]', el).forEach(b => b.onclick = () => showRefs(ev.filter(e => e.fid === b.dataset.show).map(e => e.eid)));
  $$('.ref', el).forEach(b => b.onclick = () => showRefs([b.dataset.r]));
  const sv = $('#rp-save'); if (sv) sv.onclick = () => { upRep({ draft: $('#rp-text').value, edited: 1 }); logCase(c.case_id, 'Officer', 'Edited draft rationale'); save(); render(); toast('Draft saved', ['Your edit replaces the agent draft.']); };
  const rs = $('#rp-reset'); if (rs) rs.onclick = () => { upRep({ draft: plain, edited: 0 }); render(); };
  const cm = $('#rp-cmt-go'); if (cm) cm.onclick = () => { const t = $('#rp-cmt').value.trim(); if (!t) return; const r = q1('SELECT comments FROM reports WHERE case_id = ?', [c.case_id]); const list = JSON.parse(r?.comments || '[]'); list.push({ by: 'DEO Kullu', at: nowTs().slice(0, 16), text: t }); upRep({ comments: JSON.stringify(list) }); logCase(c.case_id, 'Officer', 'Comment', t); save(); render(); };
  const ok = $('#rp-ok'); if (ok) ok.onchange = () => { upRep({ approved: ok.checked ? 1 : 0, draft: $('#rp-text').value, edited: rep.edited || ($('#rp-text').value !== plain ? 1 : 0) }); logCase(c.case_id, 'Officer', ok.checked ? 'Approved draft' : 'Withdrew approval'); save(); render(); };
  const sb = $('#rp-submit'); if (sb) sb.onclick = () => { run("UPDATE cases SET status = 'Ready for administrative review', submitted_on = ? WHERE case_id = ?", [today(), c.case_id]); logCase(c.case_id, 'Officer', 'Submitted investigation report', 'Status: Ready for administrative review'); save(); render(); toast('Report submitted', ['Status: Ready for administrative review', 'The final decision stays with the administration.']); };
  function showRefs(ids) {
    const box = $('#refbox');
    box.innerHTML = `<div class="refs">${ids.map(id => { const e = ev.find(x => x.eid === id); if (e) return `<div>${evChip(e.status)} <b class="mono">${e.eid}</b> ${esc(e.label)}<div class="small muted">${esc(e.detail || '')}</div></div>`; const ch = q1('SELECT c.*, d.title AS doc_title, d.url FROM policy_chunks c JOIN policy_docs d USING (doc_id) WHERE chunk_id = ?', [id]); return ch ? `<div><span class="evs verified">Policy</span> <b class="mono">${id}</b> ${esc(ch.doc_title)}, ${esc(ch.section)}<div class="small">“${esc(ch.text)}” <a href="${esc(ch.url)}" target="_blank" rel="noopener">open source</a></div></div>` : ''; }).join('')}</div>`;
    ids.forEach(id => { const r = $('#ev-' + id); if (r) { r.classList.add('flashrow'); setTimeout(() => r.classList.remove('flashrow'), 1600); } });
  }
}
