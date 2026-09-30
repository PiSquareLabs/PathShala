import { hasResults, optionIds } from '../../case/options.js';
import { q1 } from '../../db/sqlite.js';
import { $, STEPS, crumbs, esc, go, school } from '../helpers.js';
import { caseMapPanel, drawCaseMap } from '../map/caseMap.js';
import { stepCompare } from './compare.js';
import { stepEvidence } from './evidence.js';
import { stepInvestigate } from './investigate.js';
import { stepPolicy } from './policy.js';
import { stepReport } from './report.js';

export function renderCase(pg, cid, step) {
  const c = q1('SELECT * FROM cases WHERE case_id = ?', [cid]); if (!c) { go(''); return; }
  const submitted = c.status === 'Ready for administrative review';
  step = STEPS.some(s => s[0] === step) ? step : (submitted ? 'report' : 'compare');
  const A = school(c.from_id), B = school(c.to_id), n = optionIds(cid).length;
  const done = { compare: true, evidence: true, investigate: hasResults(cid), policy: q1('SELECT count(*) AS n FROM interventions WHERE case_id = ? AND selected = 1', [cid]).n > 0, report: submitted };
  const idx = STEPS.findIndex(s => s[0] === step), comparing = step === 'compare' && n > 1;
  pg.classList.add('wide');
  pg.innerHTML = `${crumbs([['Investigate', '#/'], [`${A.name}`]])}
    <section class="ph"><h1><span style="color:var(--risk)">${esc(A.name)}</span> <span class="arrow">→</span> ${comparing ? `${n} schools to compare` : esc(B.name)}</h1>
      <div class="sub"><span class="pill ${submitted ? 's-green' : 's-pending'}">${esc(c.status)}</span><span class="muted">${esc(c.case_id)}${n > 1 && !comparing ? ` · chosen from ${n}` : ''}</span></div></section>
    <nav class="steps" aria-label="Investigation steps">${STEPS.map(([k, l], i) => `<a href="#/case/${cid}/${k}" aria-current="${k === step ? 'step' : 'false'}" class="${done[k] && k !== step ? 'done' : ''}"><span class="sn">${done[k] && k !== step ? '✓' : i + 1}</span>${l}</a>`).join('')}</nav>
    ${step === 'compare' ? '<div id="cmain" class="tight"></div>' : `<div class="cgrid"><div class="cmain" id="cmain"></div><div class="cside">${caseMapPanel()}</div></div>`}
    <div class="row" style="margin-top:4px">${idx > 0 ? `<a class="btn" href="#/case/${cid}/${STEPS[idx - 1][0]}">← ${STEPS[idx - 1][1]}</a>` : '<span></span>'}${idx < STEPS.length - 1 ? `<a class="btn primary" href="#/case/${cid}/${STEPS[idx + 1][0]}">${step === 'compare' ? `Continue with ${esc(B.name)}` : `Next: ${STEPS[idx + 1][1]}`} →</a>` : ''}</div>`;
  const main = $('#cmain');
  const stepFn = { compare: stepCompare, evidence: stepEvidence, investigate: stepInvestigate, policy: stepPolicy, report: stepReport }[step];
  // policy and report steps are async (they call agents); show a failure instead of an unhandled rejection
  Promise.resolve(stepFn(main, c, A, B)).catch(e => { console.error(e); main.innerHTML = `<div class="card err">${esc(e.message)}</div>`; });
  drawCaseMap(c, step);
}
