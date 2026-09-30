import { resetNewItems } from '../engine/rules.js';
import { $, $$, caseState, esc, go, mergeOf, mergeRow, route, state } from './helpers.js';
import { maps, resetMaps } from './map/baseMap.js';
import { renderCase } from './pages/case.js';
import { renderCaseHome } from './pages/caseHome.js';
import { renderAi } from './pages/ai.js';
import { renderCases } from './pages/cases.js';
import { renderHome } from './pages/home.js';
import { renderInbox } from './pages/inbox.js';
import { renderItem } from './pages/item.js';
import { renderMerge } from './pages/merge.js';
import { renderMergeFeedback } from './pages/mergeFeedback.js';
import { renderPair } from './pages/pair.js';
import { renderPlanner } from './pages/planner.js';
import { renderRules } from './pages/rules.js';
import { renderSchool } from './pages/school.js';
import { renderSql } from './pages/sql.js';
import { renderSurvey } from './pages/survey.js';
import { demoRefresh } from './demo.js';
import { sourcesHtml } from './sources.js';
import { dbStatus } from './toast.js';

export function render(scrollTop) {
  const r = route(), app = $('#app');
  maps.forEach(m => m.remove()); resetMaps();
  const top = { inbox: 'more', ai: 'more', rules: 'more', sql: 'more', merges: 'merges', m: 'merges', new: 'merges', s: 'merges' }[r[0]] || 'home';
  $$('#nav a').forEach(a => a.setAttribute('aria-current', a.dataset.v === top ? 'page' : 'false'));
  $('#more summary').setAttribute('aria-current', top === 'more' ? 'page' : 'false'); $('#more').open = false;
  const pg = () => { app.innerHTML = '<div class="page" id="pg"></div>'; return $('#pg'); };
  try {
    if (!r.length) renderCaseHome(app);
    else if (r[0] === 'merges') renderHome(app);
    else if (r[0] === 'case' && r[1]) renderCase(pg(), r[1], { access: 'evidence', community: 'evidence' }[r[2]] || r[2]);
    else if (r[0] === 'cases') renderCases(pg());
    else if (r[0] === 'm' && r[1]) {
      const m = mergeRow(r[1]);
      if (!m) { const alt = mergeOf(r[1]); go(alt ? 'm/' + alt : ''); return; }
      if (!r[2]) renderMerge(pg(), m);
      else if (r[2] === 'g') renderPair(pg(), m, r[3]);
      else if (r[2] === 'p') renderItem(pg(), m, r[3], r[4]);
      else if (r[2] === 'survey') renderSurvey(pg(), m);
      else if (r[2] === 'feedback') renderMergeFeedback(pg(), m);
      else go('m/' + r[1]);
    }
    else if (r[0] === 's' && r[1]) renderSchool(pg(), r[1]);
    else if (r[0] === 'new') renderPlanner(pg(), r[1]);
    else if (r[0] === 'inbox') { if (r[1]) { state.inboxGroup = r[1]; state.draft = Object.assign({}, state.draft, { group: r[1] }); } renderInbox(pg()); }
    else if (r[0] === 'ai') renderAi(pg());
    else if (r[0] === 'rules') renderRules(pg());
    else if (r[0] === 'sql') renderSql(pg());
    else go('');
  } catch (e) { console.error(e); app.innerHTML = `<div class="page"><div class="card err">${esc(e.message)}</div></div>`; }
  if (!app.querySelector('#srcs')) (app.querySelector('.page') || app).insertAdjacentHTML('beforeend', sourcesHtml(r));
  $$('.tag.mock').forEach(t => { t.textContent = 'PathShala (synthesised)'; });   // synthesised data names PathShala as its source
  dbStatus(); demoRefresh();
  if (scrollTop) window.scrollTo(0, 0);
}
window.addEventListener('hashchange', () => {
  $('#toast').classList.remove('show'); resetNewItems();
  if (!route().length) { caseState.sel = null; caseState.picks = new Set(); }   // the Investigate tab starts from the school list
  render(true);
});
