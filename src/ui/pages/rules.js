import { q, run } from '../../db/sqlite.js';
import { commit } from '../../engine/rules.js';
import { $, $$, esc, go } from '../helpers.js';

export function renderRules(app) {
  const rules = q('SELECT * FROM rules ORDER BY CAST(substr(rule_id, 2) AS INTEGER)');
  app.innerHTML = `<div class="card">
    <h2>Rules <small>the engine reads these on every run. Change a number and every merge is re-checked.</small></h2>
    <div class="rulelist">${rules.map(r => `<div class="rl" data-id="${r.rule_id}">
      <span class="id">${r.rule_id}</span><span class="nm">${esc(r.name)}</span>
      <span class="sm">${esc(r.statement)} · ${r.url ? `<a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.reference)}</a>` : esc(r.reference)} · <span class="mono">${r.param_name}</span></span>
      <span class="inp"><input type="number" step="any" value="${r.param_value}" data-orig="${r.param_value}" aria-label="${esc(r.name)}"><span>${esc(r.unit)}</span></span>
    </div>`).join('')}</div>
    <div class="row" style="margin-top:14px"><span class="small muted" id="rl-n">No changes.</span><span style="display:flex;gap:8px"><button class="btn" id="rl-undo" disabled>Undo edits</button><button class="btn primary" id="rl-go" disabled>Save and re-check all merges</button></span></div>
  </div>`;
  const upd = () => {
    const ch = $$('.rl', app).filter(row => { const i = $('input', row); const c = i.value !== '' && +i.value !== +i.dataset.orig; row.classList.toggle('changed', c); return c; });
    $('#rl-n').textContent = ch.length ? `${ch.length} rule${ch.length > 1 ? 's' : ''} changed.` : 'No changes.';
    $('#rl-go').disabled = $('#rl-undo').disabled = !ch.length;
  };
  $$('.rl input', app).forEach(i => i.oninput = upd);
  $('#rl-undo').onclick = () => renderRules(app);
  $('#rl-go').onclick = () => {
    const ch = $$('.rl', app).filter(row => row.classList.contains('changed'));
    commit(`${ch.length} rule${ch.length > 1 ? 's' : ''} updated`, () => ch.forEach(row => run('UPDATE rules SET param_value = ? WHERE rule_id = ?', [+$('input', row).value, row.dataset.id])));
  };
}

/* ---------- sql ---------- */
