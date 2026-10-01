import { runPolicy } from '../../agent/runner.js';
import { tools } from '../../agent/tools.js';
import { hasResults, optionIds } from '../../case/options.js';
import { q, q1, run, save } from '../../db/sqlite.js';
import { $$, costText, esc, logCase } from '../helpers.js';
import { fold } from '../kit.js';
import { optionsTable } from './options.js';

export async function stepPolicy(el, c, A, B) {
  if (!hasResults(c.case_id)) { el.innerHTML = `<div class="card"><h2>Run the investigation first</h2><p class="muted">The policy search uses the agent's findings.</p><p style="margin-top:10px"><a class="btn primary" href="#/case/${c.inv_id}/investigate">Go to Investigate</a></p></div>`; return; }
  const F = q('SELECT * FROM findings WHERE case_id = ? AND removed = 0', [c.case_id]);
  const query = 'transport escort distance terrain flood bridge habitation seasonal walking ' + F.map(f => f.title).join(' ');
  const hits = await tools.policy_retrieve({ query, k: 6 });
  if (!q1('SELECT count(*) AS n FROM interventions WHERE case_id = ?', [c.case_id]).n) { await runPolicy(c.case_id); save(); }
  const iv = q("SELECT * FROM interventions WHERE case_id = ? ORDER BY CASE code WHEN 'TR' THEN 1 WHEN 'ES' THEN 2 WHEN 'SEA' THEN 3 ELSE 4 END", [c.case_id]);
  const chunk = id => q1('SELECT c.*, d.title AS doc_title, d.url FROM policy_chunks c JOIN policy_docs d USING (doc_id) WHERE chunk_id = ?', [id]);
  el.innerHTML = `<div class="sechd"><h2>Possible interventions</h2><span>tick the ones to put in the report</span></div>
    ${iv.map(v => { const cs = JSON.parse(v.chunk_ids).map(chunk).filter(Boolean), inp = JSON.parse(v.inputs); return `<section class="card ivc ${v.selected ? 'on' : ''}">
      <div class="ivtop"><label class="ivsel"><input type="checkbox" data-c="${v.code}" ${v.selected ? 'checked' : ''}> <h2 style="margin:0;font-size:19px">${esc(v.title)}</h2></label><span class="ivcost"><b>${costText(v.cost_inr, v.cost_type)}</b> <span class="small muted">${v.cost_type === 'none' ? '' : v.cost_type}</span></span></div>
      <p class="small muted" style="margin-top:6px">${esc(v.why)}</p>
      ${fold('Policy text and cost', `<div class="two"><div><div class="eyebrow">Policy requirement <span class="tag real">source text</span></div>${cs.map(ch => `<blockquote>“${esc(ch.text)}”<cite>${esc(ch.doc_title)}, ${esc(ch.section)}${ch.verbatim ? '' : ' (close paraphrase)'} · <a href="${esc(ch.url)}" target="_blank" rel="noopener">open source</a></cite></blockquote>`).join('')}</div>
        <div><div class="eyebrow">Cost calculation</div><table class="tbl"><tbody>${inp.map(r => `<tr><td class="muted">${esc(r[0])}</td><td><b>${esc(r[1])}</b><div class="small muted">${esc(r[2])}</div></td></tr>`).join('')}
          <tr><td class="muted">Formula</td><td class="mono">${esc(v.formula)}</td></tr><tr><td class="muted">Estimated cost</td><td><b>${costText(v.cost_inr, v.cost_type)}</b></td></tr></tbody></table></div></div>`)}</section>`; }).join('')}
    ${optionIds(c.inv_id).length > 1 ? `<section class="card"><h2>Total cost of each option <small>so far</small></h2><div id="opt-wrap">${optionsTable(c.inv_id)}</div><p class="small muted" style="margin-top:8px">Investigate every school and choose its interventions, then choose one school on the last step.</p></section>` : ''}
    <section class="card">${fold('Sources searched', `<ol class="hits">${hits.map(h => `<li><span class="hs">${h.score}</span><span><b>${esc(h.doc_title)}</b> · ${esc(h.section)} <a href="${esc(h.url)}" target="_blank" rel="noopener">open source</a></span></li>`).join('')}</ol>`, { count: hits.length })}</section>`;
  $$('.ivsel input', el).forEach(i => i.onchange = () => { run('UPDATE interventions SET selected = ? WHERE case_id = ? AND code = ?', [i.checked ? 1 : 0, c.case_id, i.dataset.c]); logCase(c.case_id, 'Officer', i.checked ? 'Selected intervention' : 'Removed intervention', i.dataset.c); run('UPDATE reports SET edited = 0 WHERE case_id = ?', [c.case_id]); save(); i.closest('.ivc').classList.toggle('on', i.checked); const w = document.getElementById('opt-wrap'); if (w) w.innerHTML = optionsTable(c.inv_id); });
}
