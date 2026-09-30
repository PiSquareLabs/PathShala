import 'leaflet/dist/leaflet.css';
import './styles/app.css';
import { STORE, bootSql, db, freshDb, openDb, save, setDb } from './db/sqlite.js';

import { analyseAll } from './engine/rules.js';
import { $, esc, nowTime, state } from './ui/helpers.js';
import { render } from './ui/router.js';
import { AGENTS } from './agent/agents/index.js';
import { captureC1Outputs } from './agent/fixtures.js';
import { CONFIG, GeminiProvider, SimulatedProvider } from './agent/provider.js';
import { callAgent } from './agent/runner.js';
import { tools, toolSchemas } from './agent/tools.js';
import { validate, schemas } from './agent/validate.js';
import { q } from './db/sqlite.js';
import { toast } from './ui/toast.js';

$('#reset').onclick = function () {
  if (!this.dataset.armed) { this.dataset.armed = 1; this.textContent = 'Click again to reset'; setTimeout(() => { delete this.dataset.armed; this.textContent = 'Reset demo'; }, 4000); return; }
  delete this.dataset.armed; this.textContent = 'Reset demo';
  try { localStorage.removeItem(STORE); } catch (e) {}
  db.close(); setDb(freshDb()); analyseAll(); save();
  Object.assign(state, { sqlResult: null, lastRun: nowTime(), draft: null, plan: null });
  render(); toast('Demo reset', ['All tables reloaded from the seed data.']);
};
bootSql().then(engine => {
  setDb(openDb()); analyseAll(); save();
  render(true);
  console.info('PathShala: SQLite via ' + engine);
}).catch(err => {
  $('#loading').innerHTML = `<div><b>SQLite could not start.</b></div><div class="small">${esc(err && err.message || err)}</div>`;
});

// Debug and test hook (used by tests/agents.spec.js); not used by the app itself.
window.__pathshala = { q, AGENTS, tools, toolSchemas, callAgent, validate, schemas, captureC1Outputs, CONFIG, GeminiProvider, SimulatedProvider };
