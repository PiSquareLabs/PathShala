import { chooseFinal, invRow, optionSummary, optionIds, trackId, trackRow } from '../../case/options.js';
import { $$, esc, inr, state } from '../helpers.js';
import { render } from '../router.js';

/* The option (candidate receiving school) being worked on in the evidence, investigate and policy steps. */
export function activeOpt(inv) {
  const ids = optionIds(inv);
  return ids.includes(state.opt[inv]) ? state.opt[inv] : ids[0];
}
export const activeTrack = inv => trackRow(trackId(inv, activeOpt(inv)));

/* Tabs to switch between the candidate schools. A tick shows that the school has been investigated. */
export function optTabs(inv) {
  const sums = optionSummary(inv), cur = activeOpt(inv);
  if (sums.length < 2) return '';
  return `<nav class="opttabs" aria-label="Receiving schools">${sums.map(x => `<button data-opt="${x.school.school_id}" aria-pressed="${x.school.school_id === cur}">${x.investigated ? '<span class="ok">✓</span> ' : ''}${esc(x.school.name)}</button>`).join('')}</nav>`;
}
export function wireOptTabs(root, inv) {
  $$('[data-opt]', root).forEach(b => b.onclick = () => { state.opt[inv] = b.dataset.opt; render(); });
}

/* Totals side by side, one column per candidate, so the officer can choose with the costs in view. */
export function optionsTable(inv, { choose = false } = {}) {
  const sums = optionSummary(inv), I = invRow(inv), many = sums.length > 1;
  const cost = (n, none = '—') => (n ? inr(n) : none);
  const best = fn => { const v = sums.map(fn); const ok = v.filter(n => n != null); if (!many || ok.length < 2 || new Set(ok).size === 1) return new Set(); const t = Math.min(...ok); return new Set(v.map((n, i) => (n === t ? i : -1)).filter(i => i >= 0)); };
  const rows = [
    ['Investigated', x => x.investigated ? '<span class="yes">Yes</span>' : '<span class="muted">Not yet</span>', null],
    ['Field questions answered', x => x.investigated ? `${x.answered} of ${x.questions}` : '—', null],
    ['Concerns confirmed or verified', x => x.investigated ? `${x.confirmed} of ${x.issues}` : '—', null],
    ['Interventions selected', x => x.selected.length ? x.selected.map(s => esc(s.title)).join('<br>') : (x.policyDone ? 'None selected' : '—'), null],
    ['Cost per year', x => `<b>${cost(x.yearly, x.policyDone ? 'No yearly cost' : '—')}</b>`, x => (x.policyDone ? x.yearly : null)],
    ['One-time cost', x => `<b>${cost(x.oneTime, x.policyDone ? 'No one-time cost' : '—')}</b>`, x => (x.policyDone ? x.oneTime : null)],
    ['First-year total', x => `<b>${x.policyDone ? inr(x.yearly + x.oneTime) : '—'}</b>${x.unpriced ? `<span class="sub">${x.unpriced} item${x.unpriced > 1 ? 's' : ''} not costed</span>` : ''}`, x => (x.policyDone ? x.yearly + x.oneTime : null)],
  ];
  return `<div class="cmpwrap"><table class="cmptbl" id="opt-table"><thead><tr><th></th>${sums.map(x => `<th class="${I.chosen_id === x.school.school_id ? 'chosen' : ''}"><div class="oh"><b>${esc(x.school.name)}</b>
      ${choose ? (I.chosen_id === x.school.school_id ? '<div class="row"><span class="pill s-pending">Chosen</span></div>' : `<div class="row"><button class="btn sm primary" data-final="${x.school.school_id}">Choose this school</button></div>`) : ''}</div></th>`).join('')}</tr></thead>
    <tbody>${rows.map(([label, cell, val]) => { const b = val ? best(val) : new Set(); return `<tr><th scope="row">${label}</th>${sums.map((x, i) => `<td class="${b.has(i) ? 'best' : ''} ${I.chosen_id === x.school.school_id ? 'chosen' : ''}">${cell(x)}</td>`).join('')}</tr>`; }).join('')}</tbody></table></div>`;
}
export function wireOptionsTable(root, inv) {
  $$('[data-final]', root).forEach(b => b.onclick = () => { chooseFinal(inv, b.dataset.final); state.opt[inv] = b.dataset.final; render(); });
}
