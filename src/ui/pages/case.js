import { hasResults, invRow, tracks } from '../../case/options.js';
import { q1 } from '../../db/sqlite.js';
import { $, STEPS, crumbs, esc, go, school } from '../helpers.js';
import { caseMapPanel, drawCaseMap } from '../map/caseMap.js';
import { stepCompare } from './compare.js';
import { stepEvidence } from './evidence.js';
import { stepInvestigate } from './investigate.js';
import { activeTrack, optTabs, wireOptTabs } from './options.js';
import { stepPolicy } from './policy.js';
import { stepReport } from './report.js';

const PER_OPTION = ['evidence', 'investigate', 'policy'];

export function renderCase(pg, inv, step) {
  const I = invRow(inv); if (!I) { go(''); return; }
  const submitted = I.status === 'Ready for administrative review';
  step = STEPS.some(s => s[0] === step) ? step : (submitted ? 'report' : 'compare');
  const A = school(I.from_id), ts = tracks(inv), n = ts.length, c = activeTrack(inv), B = school(c.to_id);
  const chosen = I.chosen_id ? school(I.chosen_id) : null;
  const done = { compare: true, evidence: true, investigate: ts.every(t => hasResults(t.case_id)), policy: ts.some(t => q1('SELECT count(*) AS n FROM interventions WHERE case_id = ? AND selected = 1', [t.case_id]).n > 0), report: submitted };
  const idx = STEPS.findIndex(s => s[0] === step);
  pg.classList.add('wide');
  pg.innerHTML = `${crumbs([['Investigate', '#/'], [`${A.name}`]])}
    <section class="ph"><h1><span style="color:var(--risk)">${esc(A.name)}</span> <span class="arrow">→</span> ${chosen ? esc(chosen.name) : n > 1 ? `${n} schools to compare` : esc(B.name)}</h1>
      <div class="sub"><span class="pill ${submitted ? 's-green' : 's-pending'}">${esc(I.status)}</span><span class="muted">${esc(inv)}${chosen && n > 1 ? ` · chosen from ${n}` : ''}</span></div></section>
    <nav class="steps" aria-label="Investigation steps">${STEPS.map(([k, l], i) => `<a href="#/case/${inv}/${k}" aria-current="${k === step ? 'step' : 'false'}" class="${done[k] && k !== step ? 'done' : ''}"><span class="sn">${done[k] && k !== step ? '✓' : i + 1}</span>${l}</a>`).join('')}</nav>
    ${step === 'compare' || step === 'report' ? '<div id="cmain" class="tight"></div>' : `<div class="cgrid"><div class="cmain" id="cmain"></div><div class="cside">${caseMapPanel()}</div></div>`}
    <div class="row" style="margin-top:4px">${idx > 0 ? `<a class="btn" href="#/case/${inv}/${STEPS[idx - 1][0]}">← ${STEPS[idx - 1][1]}</a>` : '<span></span>'}${idx < STEPS.length - 1 ? `<a class="btn primary" href="#/case/${inv}/${STEPS[idx + 1][0]}">Next: ${STEPS[idx + 1][1]} →</a>` : ''}</div>`;
  const main = $('#cmain');
  let target = main;
  if (PER_OPTION.includes(step)) { main.innerHTML = `${optTabs(inv)}<div id="cstep" class="tight"></div>`; wireOptTabs(main, inv); target = $('#cstep'); }
  const stepFn = { compare: () => stepCompare(target, I), evidence: () => stepEvidence(target, c, A, B), investigate: () => stepInvestigate(target, c, A, B), policy: () => stepPolicy(target, c, A, B), report: () => stepReport(target, I) }[step];
  // policy and report steps are async (they call agents); show a failure instead of an unhandled rejection
  Promise.resolve(stepFn()).catch(e => { console.error(e); target.innerHTML = `<div class="card err">${esc(e.message)}</div>`; });
  if ($('#cmap')) drawCaseMap({ case_id: c.case_id, inv_id: inv, from_id: c.from_id, to_id: c.to_id }, step);
}
