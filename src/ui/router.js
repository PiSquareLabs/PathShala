import { q1 } from '../db/sqlite.js';
import { resetNewItems } from '../engine/rules.js';
import { $, $$, esc, go, mergeOf, mergeRow, route, state } from './helpers.js';
import { maps, resetMaps } from './map/baseMap.js';
import { renderCase } from './pages/case.js';
import { renderCaseHome } from './pages/caseHome.js';
import { renderCases } from './pages/cases.js';
import { renderHome } from './pages/home.js';
import { renderInbox } from './pages/inbox.js';
import { renderItem } from './pages/item.js';
import { renderMerge } from './pages/merge.js';
import { renderMergeFeedback } from './pages/mergeFeedback.js';
import { renderPair } from './pages/pair.js';
import { renderPlanner } from './pages/planner.js';
import { renderProblems } from './pages/problems.js';
import { renderRules } from './pages/rules.js';
import { renderSchool } from './pages/school.js';
import { renderSql } from './pages/sql.js';
import { renderSurvey } from './pages/survey.js';
import { renderSurveys } from './pages/surveys.js';
import { dbStatus } from './toast.js';

export function render(scrollTop) {
  const r = route(), app = $('#app');
  maps.forEach(m => m.remove()); resetMaps();
  const top = ['problems', 'surveys', 'inbox', 'rules', 'sql', 'merges', 'cases'].includes(r[0]) ? r[0] : r[0] === 'case' ? 'cases' : r[0] === 'm' ? 'merges' : 'home';
  $$('#nav a').forEach(a => a.setAttribute('aria-current', a.dataset.v === top ? 'page' : 'false'));
  const pg = () => { app.innerHTML = '<div class="page" id="pg"></div>'; return $('#pg'); };
  try {
    if (!r.length) renderCaseHome(app);
    else if (r[0] === 'merges') renderHome(app);
    else if (r[0] === 'case' && r[1]) renderCase(pg(), r[1], r[2]);
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
    else if (r[0] === 'problems') renderProblems(pg());
    else if (r[0] === 'surveys') renderSurveys(pg());
    else if (r[0] === 'inbox') { if (r[1]) { state.inboxGroup = r[1]; state.draft = Object.assign({}, state.draft, { group: r[1] }); } renderInbox(pg()); }
    else if (r[0] === 'rules') renderRules(pg());
    else if (r[0] === 'sql') renderSql(pg());
    else go('');
  } catch (e) { console.error(e); app.innerHTML = `<div class="page"><div class="card err">${esc(e.message)}</div></div>`; }
  dbStatus();
  const hp = q1("SELECT count(*) AS n FROM problems WHERE severity = 'high'").n;
  $('#b-p').textContent = hp || ''; $('#b-p').style.display = hp ? '' : 'none';
  const sv = q1('SELECT sum(unknowns + open_questions) AS n FROM merge_summary').n || 0;
  $('#b-q').textContent = sv || ''; $('#b-q').style.display = sv ? '' : 'none';
  if (scrollTop) window.scrollTo(0, 0);
}
window.addEventListener('hashchange', () => { $('#toast').classList.remove('show'); resetNewItems(); render(true); });
