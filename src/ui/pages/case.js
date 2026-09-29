import { q1 } from '../../db/sqlite.js';
import { $, STEPS, crumbs, esc, go, school } from '../helpers.js';
import { caseMapPanel, drawCaseMap } from '../map/caseMap.js';
import { stepAccess } from './access.js';
import { stepCommunity } from './community.js';
import { stepCompare } from './compare.js';
import { stepInvestigate } from './investigate.js';
import { stepPolicy } from './policy.js';
import { stepReport } from './report.js';

export function renderCase(pg, cid, step) {
  const c = q1('SELECT * FROM cases WHERE case_id = ?', [cid]); if (!c) { go(''); return; }
  step = step || (c.status === 'Ready for administrative review' ? 'report' : 'compare');
  const A = school(c.from_id), B = school(c.to_id);
  const ran = q1('SELECT count(*) AS n FROM findings WHERE case_id = ?', [cid]).n > 0;
  const done = { compare: true, access: true, community: true, investigate: ran, policy: q1('SELECT count(*) AS n FROM interventions WHERE case_id = ? AND selected = 1', [cid]).n > 0, report: c.status === 'Ready for administrative review' };
  const idx = STEPS.findIndex(s => s[0] === step);
  pg.classList.add('wide');
  pg.innerHTML = `${crumbs([['Case map', '#/'], ['Investigations', '#/cases'], [cid]])}
    <section class="ph"><div class="eyebrow">Consolidation investigation · ${cid} · opened ${esc(c.created_on)} by ${esc(c.officer)}</div>
      <h1><span style="color:var(--risk)">${esc(A.name)}</span> <span class="arrow">→</span> ${esc(B.name)}</h1>
      <div class="sub"><span class="pill ${c.status === 'Ready for administrative review' ? 's-green' : 's-pending'}">${esc(c.status)}</span><span>The officer decides. The agent finds evidence, gaps and relevant policy.</span></div></section>
    <nav class="steps" aria-label="Investigation steps">${STEPS.map(([k, l], i) => `<a href="#/case/${cid}/${k}" aria-current="${k === step ? 'step' : 'false'}" class="${done[k] && k !== step ? 'done' : ''}"><span class="sn">${done[k] && k !== step ? '✓' : i + 1}</span>${l}</a>`).join('')}</nav>
    <div class="cgrid"><div class="cmain" id="cmain"></div><div class="cside">${caseMapPanel(c, step)}<div id="cside2"></div></div></div>
    <div class="row" style="margin-top:4px">${idx > 0 ? `<a class="btn" href="#/case/${cid}/${STEPS[idx - 1][0]}">← ${STEPS[idx - 1][1]}</a>` : '<span></span>'}${idx < STEPS.length - 1 ? `<a class="btn primary" href="#/case/${cid}/${STEPS[idx + 1][0]}">Continue: ${STEPS[idx + 1][1]} →</a>` : ''}</div>`;
  const main = $('#cmain');
  const stepFn = { compare: stepCompare, access: stepAccess, community: stepCommunity, investigate: stepInvestigate, policy: stepPolicy, report: stepReport }[step];
  // policy and report steps are async (they call agents); show a failure instead of an unhandled rejection
  Promise.resolve(stepFn(main, c, A, B)).catch(e => { console.error(e); main.innerHTML = `<div class="card err">${esc(e.message)}</div>`; });
  drawCaseMap(c, step);
}
