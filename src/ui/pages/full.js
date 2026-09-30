import { STAGES, adoptRecommendation, candidatesFor, fieldForm, fullRow, reportText, reviewList, runFullResearch, startFull, submitFieldAndDecide } from '../../agent/fullControl.js';
import { llmConfigured } from '../../agent/llm.js';
import { saveFieldAnswers } from '../../case/findings.js';
import { run, save } from '../../db/sqlite.js';
import { $, $$, crumbs, esc, go, inr, school } from '../helpers.js';
import { fold } from '../kit.js';
import { render } from '../router.js';
import { toast } from '../toast.js';
import { fieldQ } from './investigate.js';

const busy = new Set();
const mode = () => (llmConfigured() ? 'Gemini' : 'Simulated');
const cite = r => `<span class="cite">${esc(r)}</span>`;
const stageIdx = st => ({ research: 1, field: 2, policy: 3, final: 4 })[st] ?? 0;

function stepper(st) {
  const i = stageIdx(st);
  return `<nav class="steps fcsteps" aria-label="Full control stages">${STAGES.map(([k, l], n) => `<span aria-current="${n === i ? 'step' : 'false'}" class="${n < i || st === 'final' ? 'done' : ''}"><span class="sn">${n < i || st === 'final' ? '✓' : n + 1}</span>${l}${k === 'field' ? ' <small>(officer)</small>' : ''}</span>`).join('')}</nav>`;
}
function logBox(row) { return `<div class="fclog" id="fc-log" role="log">${row.log.map(l => `<div><small>${esc(l.t)}</small> ${esc(l.text)}</div>`).join('')}</div>`; }
const appendLog = text => { const b = $('#fc-log'); if (b) { b.insertAdjacentHTML('beforeend', `<div>${esc(text)}</div>`); b.scrollTop = b.scrollHeight; } };

export function renderFull(pg, inv) {
  pg.classList.add('wide');
  if (!inv) return startView(pg);
  const row = fullRow(inv); if (!row) { go('full'); return; }
  const A = school(q_from(inv));
  pg.innerHTML = `${crumbs([['Full control', '#/full'], [A.name]])}
    <section class="ph"><h1><span style="color:var(--risk)">${esc(A.name)}</span> <span class="arrow">→</span> Full control</h1><div class="sub"><span class="pill ${mode() === 'Gemini' ? 's-green' : 's-pending'}">${mode()}</span><span class="muted">${esc(inv)}</span></div></section>
    ${stepper(row.stage)}<div id="fc-body"></div>`;
  const body = $('#fc-body');
  if (row.stage === 'research' || row.stage === 'policy') return runningView(body, inv, row);
  if (row.stage === 'field') return fieldView(body, inv, row);
  finalView(body, inv, row);
}
const q_from = inv => fieldForm(inv)[0].track.from_id;

/* ---- start ---- */
function startView(pg) {
  const list = reviewList(); let sel = list[0]?.school_id;
  pg.innerHTML = `${crumbs([['Full control']])}<section class="ph"><h1>Full control</h1><div class="sub muted">One closing school in. A researched recommendation, comparison, budget and report out. The field officer's entries are the only manual step.</div></section>
    <div class="card"><h2>1 · Choose the closing school</h2>
      <p class="small muted">Schools with 30 or fewer students, or a poor or unsafe building. The AI then finds the nearest suitable receiving schools and researches each one.</p>
      <label class="f">Closing school<select id="fc-school">${list.map(s => `<option value="${s.school_id}">${esc(s.name)} · ${s.enrol_total} students · ${esc(s.block)}${s.building && /^(Poor|Unsafe)/.test(s.building) ? ' · building ' + esc(s.building.split('—')[0].trim().toLowerCase()) : ''}</option>`).join('')}</select></label>
      <div id="fc-cands" class="small muted"></div>
      <div class="row" style="margin-top:12px"><span class="small muted">Stages: AI research → field form (you) → policies and budget → decision.</span><button class="btn primary" id="fc-start">Start Full control</button></div></div>
    <div class="card"><h2>What happens</h2><ol class="fcflow"><li><b>AI research</b> for each candidate: citizen feedback, investigation, Transport Planner, Feedback Checker. Every step is logged.</li><li><b>Stop for the field officer.</b> A field form is generated: fill it in and submit.</li><li><b>Policies and budget:</b> the best policies are picked for each candidate by a fixed rule and costed by the calculator.</li><li><b>Decision:</b> ranked candidates, why-comparison, budget, and the full report text. You adopt or change the choice and submit from the Report step.</li></ol></div>`;
  const showC = () => { sel = $('#fc-school').value; const c = candidatesFor(sel); $('#fc-cands').innerHTML = c.length ? `Candidate receiving schools: ${c.map(x => `<b>${esc(x.s.name)}</b> (${x.road} km, score ${x.score})`).join(', ')}` : '<span class="t-red">No suitable receiving school within 12 km.</span>'; $('#fc-start').disabled = !c.length; };
  $('#fc-school').onchange = showC; showC();
  $('#fc-start').onclick = () => { try { go('full/' + startFull($('#fc-school').value)); } catch (e) { toast('Could not start', [e.message]); } };
}

/* ---- research or decision running ---- */
function runningView(body, inv, row) {
  const research = row.stage === 'research';
  body.innerHTML = `<div class="card"><h2>${research ? '2 · AI research is running' : '4 · Policies, budget and decision are running'}</h2><p class="small muted">${research ? 'Every candidate school is researched. It will stop at the field form.' : 'Updating the evidence from your field answers, choosing the best policies, calculating the budget and ranking the candidates.'} Each line below is a logged step.</p>${logBox(row)}<p class="small muted" id="fc-wait">Working…</p></div>`;
  const key = inv + row.stage; if (busy.has(key)) return; busy.add(key);
  const fn = research ? () => runFullResearch(inv, appendLog) : () => submitFieldAndDecide(inv, pending[inv] || {}, appendLog);
  fn().then(() => { busy.delete(key); render(); }).catch(e => { console.error(e); busy.delete(key); appendLog('Failed: ' + e.message); const w = $('#fc-wait'); if (w) w.innerHTML = `<span class="t-red">${esc(e.message)}</span>`; toast('Full control stopped', [String(e.message || e)]); });
}
const pending = {};

/* ---- field form (officer) ---- */
function fieldView(body, inv, row) {
  const secs = fieldForm(inv), A = school(secs[0].track.from_id);
  body.innerHTML = `<div class="card" id="fc-form"><div class="row no-print"><h2 style="margin:0">3 · Field verification form <small>the AI stops here: the field officer enters the answers</small></h2><span class="actions"><button class="btn" id="fc-print">Print blank form</button></span></div>
      <div class="fcprint"><h2>Field verification form: ${esc(A.name)}</h2><p>Closing school: <b>${esc(A.name)}</b> · Candidates: ${secs.map(s => esc(s.school.name)).join(', ')}<br>Officer: ______________________ &nbsp; Date: ____________ &nbsp; Place visited: ______________________</p></div>
      <p class="small muted no-print">The research is complete for ${secs.length} candidate schools. These are the questions it could not answer from data. Answer what you can: tap an option, type a number, or add a note. The AI continues automatically after you submit.</p>
      ${secs.map(s => `<section class="fcsec" data-cid="${esc(s.track.case_id)}"><h3>${esc(s.school.name)}</h3><div class="fqs">${s.questions.map(x => fieldQ(x)).join('')}</div></section>`).join('')}
      <div class="row no-print" style="margin-top:12px"><span class="small muted" id="fc-count"></span><button class="btn primary" id="fc-submit">Submit field entries and continue</button></div></div>
    ${fold('What the AI did (log)', logBox(row), { id: 'fc-log-fold' })}`;
  $$('.fq', body).forEach(el => { $$('.opts button', el).forEach(b => b.onclick = () => { $$('.opts button', el).forEach(x => x.setAttribute('aria-pressed', 'false')); b.setAttribute('aria-pressed', 'true'); count(); }); $$('input', el).forEach(i => { i.oninput = count; }); const ff = $('.ff', el); if (ff) ff.onchange = () => { const fn = ff.files[0]?.name; if (fn) { const n = $('.fnote', el); n.value = (n.value ? n.value + ' · ' : '') + 'photo: ' + fn; count(); } }; });
  const collect = () => Object.fromEntries($$('.fcsec', body).map(sec => [sec.dataset.cid, Object.fromEntries($$('.fq', sec).map(el => { const on = $('.opts button[aria-pressed="true"]', el), v = $('.fv', el); return [el.dataset.q, { v: on ? on.dataset.v : v ? v.value.trim() : '', note: $('.fnote', el).value.trim() }]; }))]));
  const answered = a => Object.values(a).filter(x => x.v || x.note).length;
  function count() { const a = collect(); $('#fc-count').textContent = Object.entries(a).map(([cid, x]) => `${school(secs.find(s => s.track.case_id === cid).school.school_id).name}: ${answered(x)} of ${Object.keys(x).length}`).join(' · '); }
  count();
  $('#fc-print').onclick = () => window.print();
  $('#fc-submit').onclick = () => {
    const a = collect(), lacking = Object.entries(a).filter(([, x]) => !answered(x)).map(([cid]) => school(secs.find(s => s.track.case_id === cid).school.school_id).name);
    if (lacking.length) { toast('Answer at least one question for each school', lacking); return; }
    Object.entries(a).forEach(([cid, x]) => saveFieldAnswers(cid, x));   // stored now, so a reload does not lose the officer's entries
    pending[inv] = a; run("UPDATE full_runs SET stage = 'policy', updated = datetime('now') WHERE inv_id = ?", [inv]); save(); render();
  };
}

/* ---- final screen ---- */
function finalView(body, inv, row) {
  const o = row.out, C = o.comparison, cols = o.budget.columns, keep = o.budget.keep, best = new Set();
  const winnerId = o.recommended === 'keep' ? null : o.recommended, mark = (fn, dir) => { const v = cols.map(fn), ok = v.filter(n => n != null); if (ok.length < 2 || new Set(ok).size === 1) return new Set(); const t = dir === 'low' ? Math.min(...ok) : Math.max(...ok); return new Set(v.map((n, i) => (n === t ? i : -1)).filter(i => i >= 0)); };
  const opt = id => C.options.find(x => x.school_id === id), rank = id => { const i = o.ranking.indexOf(id); return i < 0 ? 'Not workable' : '#' + (i + 1); };
  const rows = [
    ['Rank (fewest concerns, then walk, then cost)', c => `<b>${rank(c.school_id)}</b>`, null],
    ['Free seats for the students', c => `${opt(c.school_id).seats_available} for ${o.students} ${opt(c.school_id).enough_seats ? '<span class="yes">✓</span>' : '<span class="no">✗</span>'}`, c => opt(c.school_id).seats_available, 'high'],
    ['Walk', c => `about ${opt(c.school_id).walk_min} min (${opt(c.school_id).walk_km} km)${opt(c.school_id).estimated ? '*' : ''}`, c => opt(c.school_id).walk_min, 'low'],
    ['Confirmed concerns', c => `${opt(c.school_id).confirmed_concerns} of ${opt(c.school_id).concerns_total}`, c => opt(c.school_id).confirmed_concerns, 'low'],
    ['Citizens supporting merging', c => `${c.stance.support} support · ${c.stance.oppose} do not (${c.stance.messages} messages)`, c => c.stance.support - c.stance.oppose, 'high'],
    ['Citizen claims checked', c => (c.claims ? `${c.claims.supported} supported · ${c.claims.contradicted} contradicted · ${c.claims.unchecked} unchecked` : '—'), null],
    ['Policies selected', c => (c.items.length ? c.items.map(i => esc(i.title)).join('<br>') : 'None needed'), null],
    ['First-year cost', c => `<b>${c.firstYear ? inr(c.firstYear) : 'No cost'}</b>`, c => c.firstYear, 'low'],
    ['Three-year cost', c => `<b>${c.threeYear ? inr(c.threeYear) : 'No cost'}</b>`, c => c.threeYear, 'low'],
  ];
  const rec = o.recommended === 'keep';
  body.innerHTML = `<section class="card fcrec"><div class="eyebrow">Recommendation · a suggestion, the officer decides</div><h2 style="font-size:28px;margin:2px 0 4px">${esc(o.recommended_name)}</h2>
      ${rec ? `<p class="lead">If the merger goes ahead, the best candidate is <b>${esc(o.best_if_merge_name)}</b>.</p>` : `<p class="lead">Closing ${esc(o.closing_school)} and moving its ${o.students} students to <b>${esc(o.recommended_name)}</b>.</p>`}
      <ul class="rsent">${o.reasons.map(r => `<li>${esc(r.text)} ${(r.refs || []).map(cite).join('')}</li>`).join('')}</ul>
      <div class="row" style="margin-top:8px"><span class="small muted">Prepared by Full control (${esc(o.mode)}). Nothing is submitted.</span><span class="actions"><button class="btn primary" id="fc-adopt">${rec ? 'Adopt: keep and repair' : 'Adopt this recommendation'}</button><a class="btn" href="#/case/${inv}/report">Open the Report step to edit and submit</a></span></div></section>
    <section class="card"><h2>Why: the candidates side by side</h2><div class="cmpwrap"><table class="cmptbl" id="fc-compare"><thead><tr><th></th>${cols.map(c => `<th class="${winnerId === c.school_id ? 'chosen' : ''}"><div class="oh"><b>${esc(c.name)}</b>${winnerId === c.school_id ? '<span class="pill s-pending">Recommended</span>' : ''}</div></th>`).join('')}</tr></thead>
      <tbody>${rows.map(([l, cell, val, dir]) => { const b = val ? mark(val, dir) : new Set(); return `<tr><th scope="row">${l}</th>${cols.map((c, i) => `<td class="${b.has(i) ? 'best' : ''}">${cell(c)}</td>`).join('')}</tr>`; }).join('')}</tbody></table></div><p class="small muted">Green marks the best value in a row. * straight-line estimate. Numbers come from the case record and tools.</p>
      <div class="fcwhy">${o.why_not.map(w => `<div class="fcwhycard"><b>${winnerId === w.school_id ? 'Runner-up' : winnerId ? 'Why not ' + esc(w.name) : esc(w.name)}</b><ul>${w.points.map(p => `<li>${esc(p)}</li>`).join('')}</ul></div>`).join('')}${rec ? `<div class="fcwhycard"><b>Why keep ${esc(o.closing_school)}</b><ul><li>Every workable candidate is beyond the ${o.walk_limit_km} km walking limit and has confirmed concerns (see the table).</li></ul></div>` : ''}</div>
      ${fold('What would change the recommendation', `<ul class="rsent">${o.would_change.map(r => `<li>${esc(r.text)}</li>`).join('')}</ul>`, { id: 'fc-wc' })}</section>
    <section class="card" id="fc-budget"><h2>Budget <small>from the cost calculator</small></h2><div class="cmpwrap"><table class="cmptbl"><thead><tr><th></th>${cols.map(c => `<th><b>${esc(c.name)}</b></th>`).join('')}${keep ? `<th><b>Keep and repair ${esc(o.closing_school)}</b></th>` : ''}</tr></thead><tbody>
      <tr><th scope="row">Selected policies</th>${cols.map(c => `<td>${c.items.length ? c.items.map(i => `<div><b>${esc(i.title)}</b><br>${i.cost_inr ? `${inr(i.cost_inr)} ${esc(i.cost_type)}` : 'No new cost'} <span class="small muted">${esc(i.formula)}</span><div class="small muted">${esc(i.reason)}</div></div>`).join('') : 'None needed'}</td>`).join('')}${keep ? `<td><b>${esc(keep.title)}</b><br>${inr(keep.cost_inr)} ${esc(keep.cost_type)} <span class="small muted">${esc(keep.formula || '')}</span></td>` : ''}</tr>
      <tr><th scope="row">Per year</th>${cols.map(c => `<td><b>${c.yearly ? inr(c.yearly) : 'No cost'}</b></td>`).join('')}${keep ? '<td>—</td>' : ''}</tr>
      <tr><th scope="row">One-time</th>${cols.map(c => `<td><b>${c.oneTime ? inr(c.oneTime) : 'No cost'}</b></td>`).join('')}${keep ? `<td><b>${keep.cost_type === 'one-time' ? inr(keep.cost_inr) : 'No cost'}</b></td>` : ''}</tr>
      <tr><th scope="row">First-year total</th>${cols.map((c, i) => `<td><b>${c.firstYear ? inr(c.firstYear) : 'No cost'}</b></td>`).join('')}${keep ? `<td><b>${inr(keep.cost_inr)}</b></td>` : ''}</tr>
      <tr><th scope="row">Three-year total</th>${cols.map(c => `<td><b>${c.threeYear ? inr(c.threeYear) : 'No cost'}</b></td>`).join('')}${keep ? `<td><b>${inr(keep.cost_inr)}</b></td>` : ''}</tr></tbody></table></div><p class="small muted">Three-year total = yearly costs counted three times plus one-time costs. Policies were chosen by a fixed rule: for each confirmed concern, the cheapest intervention that addresses it.</p></section>
    <section class="card" id="fc-report"><div class="row"><h2 style="margin:0">Full report <small>for ${esc(o.best_if_merge_name)}${rec ? ' (if the merger goes ahead)' : ''}</small></h2><span class="actions"><span class="pill ${o.report.critique.pass ? 's-green' : 's-amber'}">${o.report.critique.pass ? 'Checked: every sentence cited' : 'Critic notes: ' + o.report.critique.issues.length}</span><button class="btn sm" id="fc-dl">Download text</button><button class="btn sm" id="fc-print2">Print or save as PDF</button></span></div>
      ${o.report.sections.map(s => `<h3 style="margin:12px 0 4px">${esc(s.title)}</h3><ul class="rsent">${s.sentences.map(x => `<li>${esc(x.text)} ${(x.refs || []).map(cite).join('')}</li>`).join('')}</ul>`).join('')}</section>
    ${fold('Open issues', `<ul class="rsent">${o.open_issues.length ? o.open_issues.map(t => `<li>${esc(t)}</li>`).join('') : '<li>None</li>'}</ul>`, { id: 'fc-open', count: o.open_issues.length })}
    ${fold('How the AI got here (log)', logBox(row), { id: 'fc-log-fold2', count: row.log.length })}
    <section class="card"><h2>Look at the work</h2><p class="small muted">Each candidate has its full step-by-step research.</p><div class="row" style="justify-content:flex-start;gap:8px;flex-wrap:wrap">${cols.map(c => `<a class="btn sm" href="#/case/${inv}/evidence" data-look="${c.school_id}">${esc(c.name)}: Evidence and transport plan</a>`).join('')}<a class="btn sm" href="#/case/${inv}/feedback">Feedback and claim checks</a><a class="btn sm" href="#/case/${inv}/investigate">Findings and field answers</a><a class="btn sm" href="#/case/${inv}/policy">Policies and costs</a></div></section>`;
  $('#fc-adopt').onclick = () => { const id = adoptRecommendation(inv); toast(id ? 'Recommendation adopted' : 'Keep and repair adopted', [id ? `${school(id).name} recorded as your choice. Submit from the Report step.` : 'Recorded. Nothing was submitted.']); render(); };
  const header = `PathShala Full control report: ${o.closing_school}`;
  $('#fc-dl').onclick = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([reportText(o, header)], { type: 'text/plain' })); a.download = `pathshala-${inv}-report.txt`; a.click(); };
  $('#fc-print2').onclick = () => window.print();
}
