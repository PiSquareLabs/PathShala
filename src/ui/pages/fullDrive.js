import { adoptRecommendation, fieldForm, fullRow, needsWork, nextAfter, policyChoice, reopenReport, reportText, runWork, selectBestPolicies, submitFieldForm } from '../../agent/fullControl.js';
import { tracks } from '../../case/options.js';
import { $, $$, esc, inr, school } from '../helpers.js';
import { fold } from '../kit.js';
import { render } from '../router.js';
import { toast } from '../toast.js';
import { fieldQ } from './investigate.js';
import { activeTrack } from './options.js';

/* Full control drives the ordinary case screens. The banner says what the AI just did and what comes next;
   the working panel shows a screen's automatic work; the field form is where the flow waits for the officer. */
let timer = null; const paused = new Set(), running = new Set();
export const clearFullTimer = () => { if (timer) clearInterval(timer); timer = null; };
const cite = r => `<span class="cite">${esc(r)}</span>`;
const logBox = row => `<div class="fclog" id="fc-log" role="log">${row.log.slice(-40).map(l => `<div><small>${esc(l.t)}</small> ${esc(l.text)}</div>`).join('')}</div>`;
const appendLog = text => { const b = $('#fc-log'); if (b) { b.insertAdjacentHTML('beforeend', `<div>${esc(text)}</div>`); b.scrollTop = b.scrollHeight; } };

const MSG = {
  compare: 'The AI chose the candidate schools by screening score.',
  feedback: 'The AI classified the citizen feedback, summarised it and checked the claims for each school.',
  evidence: 'The AI planned the transport for each school (route, timetable, stops, policy, cost).',
  'investigate:field': 'The AI investigated every school and generated the field form. It is waiting for the field officer.',
  'investigate:policy': 'The field answers are recorded and the evidence is updated.',
  policy: 'The AI picked the best policies for each school and priced them.',
  report: 'The final recommendation, comparison and report are ready. The officer decides.',
};
/* The whole run at a glance: who does each stage (AI or you) and where it is now. */
const PHASES = [['Closing school', 'You'], ['Candidate schools', 'AI'], ['Citizen feedback', 'AI'], ['Evidence and transport', 'AI'], ['Investigation', 'AI'], ['Field form', 'You'], ['Policies and budget', 'AI'], ['Report and comparison', 'AI']];
function phaseNow(inv, f) {
  if (f.stage === 'final') return 8; if (f.stage === 'report') return 7; if (f.stage === 'policy' || f.stage === 'answered') return 6; if (f.stage === 'field') return 5;
  return needsWork(inv, 'feedback') ? 2 : needsWork(inv, 'evidence') ? 3 : 4;
}
export function fullTracker(inv) {
  const f = fullRow(inv), cur = phaseNow(inv, f), yours = cur === 5;
  return `<ol class="fctrack" id="fc-track" aria-label="Full control progress">${PHASES.map(([l, who], i) => `<li class="${i < cur ? 'done' : i === cur ? (who === 'You' ? 'you' : 'now') : ''}"><span class="fcwho">${i < cur ? '✓' : who}</span>${l}</li>`).join('')}</ol>
    <p class="small muted fcsay">${cur >= 8 ? 'Everything the AI can do is finished. Read the recommendation, edit anything you disagree with, and decide.' : yours ? '<b>Your turn.</b> This is the only stop: fill in the field form below. Everything after it runs by itself.' : `The AI runs every screen and moves on by itself. <b>You do not need to click Next.</b> It stops once, at the field form.`}</p>`;
}
export function fullBanner(inv, step) {
  const f = fullRow(inv); if (!f) return '';
  const nx = nextAfter(inv, step), waiting = f.stage === 'field' && ['policy', 'report'].includes(step);
  const key = step === 'investigate' ? (f.stage === 'field' ? 'investigate:field' : f.stage === 'policy' ? 'investigate:policy' : 'investigate') : step;
  const text = waiting ? 'Waiting for the field form on the Investigate step. The policies and the report follow after it.' : needsWork(inv, step) ? 'The AI is working on this screen…' : (MSG[key] || 'Full control is on. Use the steps above to look around.');
  const label = { feedback: 'Feedback', evidence: 'Evidence', investigate: 'Investigate', policy: 'Policy and cost', report: 'Report' }[nx];
  return `<div class="fcbanner" id="fc-banner" role="status"><span class="pill s-green">Full control</span><span>${esc(text)}</span>${nx && nx !== 'wait' ? `<span class="fcnext"><span id="fc-count"></span><button class="btn sm primary" id="fc-now">Skip ahead: ${label}</button><button class="btn sm" id="fc-pause">Pause</button></span>` : ''}${waiting ? `<a class="btn sm" href="#/case/${inv}/investigate">Go to the field form</a>` : ''}</div>${fullTracker(inv)}`;
}
/* Wire the banner and start the countdown to the next screen. */
export function fullWire(inv, step) {
  clearFullTimer(); const nx = nextAfter(inv, step); if (!nx || nx === 'wait' || !$('#fc-now')) return;
  const go_ = () => { clearFullTimer(); location.hash = `#/case/${inv}/${nx}`; };
  $('#fc-now').onclick = go_;
  let left = step === 'investigate' && nx === 'policy' ? 5 : nx === 'report' ? 20 : 4; const show = () => { const c = $('#fc-count'); if (c) c.textContent = paused.has(inv) ? 'Paused' : `Moving on in ${left}s`; };
  const pb = $('#fc-pause'); pb.onclick = () => { paused.has(inv) ? paused.delete(inv) : paused.add(inv); pb.textContent = paused.has(inv) ? 'Resume' : 'Pause'; show(); }; pb.textContent = paused.has(inv) ? 'Resume' : 'Pause';
  if (nx === 'report') { const pauseEdit = () => { if (!paused.has(inv)) { paused.add(inv); pb.textContent = 'Resume'; show(); } }; $('#cmain')?.addEventListener('change', pauseEdit); }
  show(); timer = setInterval(() => { if (paused.has(inv)) return; left--; if (left <= 0) go_(); else show(); }, 1000);
}

/* A screen whose automatic work has not been done: run it, showing the log, then draw the real screen. */
export function workingPanel(main, inv, step) {
  const f = fullRow(inv), key = inv + step + f.stage; if (running.has(key)) { main.innerHTML = `<div class="card"><h2>The AI is working on this screen</h2>${logBox(f)}</div>`; return; }
  running.add(key);
  main.innerHTML = `<div class="card"><h2>The AI is working on this screen</h2><p class="small muted">Each line is a logged step. The screen appears when the work is finished.</p>${logBox(f)}<p class="small muted" id="fc-wait">Working…</p></div>`;
  runWork(inv, step, appendLog).then(() => { running.delete(key); render(); }).catch(e => { console.error(e); running.delete(key); appendLog('Failed: ' + e.message); const w = $('#fc-wait'); if (w) w.innerHTML = `<span class="t-red">${esc(e.message)}</span> <button class="btn sm" id="fc-retry">Try again</button>`; const r = $('#fc-retry'); if (r) r.onclick = () => render(); toast('Full control stopped', [String(e.message || e)]); });
}

export function fieldInto(body, inv) {
  const row = fullRow(inv), secs = fieldForm(inv), A = school(secs[0].track.from_id);
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
    submitFieldForm(inv, a); render();
  };
}


export function finalInto(body, inv) {
  const row = fullRow(inv), o = row.out, C = o.comparison, cols = o.budget.columns, keep = o.budget.keep, best = new Set();
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
      <div class="row" style="margin-top:8px"><span class="small muted">Prepared by Full control (${esc(o.mode)}). Nothing is submitted.</span><span class="actions"><button class="btn primary" id="fc-adopt">${rec ? 'Adopt: keep and repair' : 'Adopt this recommendation'}</button></span></div></section>
    <section class="card"><h2>Why: the candidates side by side</h2><div class="cmpwrap"><table class="cmptbl" id="fc-compare"><thead><tr><th></th>${cols.map(c => `<th class="${winnerId === c.school_id ? 'chosen' : ''}"><div class="oh"><b>${esc(c.name)}</b>${winnerId === c.school_id ? '<span class="pill s-pending">Recommended</span>' : ''}</div></th>`).join('')}</tr></thead>
      <tbody>${rows.map(([l, cell, val, dir]) => { const b = val ? mark(val, dir) : new Set(); return `<tr><th scope="row">${l}</th>${cols.map((c, i) => `<td class="${b.has(i) ? 'best' : ''}">${cell(c)}</td>`).join('')}</tr>`; }).join('')}</tbody></table></div><p class="small muted">Green marks the best value in a row. * straight-line estimate. Numbers come from the case record and tools.</p>
      <div class="fcwhy">${o.why_not.map(w => `<div class="fcwhycard"><b>${winnerId === w.school_id ? 'Runner-up' : winnerId ? 'Why not ' + esc(w.name) : esc(w.name)}</b><ul>${w.points.map(p => `<li>${esc(p)}</li>`).join('')}</ul></div>`).join('')}${rec ? `<div class="fcwhycard"><b>Why keep ${esc(o.closing_school)}</b><ul><li>Every workable candidate is beyond the ${o.walk_limit_km} km walking limit and has confirmed concerns (see the table).</li></ul></div>` : ''}</div>
      ${fold('What would change the recommendation', `<ul class="rsent">${o.would_change.map(r => `<li>${esc(r.text)}</li>`).join('')}</ul>`, { id: 'fc-wc' })}</section>
    <section class="card" id="fc-budget"><h2>Budget <small>from the cost calculator</small></h2><div class="cmpwrap"><table class="cmptbl"><thead><tr><th></th>${cols.map(c => `<th><b>${esc(c.name)}</b></th>`).join('')}${keep ? `<th><b>Keep and repair ${esc(o.closing_school)}</b></th>` : ''}</tr></thead><tbody>
      <tr><th scope="row">Selected policies</th>${cols.map(c => `<td>${c.items.length ? c.items.map(i => `<div><b>${esc(i.title)}</b><br>${i.cost_inr ? `${inr(i.cost_inr)} ${esc(i.cost_type)}` : 'No new cost'} <span class="small muted">${esc(i.formula)}</span><div class="small muted">${esc(i.reason)}</div></div>`).join('') : 'None needed'}</td>`).join('')}${keep ? `<td><b>${esc(keep.title)}</b><br>${inr(keep.cost_inr)} ${esc(keep.cost_type)} <span class="small muted">${esc(keep.formula || '')}</span></td>` : ''}</tr>
      <tr><th scope="row">Per year</th>${cols.map(c => `<td><b>${c.yearly ? inr(c.yearly) : 'No cost'}</b></td>`).join('')}${keep ? '<td>—</td>' : ''}</tr>
      <tr><th scope="row">One-time</th>${cols.map(c => `<td><b>${c.oneTime ? inr(c.oneTime) : 'No cost'}</b></td>`).join('')}${keep ? `<td><b>${keep.cost_type === 'one-time' ? inr(keep.cost_inr) : 'No cost'}</b></td>` : ''}</tr>
      <tr><th scope="row">First-year total</th>${cols.map((c, i) => `<td><b>${c.firstYear ? inr(c.firstYear) : 'No cost'}</b></td>`).join('')}${keep ? `<td><b>${inr(keep.cost_inr)}</b></td>` : ''}</tr>
      <tr><th scope="row">Three-year total</th>${cols.map(c => `<td><b>${c.threeYear ? inr(c.threeYear) : 'No cost'}</b></td>`).join('')}${keep ? `<td><b>${inr(keep.cost_inr)}</b></td>` : ''}</tr></tbody></table></div><ul class="rsent" id="fc-budget-notes">${o.budget_notes.map(t => `<li>${esc(t)}</li>`).join('')}</ul><p class="small muted">Three-year total = yearly costs counted three times plus one-time costs. Policies were chosen by a fixed rule: for each confirmed concern, the cheapest intervention that addresses it.</p></section>
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

/* The Policy screen in Full control: what the AI chose for this school and why. Every tick can still be changed. */
export function policyWhy(target, inv) {
  const c = activeTrack(inv);
  const ch = policyChoice(c.case_id); if (!ch) return;
  $$('.ivc', target).forEach(card => {
    const code = card.querySelector('input[data-c]')?.dataset.c, x = ch.by[code]; if (!x) return;
    card.querySelector('.ivtop').insertAdjacentHTML('afterend', `<div class="aiwhy ${x.chosen ? '' : 'no'}" data-code="${esc(code)}"><b>${x.chosen ? 'The AI chose this' : 'The AI did not choose this'}${ch.mode === 'Gemini' ? ' (Gemini)' : ''}:</b> ${esc(x.reason)}</div>`);
  });
  const n = Object.values(ch.by).filter(x => x.chosen).length;
  target.insertAdjacentHTML('afterbegin', `<section class="card aipick" id="fc-pick"><div class="eyebrow">The AI picked the best policies for this school${ch.mode === 'Gemini' ? ' (Gemini)' : ' (rules)'}</div>
    <p style="margin:2px 0">${n ? `${n} chosen out of ${Object.keys(ch.by).length}.` : 'None needed for this school.'} The reason is under each option. <b>Tick or untick any option to change it</b>; the totals and the report use your final ticks. The flow moves on by itself unless you change something.</p>
    <div class="row" style="justify-content:flex-start;gap:8px"><button class="btn sm" id="fc-reset-pick">Put back the AI's choice</button><span class="small muted" id="fc-pick-note"></span></div></section>`);
  $('#fc-reset-pick').onclick = async () => { await selectBestPolicies(c.case_id); render(); };
  $$('.ivsel input', target).forEach(i => i.addEventListener('change', () => { const n_ = $('#fc-pick-note'); if (n_) n_.textContent = 'You changed the AI’s choice. The report will use your ticks.'; const f = fullRow(inv); if (f.stage === 'final') { reopenReport(inv); } }));
}
