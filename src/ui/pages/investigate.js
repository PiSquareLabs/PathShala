import { runFieldUpdate, runInvestigation, runPolicy } from '../../agent/runner.js';
import { optionIds, tracks } from '../../case/options.js';
import { q, q1, save } from '../../db/sqlite.js';
import { $, $$, esc, evChip, school } from '../helpers.js';
import { fold } from '../kit.js';
import { render } from '../router.js';
import { toast } from '../toast.js';
import { concernsCard } from './feedback.js';

export function stepInvestigate(el, c, A, B) {
  const F = q('SELECT * FROM findings WHERE case_id = ? ORDER BY fid', [c.case_id]);
  const steps = q('SELECT * FROM agent_steps WHERE case_id = ? ORDER BY seq', [c.case_id]);
  const fq = q('SELECT * FROM field_questions WHERE case_id = ? ORDER BY seq', [c.case_id]);
  const answered = fq.some(x => x.answer || x.note);
  el.innerHTML = `<div class="card"><div class="ivtop"><h2 style="margin:0">Investigate ${esc(B.name)}</h2>
      <span class="actions"><button class="btn ${F.length ? '' : 'primary'}" id="ag-run">${F.length ? 'Run again' : 'Investigate case'}</button>${optionIds(c.inv_id).length > 1 ? `<button class="btn" id="ag-run-all">Investigate all ${optionIds(c.inv_id).length} schools</button>` : ''}</span></div>
    <ol class="agent" id="ag-list">${steps.map(s => agentRow(s, true)).join('') || '<li class="muted small" style="list-style:none">Not run yet. The agent checks students, routes, GIS layers, transport, feedback and field observations.</li>'}</ol></div>
    ${concernsCard(c.case_id, 'Feedback carried forward')}
    <div id="ag-out">${F.length ? findingsHtml(c, F, fq, answered) : ''}</div>`;
  $('#ag-run').onclick = () => runAgent(c);
  const all = $('#ag-run-all'); if (all) all.onclick = () => runAll(c);
  $$('.agent li', el).forEach(li => li.onclick = () => li.classList.toggle('open'));
  wireField(c);
}
export function agentRow(s, done) {
  return `<li class="${done ? 'ok' : 'busy'}"><span class="ck">${done ? '✓' : '…'}</span><span><b>${esc(s.label)}</b> <code>${esc(s.tool)}</code><div class="small muted">${esc(s.summary || '')}</div>
    <pre class="io">${esc('input  ' + (typeof s.input === 'string' ? s.input : JSON.stringify(s.input)) + '\noutput ' + (typeof s.output === 'string' ? s.output : JSON.stringify(s.output)).slice(0, 900))}</pre></span></li>`;
}
const listRow = (ev, list, st) => {
  if (ev.type === 'start') { st.busy = document.createElement('li'); st.busy.className = 'busy'; st.busy.innerHTML = `<span class="ck">…</span><span><b>${esc(ev.label)}</b> <code>${esc(ev.tool)}</code></span>`; list.appendChild(st.busy); }
  else st.busy.outerHTML = agentRow(ev, true);
};

/* Investigate the school being viewed. */
export async function runAgent(c) {
  const btn = $('#ag-run'); btn.disabled = true; btn.textContent = 'Investigating…';
  const all = $('#ag-run-all'); if (all) all.disabled = true;
  const list = $('#ag-list'); list.innerHTML = ''; const st = {};
  try { await runInvestigation(c.case_id, ev => listRow(ev, list, st)); }
  catch (e) { console.error(e); save(); render(); toast('Investigation failed', [String(e.message || e)]); return; }
  save(); render();
  toast('Investigation complete', [`${esc(school(c.to_id).name)}: 5 field questions generated`]);
}

/* Investigate every candidate school, one after the other. The steps of the school being viewed are shown live. */
export async function runAll(c) {
  const btn = $('#ag-run-all'), ts = tracks(c.inv_id); btn.disabled = true; $('#ag-run').disabled = true;
  const list = $('#ag-list'); list.innerHTML = ''; const st = {};
  try {
    for (let i = 0; i < ts.length; i++) {
      btn.textContent = `Investigating ${i + 1} of ${ts.length}: ${school(ts[i].to_id).name}…`;
      await runInvestigation(ts[i].case_id, ts[i].case_id === c.case_id ? ev => listRow(ev, list, st) : undefined);
    }
  } catch (e) { console.error(e); save(); render(); toast('Investigation failed', [String(e.message || e)]); return; }
  save(); render();
  toast('Investigation complete', [`${ts.length} schools investigated`, 'Answer the field questions and choose interventions for each school']);
}
export function findingsHtml(c, F, fq, answered) {
  const ev = q('SELECT * FROM evidence WHERE case_id = ? ORDER BY CAST(substr(eid, 2) AS INTEGER)', [c.case_id]);
  const stCls = s => /Confirmed|Verified/.test(s) ? 's-red' : /No issue|Not confirmed|Partly/.test(s) ? 's-green' : 's-amber';
  const order = ['primary', 'secondary', 'context'];
  const sorted = F.slice().sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind) || a.fid.localeCompare(b.fid));
  return `<section class="card" id="findings"><h2>Findings</h2>
      ${sorted.map(f => { const es = ev.filter(e => e.fid === f.fid); return `<div class="finding" data-f="${f.fid}"><div class="row"><h3>${esc(f.title)}</h3><span class="pill ${stCls(f.status)}">${esc(f.status)}</span></div>
        <p class="small muted">${esc(f.summary)}</p>${fold('Evidence', `<ul class="evl">${es.map(e => `<li>${evChip(e.status)} <span>${esc(e.label)}</span>${e.detail ? `<small>${esc(e.detail)}</small>` : ''}</li>`).join('')}</ul>`, { count: es.length })}</div>`; }).join('')}</section>
    <section class="card" id="fq"><h2>${answered ? 'Field verification' : 'Field questions'} <small>from the evidence gaps</small></h2>
      <div class="fqs">${fq.map(x => fieldQ(x)).join('')}</div>
      <div class="row" style="margin-top:12px"><span></span><button class="btn primary" id="fq-go">${answered ? 'Update field evidence' : 'Submit field verification'}</button></div></section>`;
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
