import { runFieldUpdate, runInvestigation, runPolicy } from '../../agent/runner.js';
import { q, q1, save } from '../../db/sqlite.js';
import { $, $$, esc, evChip } from '../helpers.js';
import { render } from '../router.js';
import { toast } from '../toast.js';

export function stepInvestigate(el, c, A, B) {
  const F = q('SELECT * FROM findings WHERE case_id = ? ORDER BY fid', [c.case_id]);
  const steps = q('SELECT * FROM agent_steps WHERE case_id = ? ORDER BY seq', [c.case_id]);
  const fq = q('SELECT * FROM field_questions WHERE case_id = ? ORDER BY seq', [c.case_id]);
  const answered = fq.some(x => x.answer || x.note);
  el.innerHTML = `<div class="card"><h2>Agent investigation <small>checks school data, GIS, routes, transport, field observations and citizen feedback</small>
      <button class="btn ${F.length ? '' : 'primary'}" id="ag-run" style="margin-left:auto">${F.length ? 'Run again' : 'Investigate case'}</button></h2>
    <ol class="agent" id="ag-list">${steps.map(s => agentRow(s, true)).join('') || '<li class="muted small" style="list-style:none">The agent has not run yet.</li>'}</ol>
    <p class="small muted">Simulated agent: each step is a real tool call against SQLite and the map data, run in this page. In the full build Gemini on Vertex AI plans the steps and calls the same tools.</p></div>
    <div id="ag-out">${F.length ? findingsHtml(c, F, fq, answered) : ''}</div>`;
  $('#ag-run').onclick = () => runAgent(c);
  $$('.agent li', el).forEach(li => li.onclick = () => li.classList.toggle('open'));
  wireField(c);
}
export function agentRow(s, done) {
  return `<li class="${done ? 'ok' : 'busy'}"><span class="ck">${done ? '✓' : '…'}</span><span><b>${esc(s.label)}</b> <code>${esc(s.tool)}</code><div class="small muted">${esc(s.summary || '')}</div>
    <pre class="io">${esc('input  ' + (typeof s.input === 'string' ? s.input : JSON.stringify(s.input)) + '\noutput ' + (typeof s.output === 'string' ? s.output : JSON.stringify(s.output)).slice(0, 900))}</pre></span></li>`;
}
export async function runAgent(c) {
  const btn = $('#ag-run'); btn.disabled = true; btn.textContent = 'Investigating…';
  const list = $('#ag-list'); list.innerHTML = '';
  let busy = null;
  try {
    await runInvestigation(c.case_id, ev => {
      if (ev.type === 'start') { busy = document.createElement('li'); busy.className = 'busy'; busy.innerHTML = `<span class="ck">…</span><span><b>${esc(ev.label)}</b> <code>${esc(ev.tool)}</code></span>`; list.appendChild(busy); }
      else busy.outerHTML = agentRow(ev, true);
    });
  } catch (e) {
    console.error(e); save(); render();
    toast('Investigation failed', [String(e.message || e)]);
    return;
  }
  save(); render();
  toast('Investigation complete', ['Potential issue detected: transport and seasonal access', '5 targeted field questions generated']);
}
export function findingsHtml(c, F, fq, answered) {
  const ev = q('SELECT * FROM evidence WHERE case_id = ? ORDER BY CAST(substr(eid, 2) AS INTEGER)', [c.case_id]);
  const main = F.filter(f => f.fid === 'F1' || f.fid === 'F2'), rest = F.filter(f => !['F1', 'F2'].includes(f.fid));
  const stCls = s => /Confirmed|Verified/.test(s) ? 's-red' : /No issue|Not confirmed|Partly/.test(s) ? 's-green' : 's-amber';
  const fcard = f => `<div class="fnd"><div class="row"><h3>${esc(f.title)}</h3><span class="pill ${stCls(f.status)}">${esc(f.status)}</span></div><p class="small muted">${esc(f.summary)}</p>
    <ul class="evl">${ev.filter(e => e.fid === f.fid).map(e => `<li>${evChip(e.status)} <span>${esc(e.label)}</span>${e.detail ? `<small>${esc(e.detail)}</small>` : ''}</li>`).join('')}</ul></div>`;
  return `<section class="card issue"><div class="eyebrow" style="color:var(--risk)">Potential issue detected</div><h2 style="font-size:22px">Transport & seasonal access</h2>
      <div class="two">${main.map(fcard).join('')}</div>
      <div class="evsum">${['reported', 'verified', 'calculated', 'needs'].map(s => `<span>${evChip(s)} ${ev.filter(e => e.status === s && ['F1', 'F2'].includes(e.fid)).map(e => esc(e.label.split(' ').slice(0, 5).join(' '))).join('; ') || '—'}</span>`).join('')}</div></section>
    <section class="card"><h2>Other findings</h2><div class="two">${rest.map(fcard).join('')}</div></section>
    <section class="card" id="fq"><h2>${answered ? 'Field verification' : 'Additional field verification required'} <small>the agent wrote these questions for this case, from the evidence gaps</small></h2>
      <div class="fqs">${fq.map(x => fieldQ(x)).join('')}</div>
      <div class="row" style="margin-top:12px"><span class="small muted">Submitting writes to <span class="mono">field_questions</span> and <span class="mono">evidence</span>, and updates the findings.</span><button class="btn primary" id="fq-go">${answered ? 'Update field evidence' : 'Submit field verification'}</button></div></section>`;
}
export function fieldQ(x) {
  const opts = JSON.parse(x.options || '[]');
  const input = x.type === 'choice' ? `<div class="opts">${opts.map(o => `<button type="button" data-v="${o}" aria-pressed="${x.answer === o}">${o}</button>`).join('')}</div>`
    : x.type === 'number' ? `<input type="number" class="fv" value="${esc(x.answer || '')}" placeholder="Number" style="max-width:160px">`
    : x.type === 'minutes' ? `<span class="impl"><input type="number" class="fv" value="${esc(x.answer || '')}" placeholder="Minutes" style="max-width:160px"><span class="muted small">minutes</span></span>`
    : `<div class="opts">${opts.map(o => `<button type="button" data-v="${o}" aria-pressed="${x.answer === o}">${o}</button>`).join('')}</div><input type="file" class="ff" accept="image/*" aria-label="Photo">`;
  return `<div class="fq" data-q="${x.qid}"><div class="fqn">${x.seq}</div><div><b>${esc(x.text)}</b><div class="small muted">Gap: ${esc(x.gap)}</div>${input}
    <input type="text" class="fnote" value="${esc(x.note || '')}" placeholder="${x.type === 'evidence' ? 'Note, GPS or photo caption' : 'Note (optional)'}">${x.answer || x.note ? `<div class="small t-green">Answered ${esc(x.answered_on || '')}</div>` : ''}</div></div>`;
}
export function wireField(c) {
  $$('.fq').forEach(el => {
    $$('.opts button', el).forEach(b => b.onclick = () => { $$('.opts button', el).forEach(x => x.setAttribute('aria-pressed', 'false')); b.setAttribute('aria-pressed', 'true'); });
    const ff = $('.ff', el); if (ff) ff.onchange = () => { const fn = ff.files[0]?.name; if (fn) { const n = $('.fnote', el); n.value = (n.value ? n.value + ' · ' : '') + 'photo: ' + fn; $$('.opts button', el).forEach(x => x.setAttribute('aria-pressed', x.dataset.v === 'Photo' ? 'true' : 'false')); } };
  });
  const go_ = $('#fq-go'); if (!go_) return;
  go_.onclick = async () => {
    const ans = {};
    $$('.fq').forEach(el => { const on = $('.opts button[aria-pressed="true"]', el), v = $('.fv', el); ans[el.dataset.q] = { v: on ? on.dataset.v : v ? v.value.trim() : '', note: $('.fnote', el).value.trim() }; });
    const before = q('SELECT fid, status FROM findings WHERE case_id = ?', [c.case_id]);
    await runFieldUpdate(c.case_id, ans);
    if (q1('SELECT count(*) AS n FROM interventions WHERE case_id = ?', [c.case_id]).n) await runPolicy(c.case_id);
    save();
    const after = q('SELECT fid, title, status FROM findings WHERE case_id = ?', [c.case_id]);
    const lines = after.filter(a => before.find(b => b.fid === a.fid)?.status !== a.status).map(a => `${esc(a.title)}: <b style="display:inline;font:inherit;font-weight:700">${esc(a.status)}</b>`);
    const e5 = q1("SELECT label FROM evidence WHERE case_id = ? AND eid = 'E5'", [c.case_id]);
    if (e5 && /unavailable|available/.test(e5.label)) lines.push('Public transport: ' + esc(e5.label.replace('Public transport ', '')));
    render(); toast('Evidence updated', lines.length ? lines : ['Answers saved.']);
  };
}
