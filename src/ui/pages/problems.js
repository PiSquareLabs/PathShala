import { q } from '../../db/sqlite.js';
import { $$, crumbs, esc, short, state } from '../helpers.js';
import { render } from '../router.js';

export function renderProblems(pg) {
  const f = state.probFilter;
  const all = q(`SELECT p.*, r.name AS r_name, m.status FROM problems p JOIN merge_summary m USING (merge_id) JOIN schools r ON r.school_id = m.receiving_id ORDER BY CASE p.severity WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END, p.merge_id, p.seq`);
  const list = f === 'all' ? all : all.filter(p => p.severity === f);
  const c = k => all.filter(p => p.severity === k).length;
  pg.innerHTML = `${crumbs([['Map', '#/'], ['Problems']])}
    <section class="ph"><div class="eyebrow">Across all merges</div><h1>Problems to address</h1><div class="sub">From negative feedback, failed rule checks, attendance, undelivered policies and missing data. Each links to where it is fixed.</div></section>
    <div class="filters">${[['all', `All ${all.length}`], ['high', `High ${c('high')}`], ['medium', `Medium ${c('medium')}`], ['low', `Low ${c('low')}`]].map(([k, l]) => `<button data-f="${k}" aria-pressed="${f === k}">${l}</button>`).join('')}</div>
    <section class="card"><div class="probs">${list.map(p => `<div class="prob"><span class="sv ${p.severity}"></span><span class="mg">${esc(short(p.r_name))} · ${esc(p.status)}</span><a href="${p.link}">${{ survey: 'Survey →', feedback: 'Open →', check: 'Details →', policy: 'Update →' }[p.kind] || 'Open →'}</a><span class="pt2">${esc(p.title)}</span><span class="pd2">${esc(p.detail)}</span></div>`).join('') || '<p class="empty">Nothing here.</p>'}</div></section>`;
  $$('.filters button', pg).forEach(b => b.onclick = () => { state.probFilter = b.dataset.f; render(); });
}

/* ---------- school ---------- */
