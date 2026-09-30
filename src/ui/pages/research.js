import { plainStep } from '../../agent/plain.js';
import { runResearch, runSuggestion, acceptSuggestion, ignoreSuggestion, addFieldQuestions, suggestionRow } from '../../agent/research.js';
import { MAX_STEPS, modeName, savedRun } from '../../agent/loop.js';
import { $, $$, esc, inr } from '../helpers.js';
import { fold } from '../kit.js';
import { render } from '../router.js';
import { toast } from '../toast.js';

const ST = { verified: 's-green', calculated: 's-green', reported: 's-amber', 'needs verification': 's-pending' };
const j = v => esc(typeof v === 'string' ? v : JSON.stringify(v, null, 1));
const badge = m => `<span class="pill ${m === 'Gemini' ? 's-green' : 's-pending'}" title="${m === 'Gemini' ? 'Gemini chooses the steps and writes the wording; tools and search produce the facts' : 'Fixed rules choose the steps; search uses keywords'}">${m}</span>`;

function passageHtml(p) {
  return `<div class="pass"><div class="ph1"><b>${esc(p.id)}</b> <span class="small muted">score ${p.score}${p.semantic != null ? ` · meaning ${p.semantic}` : ''} · ${esc(p.collection)} · ${esc(p.source)}${p.date ? ' · ' + esc(p.date) : ''} · ${esc(p.place)}</span></div>
    <div class="ph2"><span class="pill">${esc(p.wording)}</span>${p.label ? ` <span class="pill s-red">${esc(p.label)}</span>` : ''}${p.url ? ` <a class="small" href="${esc(p.url)}" target="_blank" rel="noopener">link</a>` : ''}</div><p>${esc(p.text)}</p></div>`;
}
/* One step of the loop: tool or search, a one-line reason, the result, and the evidence it saved. Input, output and passages expand. */
export function stepHtml(s, ev = []) {
  const mine = ev.filter(e => e.step === s.seq);
  const body = `<div class="rio"><div class="eyebrow">Input</div><pre class="io">${j(s.input)}</pre><div class="eyebrow">Output</div><pre class="io">${j(s.output)}</pre></div>
    ${s.passages ? `<div class="eyebrow">Passages retrieved (${s.passages.length})</div>${s.passages.map(passageHtml).join('')}` : ''}
    ${mine.length ? `<div class="eyebrow">Saved as evidence</div>${mine.map(e => `<div class="revid"><b>${esc(e.eid)}</b> ${esc(e.label)} <span class="pill ${ST[e.status] || ''}">${esc(e.status)}</span><div class="small muted">${esc(e.source)}</div></div>`).join('')}` : ''}`;
  return `<li class="rstep" data-seq="${s.seq}"><details><summary><span class="rn">${s.seq}</span><span class="rk ${s.kind}">${s.kind === 'search' ? 'Search' : 'Tool'}</span><b class="rplain">${esc(plainStep(s.tool, s.input))}</b><code class="rtool">${esc(s.tool)}</code><span class="rr">${esc(s.reason || '')}</span><span class="rs small">${esc(s.summary || '')}</span></summary>${body}</details></li>`;
}
const chips = (refs, ev) => refs.map(r => `<span class="cite" title="${esc(ev.find(e => e.eid === r)?.label || r)}">${esc(r)}</span>`).join('');
const sentencesHtml = (ss, ev) => `<ul class="rsent">${ss.map(x => `<li>${esc(x.text)} ${chips(x.refs, ev)}</li>`).join('')}</ul>`;

function resultHtml(agent, run) {
  const o = run.out, ev = run.evidence;
  if (agent === 'transportPlanner' && !o.route_plan) return `<div class="rres">${sentencesHtml(o.sentences, ev)}${o.open_questions.length ? `<ul class="rq">${o.open_questions.map(x => `<li>${esc(x.text)}</li>`).join('')}</ul><button class="btn sm" data-addq="transportPlanner">Add ${o.open_questions.length} to the field questions</button>` : ''}</div>`;
  if (agent === 'transportPlanner') return `<div class="rres"><div class="rgrid"><div><span class="eyebrow">Route plan</span><b>${o.route_plan.children} children · ${o.route_plan.habitations} habitations</b><span class="small muted">${o.route_plan.road_km} km${o.route_plan.road_min ? `, about ${o.route_plan.road_min} min` : ' (estimate)'}</span></div>
      <div><span class="eyebrow">Cost</span><b>${inr(o.cost.cost_inr)} ${esc(o.cost.cost_type)}</b><span class="small muted">${esc(o.cost.formula)}</span></div>
      <div><span class="eyebrow">Policy</span><b>${o.policy ? esc(o.policy.id) : 'No source found'}</b><span class="small muted">${o.policy ? esc(o.policy.section) + ' · ' + esc(o.policy.wording) : ''}</span></div></div>
    ${fold('Pickup stops', `<table class="tbl"><thead><tr><th>Habitation</th><th>Stop</th><th>Walk to stop</th></tr></thead><tbody>${o.route_plan.stops.map(s => `<tr><td>${esc(s.habitation)}</td><td>${esc(s.stop || '—')} <span class="small muted">${esc(s.stop_type)}</span></td><td>${s.walk_to_stop_m ? s.walk_to_stop_m + ' m' : '—'}</td></tr>`).join('')}</tbody></table>`, { count: o.route_plan.stops.length, id: 'rs-stops' })}
    ${sentencesHtml(o.sentences, ev)}
    ${o.open_questions.length ? `<div class="eyebrow">Open questions</div><ul class="rq">${o.open_questions.map(x => `<li>${esc(x.text)}</li>`).join('')}</ul><button class="btn sm" data-addq="transportPlanner">Add ${o.open_questions.length} to the field questions</button>` : ''}</div>`;
  if (agent === 'feedbackChecker') {
    const by = s => o.claims.filter(c => c.status === s), row = c => `<div class="claim"><div><b>“${esc(c.text)}”</b></div><div class="small muted">${c.place ? esc(c.place) + ' · ' : ''}${c.time ? esc(c.time) + ' · ' : ''}${c.messages} message${c.messages > 1 ? 's' : ''}</div><div class="small">${esc(c.note || '')}${c.sources.length ? ' · ' + c.sources.map(s => `<span class="cite">${esc(s.label)}</span>`).join(' ') : ''}</div></div>`;
    return `<div class="rres"><div class="ccount"><span class="pill s-green">${o.counts.supported} supported</span><span class="pill s-red">${o.counts.contradicted} contradicted</span><span class="pill s-pending">${o.counts.unchecked} unchecked</span></div>${sentencesHtml(o.sentences, ev)}
      ${['contradicted', 'supported', 'unchecked'].map(s => by(s).length ? fold(`${s[0].toUpperCase() + s.slice(1)} claims`, by(s).map(row).join(''), { count: by(s).length, id: 'rs-c-' + s }) : '').join('')}
      ${o.open_questions.length ? `<div class="eyebrow">Unchecked claims become field questions</div><ul class="rq">${o.open_questions.map(x => `<li>${esc(x.text)}</li>`).join('')}</ul><button class="btn sm" data-addq="feedbackChecker">Add ${o.open_questions.length} to the field questions</button>` : ''}</div>`;
  }
  return '';
}

/* The panel of one research agent for one track. Empty until run; the saved run is shown after a reload. */
export function researchPanel(cid, agent, { title, lead }) {
  const r = savedRun(cid, agent), mode = r ? r.mode : modeName();
  return `<section class="card rsch" id="rs-${agent}" data-cid="${esc(cid)}" data-agent="${agent}">
    <div class="ivtop"><h2 style="margin:0">${esc(title)} <small>step by step</small></h2><span class="actions">${badge(mode)}<button class="btn ${r ? '' : 'primary'}" data-run="${agent}">${r ? 'Run again' : 'Run research'}</button></span></div>
    <p class="small muted">${esc(lead)} It only proposes: nothing here changes the case until you approve it. Up to ${MAX_STEPS} steps.</p>
    <ol class="rsteps" id="rl-${agent}">${r ? r.steps.map(s => stepHtml(s, r.evidence)).join('') : ''}</ol>
    <div id="rres-${agent}">${r ? `${r.out.plan ? `<p class="small muted">Plan: ${r.out.plan.map(esc).join(' → ')}. Stopped: ${esc(r.out.stop_reason)}.${r.out.fallbacks?.length ? ` <b>Gemini result not used ${r.out.fallbacks.length} time(s); the simulated step was used and logged.</b>` : ''}</p>` : ''}${resultHtml(agent, r)}${fold(`Evidence saved by this run`, r.evidence.map(e => `<div class="revid"><b>${esc(e.eid)}</b> ${esc(e.label)} <span class="pill ${ST[e.status] || ''}">${esc(e.status)}</span> <span class="small muted">${esc(e.source)}</span></div>`).join(''), { count: r.evidence.length, id: 'rs-ev-' + agent })}` : ''}</div>
  </section>`;
}

export function wireResearch(root, cid) {
  $$('[data-run]', root).forEach(b => b.onclick = async () => {
    const agent = b.dataset.run, list = $('#rl-' + agent); b.disabled = true; b.textContent = 'Researching…'; list.innerHTML = ''; $('#rres-' + agent).innerHTML = '';
    try {
      await runResearch(agent, cid, ev => {
        if (ev.type === 'start') list.insertAdjacentHTML('beforeend', `<li class="rstep busy" data-seq="${ev.seq}"><span class="rn">${ev.seq}</span><span class="rk ${ev.kind}">${ev.kind === 'search' ? 'Search' : 'Tool'}</span><b class="rplain">${esc(plainStep(ev.tool, ev.args))}…</b><code class="rtool">${esc(ev.tool)}</code><span class="rr">${esc(ev.reason || '')}</span></li>`);
        if (ev.type === 'step') { const li = list.querySelector(`[data-seq="${ev.seq}"]`); if (li) li.outerHTML = stepHtml(ev, []); }
      });
      render();
    } catch (e) { console.error(e); render(); toast('Research failed', [String(e.message || e)]); }
  });
  $$('[data-addq]', root).forEach(b => b.onclick = () => {
    const run = savedRun(cid, b.dataset.addq), n = addFieldQuestions(cid, run.out.open_questions);
    toast(n ? 'Field questions added' : 'Already in the field questions', [n ? `${n} question(s) will appear on the Investigate step` : 'Nothing new to add']); render();
  });
}

/* ---- AI suggestion, above the officer's decision on the Report step ---- */
export function suggestionPanel(inv) {
  const r = savedRun(inv, 'suggestion'), sg = suggestionRow(inv), mode = r ? r.mode : modeName();
  const o = sg?.out, ev = r?.evidence || [];
  return `<section class="card rsch sugg" id="rs-suggestion" data-inv="${esc(inv)}">
    <div class="ivtop"><h2 style="margin:0">AI suggestion <small>Suggestion. The officer decides.</small></h2><span class="actions">${badge(mode)}<button class="btn ${r ? '' : 'primary'}" data-runsg>${r ? 'Run again' : 'Get a suggestion'}</button></span></div>
    <ol class="rsteps" id="rl-suggestion">${r ? r.steps.map(s => stepHtml(s, r.evidence)).join('') : ''}</ol>
    ${o ? `<div class="sgbox"><div class="eyebrow">Suggested option</div><h3 style="margin:2px 0 6px">${esc(o.suggested_name)}</h3>
      <ul class="rsent">${o.reasons.map(x => `<li>${esc(x.text)} ${chips(x.refs, ev)}</li>`).join('')}</ul>
      ${fold('What would change the suggestion', `<ul class="rsent">${o.would_change.map(x => `<li>${esc(x.text)} ${chips(x.refs, ev)}</li>`).join('')}</ul>`, { id: 'sg-wc' })}
      ${fold('Outstanding checks', `<ul class="rsent">${o.outstanding.map(x => `<li>${esc(x.text)} ${chips(x.refs, ev)}</li>`).join('')}</ul>`, { id: 'sg-oc', count: o.outstanding.length })}
      <div class="row" style="margin-top:8px"><span class="small muted">${sg.accepted === 1 ? 'Accepted as a starting point. Press "Choose this school" below to decide.' : sg.accepted === -1 ? 'Ignored.' : 'It selects nothing until you decide.'}${sg.officer_choice && sg.officer_choice !== sg.suggested ? ' <b>Your choice differs from this suggestion; both are recorded.</b>' : ''}</span>
        <span class="actions">${sg.accepted === 0 ? `<button class="btn sm primary" data-sg="accept">Use as a starting point</button><button class="btn sm" data-sg="ignore">Ignore</button>` : ''}</span></div></div>` : ''}
  </section>`;
}
export function wireSuggestion(root, inv) {
  const b = $('[data-runsg]', root); if (b) b.onclick = async () => {
    b.disabled = true; b.textContent = 'Working…'; const list = $('#rl-suggestion'); list.innerHTML = '';
    try { await runSuggestion(inv, ev => {
      if (ev.type === 'start') list.insertAdjacentHTML('beforeend', `<li class="rstep busy" data-seq="${ev.seq}"><span class="rn">${ev.seq}</span><span class="rk ${ev.kind}">${ev.kind === 'search' ? 'Search' : 'Tool'}</span><code>${esc(ev.tool)}</code><span class="rr">${esc(ev.reason || '')}</span></li>`);
      if (ev.type === 'step') { const li = list.querySelector(`[data-seq="${ev.seq}"]`); if (li) li.outerHTML = stepHtml(ev, []); }
    }); render(); } catch (e) { console.error(e); render(); toast('Suggestion failed', [String(e.message || e)]); }
  };
  $$('[data-sg]', root).forEach(x => x.onclick = () => { x.dataset.sg === 'accept' ? acceptSuggestion(inv) : ignoreSuggestion(inv); render(); });
}
export const suggestedId = inv => { const s = suggestionRow(inv); return s && s.accepted === 1 && s.suggested !== 'keep' ? s.suggested : null; };
