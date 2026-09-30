import { adoptRecommendation, fieldForm, fullRow, needsWork, nextAfter, nextWork, policyChoice, reopenReport, reportText, runWork, selectBestPolicies, submitFieldForm } from '../../agent/fullControl.js';
import { feedItems, feedNow, feedPing, feedPush, feedSet, mountFeed, onFeed } from '../aiFeed.js';
import { tracks } from '../../case/options.js';
import { $, $$, esc, inr, school } from '../helpers.js';
import { fold } from '../kit.js';
import { render } from '../router.js';
import { toast } from '../toast.js';
import { fieldQ } from './investigate.js';
import { activeTrack } from './options.js';

/* Full control drives the ordinary case screens. The banner says what the AI just did and what comes next;
   the working panel shows a screen's automatic work; the field form is where the flow waits for the officer. */
let timer = null; const paused = new Set();
export const clearFullTimer = () => { if (timer) clearInterval(timer); timer = null; };
const cite = r => `<span class="cite">${esc(r)}</span>`;
const logBox = row => `<div class="fclog" id="fc-log" role="log">${row.log.slice(-40).map(l => `<div><small>${esc(l.t)}</small> ${esc(l.text)}</div>`).join('')}</div>`;

/* Background runner: the AI keeps working whichever screen the officer is on. Each finished step re-draws a waiting screen. */
const bgRunning = new Set(), bgFailed = new Map();
const STAGE_SAY = { feedback: 'Reading what people say about each school', evidence: 'Planning how the children could travel', investigate: 'Studying each school and preparing the field form', policy: 'Choosing the policies and working out the costs', report: 'Comparing the schools and writing the report' };
const redrawIfWaiting = () => { if ($('#fc-wait')) render(); };
export function bgEnsure(inv) {
  if (bgRunning.has(inv) || bgFailed.has(inv) || !fullRow(inv)) return;
  const tried = new Set(); if (!nextWork(inv, tried)) return;
  if (!feedItems(inv).length) fullRow(inv).log.slice(-6).forEach(l => feedPush(inv, { level: 'stage', text: l.text }));
  bgRunning.add(inv);
  (async () => {
    try {
      let step;
      while ((step = nextWork(inv, tried))) {
        tried.add(step + ':' + fullRow(inv).stage);
        feedPush(inv, { level: 'stage', text: STAGE_SAY[step] });
        await runWork(inv, step, (text, meta = {}) => { if (meta.update != null) { feedSet(inv, meta.update, { state: meta.state, summary: meta.summary }); return undefined; } return feedPush(inv, { text, ...meta }); });
        if (needsWork(inv, step)) throw new Error('this step did not finish');
        redrawIfWaiting();
      }
    } catch (e) { console.error(e); bgFailed.set(inv, String(e.message || e)); feedPush(inv, { level: 'stage', text: 'Something went wrong: ' + (e.message || e) }); toast('The AI stopped', [String(e.message || e)]); }
    finally { bgRunning.delete(inv); feedPing(); redrawIfWaiting(); }
  })();
}
export const bgBusy = inv => bgRunning.has(inv);

const MSG = {
  compare: 'The AI picked the candidate schools. It is already researching them in the background.',
  feedback: 'The AI read what people say about each school and checked it against the records.',
  evidence: 'The AI planned how the children could travel to each school.',
  'investigate:field': 'The AI studied every school and wrote the field form. It is waiting for the field officer.',
  'investigate:policy': 'The field answers are recorded and the picture is updated.',
  policy: 'The AI chose the policies for each school and worked out the costs.',
  report: 'The recommendation, comparison and report are ready. The officer decides.',
};
/* Top of every Full control screen: what is happening, and only the next step. */
export function fullBanner(inv, step) {
  const f = fullRow(inv); if (!f) return '';
  const nx = nextAfter(inv, step), waiting = f.stage === 'field' && ['policy', 'report'].includes(step);
  const key = step === 'investigate' ? (f.stage === 'field' ? 'investigate:field' : ['policy', 'report', 'final'].includes(f.stage) ? 'investigate:policy' : 'investigate') : step;
  const working = needsWork(inv, step), busy = bgRunning.has(inv);
  const text = waiting ? 'Waiting for the field form on the Investigate step. The policies and the report follow after it.' : working ? 'The AI is gathering this screen…' : (MSG[key] || 'Full control is on.');
  const label = { feedback: 'Feedback', evidence: 'Evidence', investigate: 'Investigate', policy: 'Policy and cost', report: 'Report' }[nx];
  const say = f.stage === 'final' ? 'Everything the AI can do is finished. Read the recommendation, edit anything you disagree with, and decide.' : f.stage === 'field' ? '<b>Your turn.</b> This is the only stop: fill in the field form. Everything after it runs by itself.' : 'The AI does the research in the background and takes you to the next step. <b>You do not need to click Next.</b> It stops once, at the field form.';
  return `<div class="fcbanner" id="fc-banner" role="status"><span class="pill s-green">Full control</span><span>${esc(text)}${busy && !working ? ` <span class="muted">Now: <span id="fc-bgnow">${esc(feedNow(inv))}</span></span>` : ''}</span>${nx && nx !== 'wait' ? `<span class="fcnext"><span id="fc-count"></span><button class="btn sm primary" id="fc-now">Next: ${label} →</button><button class="btn sm" id="fc-pause">Pause</button></span>` : ''}${waiting ? `<a class="btn sm" href="#/case/${inv}/investigate">Go to the field form</a>` : ''}</div><p class="small muted fcsay">${say}</p>`;
}
/* Wire the banner and start the countdown to the next screen. */
export function fullWire(inv, step) {
  clearFullTimer(); const live = $('#fc-bgnow'); if (live) { const off = onFeed(() => { if (!live.isConnected) off(); else live.textContent = feedNow(inv); }); }
  const nx = nextAfter(inv, step); if (!nx || nx === 'wait' || !$('#fc-now')) return;
  const go_ = () => { clearFullTimer(); location.hash = `#/case/${inv}/${nx}`; };
  $('#fc-now').onclick = go_;
  let left = nx === 'report' ? 20 : step === 'compare' ? 12 : step === 'investigate' ? 5 : 8; const show = () => { const c = $('#fc-count'); if (c) c.textContent = paused.has(inv) ? 'Paused' : `Moving on in ${left}s`; };
  const pb = $('#fc-pause'); pb.onclick = () => { paused.has(inv) ? paused.delete(inv) : paused.add(inv); pb.textContent = paused.has(inv) ? 'Resume' : 'Pause'; show(); }; pb.textContent = paused.has(inv) ? 'Resume' : 'Pause';
  if (nx === 'report') { const pauseEdit = () => { if (!paused.has(inv)) { paused.add(inv); pb.textContent = 'Resume'; show(); } }; $('#cmain')?.addEventListener('change', pauseEdit); }
  show(); timer = setInterval(() => { if (paused.has(inv)) return; left--; if (left <= 0) go_(); else show(); }, 1000);
}

/* A screen whose work is not finished yet: show what the AI is doing right now (it keeps running in the background). */
export function workingPanel(main, inv, step) {
  const err = bgFailed.get(inv);
  main.innerHTML = `<div class="card" id="fc-wait"><h2>The AI is researching for you</h2><p class="fcdoing" id="fc-doing" aria-live="polite">${esc(err ? 'Something went wrong' : feedNow(inv) || 'Getting started…')}</p>
    <div class="thinkbox" id="fc-think"></div>
    ${err ? `<p class="t-red small">${esc(err)}</p><button class="btn sm" id="fc-retry">Try again</button>` : '<p class="small muted">You do not need to click anything. It continues in the background, and this screen fills in when it is done.</p>'}</div>`;
  mountFeed($('#fc-think'), inv, { max: 30 });
  const d = $('#fc-doing'); if (d && !err) { const off = onFeed(() => { if (!d.isConnected) off(); else d.textContent = feedNow(inv) || d.textContent; }); }
  const r = $('#fc-retry'); if (r) r.onclick = () => { bgFailed.delete(inv); render(); };
  if (!err) bgEnsure(inv);
}
/* A small live box at the bottom of the page while the AI works in the background and the officer looks at another screen. */
export function fullDock(inv) { return fullRow(inv) ? `<aside class="dock" id="ai-dock" hidden><button class="dockhd" id="dock-hd" aria-expanded="false"><span class="dockdot"></span><b>The AI is working</b><span class="small muted" id="dock-now"></span></button><div class="dockbody" id="dock-body" hidden></div></aside>` : ''; }
export function wireDock(inv) {
  const box = $('#ai-dock'); if (!box) return;
  const hd = $('#dock-hd'), body = $('#dock-body'); let open = false;
  const show = () => { if (!box.isConnected) { off(); return; } box.hidden = !(bgRunning.has(inv) && !$('#fc-wait')); $('#dock-now').textContent = feedNow(inv); };
  const off = onFeed(show); show();
  hd.onclick = () => { open = !open; hd.setAttribute('aria-expanded', open); body.hidden = !open; if (open) mountFeed(body, inv, { max: 8 }); };
}

export function fieldInto(body, inv) {
  const row = fullRow(inv), secs = fieldForm(inv), A = school(secs[0].track.from_id);
  body.innerHTML = `<div class="card" id="fc-form"><div class="row no-print"><h2 style="margin:0">3 · Field verification form <small>the AI stops here: the field officer enters the answers</small></h2><span class="actions"><button class="btn" id="fc-demo-fill" title="Fill every question with sample answers for a demo">Fill demo answers</button><button class="btn" id="fc-print">Print blank form</button></span></div>
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
  // demo helper: sample answers for every question (they differ a little by school), so the form passes its check
  $('#fc-demo-fill').onclick = () => $$('.fcsec', body).forEach((sec, i) => $$('.fq', sec).forEach(el => {
    const opts = $$('.opts button', el).map(b => b.dataset.v), q = el.dataset.q, fv = $('.fv', el), note = $('.fnote', el);
    const pick = q === 'Q1' ? ['No', 'Seasonal', 'Yes'][i % 3] : q === 'Q3' ? ['No', 'No', 'Yes'][i % 3] : ['Confirmed', 'Not confirmed', 'Confirmed'][i % 3];
    if (opts.length) { const b = $$('.opts button', el).find(x => x.dataset.v === pick) || $$('.opts button', el)[0]; b.click(); }
    else if (fv) { fv.value = /minute|time/i.test(fv.closest('.fq').textContent) ? String(35 + i * 10) : String(secs[0].school && school(secs[0].track.from_id).enrol_total || 20); fv.dispatchEvent(new Event('input')); }
    if (note && !note.value) note.value = 'Demo answer'; note?.dispatchEvent(new Event('input'));
  }));
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
    ['Free seats for the students', c => `${opt(c.school_id).seats_available} for ${o.students} ${opt(c.school_id).enough_seats ? '<span class="yes">✓</span>' : '<span class="no">✗</span>'}`, c => opt(c.school_id).seats_available, 'high'],
    ['Walk', c => `about ${opt(c.school_id).walk_min} min (${opt(c.school_id).walk_km} km)${opt(c.school_id).estimated ? '*' : ''}`, c => opt(c.school_id).walk_min, 'low'],
    ['Terrain on the way', c => { const t = opt(c.school_id).terrain || [], d = opt(c.school_id).elev_diff_m; return (t.length ? t.map(esc).join('<br>') : 'None recorded') + (d != null && Math.abs(d) >= 100 ? `<div class="small muted">${Math.abs(d)} m ${d > 0 ? 'uphill' : 'downhill'} overall</div>` : ''); }, c => (opt(c.school_id).terrain || []).length, 'low'],
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
      ${fold('How the score is worked out', `<div class="cmpwrap"><table class="cmptbl" id="fc-score"><thead><tr><th>Criterion (weight)</th>${cols.map(c => `<th>${esc(c.name)}</th>`).join('')}</tr></thead><tbody>${Object.entries(o.weights).map(([k, w]) => `<tr><th scope="row">${{ walk: 'Walking time', concerns: 'Confirmed concerns', cost: 'First-year cost', community: 'Community support', terrain: 'Terrain at the receiving school' }[k]} (${w})</th>${cols.map(c => `<td>${o.scores[c.school_id] ? o.scores[c.school_id].parts[k].pts : '—'}</td>`).join('')}</tr>`).join('')}<tr><th scope="row">Weighted total</th>${cols.map(c => `<td><b>${o.scores[c.school_id]?.total ?? '—'}</b></td>`).join('')}</tr></tbody></table></div><p class="small muted">Each criterion is scored 0 to 100 from tool numbers and weighted. Schools without enough seats are not scored. A different weighting could change the order.</p>`, { id: 'fc-score-fold' })}
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
    <p style="margin:2px 0">${n ? '' : 'No intervention is needed for this school. '}The reason for each option is written under it. <b>Tick or untick any option to change it</b>; the totals and the report use your final ticks. The flow moves on by itself unless you change something.</p>
    <div class="row" style="justify-content:flex-start;gap:8px"><button class="btn sm" id="fc-reset-pick">Put back the AI's choice</button><span class="small muted" id="fc-pick-note"></span></div></section>`);
  $('#fc-reset-pick').onclick = async () => { await selectBestPolicies(c.case_id); render(); };
  $$('.ivsel input', target).forEach(i => i.addEventListener('change', () => { const n_ = $('#fc-pick-note'); if (n_) n_.textContent = 'You changed the AI’s choice. The report will use your ticks.'; const f = fullRow(inv); if (f.stage === 'final') { reopenReport(inv); } }));
}
