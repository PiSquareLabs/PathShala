import { persisted, q, q1 } from '../db/sqlite.js';
import { $, esc } from './helpers.js';

export function toast(title, lines) {
  const t = $('#toast');
  t.innerHTML = `<button class="x" aria-label="Close">×</button><b>${esc(title)}</b><ul>${lines.slice(0, 8).map(l => `<li>${l}</li>`).join('')}</ul>`;
  t.classList.add('show');
  $('.x', t).onclick = () => t.classList.remove('show');
  clearTimeout(toast.tm); toast.tm = setTimeout(() => t.classList.remove('show'), 7000);
}
export function dbStatus(engine) {
  const tables = q("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").map(t => t.name);
  const rows = tables.reduce((a, t) => a + q1(`SELECT count(*) AS n FROM "${t}"`).n, 0);
  $('#dbstat').innerHTML = `<span class="led"></span>SQLite · ${rows} rows · ${persisted ? 'saved' : 'in memory'}`;
  const open = q1("SELECT count(*) AS n FROM questions q LEFT JOIN answers a USING (group_id, kind) WHERE a.choice IS NULL").n;
}
