/* Quick demo: a coach panel that walks a first-time user through every input of an investigation.
   Each step highlights the control to use and explains it. "Do it for me" performs that step's input;
   Next moves on, so the user can also do each step by hand. The demo case is GPS Pekhri-2 with two candidate receivers. */
import { runCategoryAgents, runClassify } from '../agent/feedbackAgents.js';
import { runFieldUpdate, runInvestigation, runPolicy } from '../agent/runner.js';
import { chooseFinal, tracks } from '../case/options.js';
import { q, run, save } from '../db/sqlite.js';
import { $, $$, caseState, go, route } from './helpers.js';
import { render } from './router.js';

const SENDER = 'PK2', RECEIVERS = ['GSH', 'NGN'];
const inv = () => (route()[0] === 'case' ? route()[1] : localStorage.getItem('pathshala.demo.inv'));
const st = { on: false, i: 0 };
const wait = async (fn, ms = 20000) => { const t = Date.now(); while (Date.now() - t < ms) { const v = fn(); if (v) return v; await new Promise(r => setTimeout(r, 100)); } return null; };
const hashIs = re => re.test(location.hash);

const STEPS = [
  { title: 'Pick the closing school', text: 'Every investigation starts with ONE school that might close. Click a school on the map or in the list. We use GPS Pekhri-2: 27 students in a building rated poor.', path: '', target: '#cpanel .rlist',
    act: async () => { caseState.sel = SENDER; caseState.picks = new Set(); render(); } },
  { title: 'Tick the receiving schools', text: 'Tick two or more nearby schools to compare side by side. "Pick the best 3" ticks the top screening scores. Nothing is decided yet.', target: '#cpanel .pick',
    act: async () => { RECEIVERS.forEach(id => caseState.picks.add(id)); render(); } },
  { title: 'Start the comparison', text: 'This creates the investigation, with one track per receiving school.', target: '#cp-go',
    act: async () => { if (!caseState.picks.size) { RECEIVERS.forEach(id => caseState.picks.add(id)); render(); await wait(() => $('#cp-go')); } $('#cp-go').click(); } },
  { title: 'Compare side by side', text: 'Distance, climb, hazards, free seats and facilities for each school. Green marks the best value in a row. Each row names its data source underneath. Use Remove or "Add another school" to change the list.', path: i => `case/${i}/compare`, target: '.cmptbl' },
  { title: 'Classify the feedback', text: 'Citizen messages about both schools are put into categories (transportation, safety, terrain and weather, social, others), each with a sentiment and whether it supports merging. This is a fixed, hardcoded classification.', path: i => `case/${i}/feedback`, target: '#fb-classify',
    act: async () => { for (const t of tracks(inv())) await runClassify(t.case_id); save(); render(); } },
  { title: 'Category agents summarise', text: 'One agent per category summarises the concerns. These summaries carry forward into Evidence, Investigate and the report. With a Gemini key connected (More → AI connection) Gemini writes them; otherwise rules do.', target: '#fb-agents',
    act: async () => { for (const t of tracks(inv())) await runCategoryAgents(t.case_id); save(); render(); } },
  { title: 'Evidence for each school', text: 'The route, what is on it, and what people say. Use the tabs to switch between receiving schools. The concerns from the last step appear here.', path: i => `case/${i}/evidence`, target: '#concerns' },
  { title: 'Run the investigation', text: 'The agents check students, routes, map layers, transport, feedback and gaps, then write findings and field questions. Each step is a real tool call you can expand.', path: i => `case/${i}/investigate`, target: '#ag-run-all',
    act: async () => { for (const t of tracks(inv())) await runInvestigation(t.case_id); save(); render(); } },
  { title: 'Answer the field questions', text: 'These are the gaps the agents could not fill. Answer them from the field visit: tap an option, type a number or minutes, add a note. Then press "Submit field verification" and the findings update. "Do it for me" enters sample answers.', target: '#fq',
    act: async () => {
      for (const t of tracks(inv())) {
        const ans = {}; q('SELECT * FROM field_questions WHERE case_id = ?', [t.case_id]).forEach(x => { const o = JSON.parse(x.options || '[]'); ans[x.qid] = { v: x.type === 'number' ? '20' : x.type === 'minutes' ? '45' : o.includes('No') ? 'No' : o[0] || '', note: 'Demo answer' }; });
        await runFieldUpdate(t.case_id, ans);
      }
      save(); render();
    } },
  { title: 'Policy and cost', text: 'Tick the interventions that could address the problems found (for example transport support). Each shows its policy source and a cost worked out by the app. The table below adds up the total cost per school.', path: i => `case/${i}/policy`, target: '.ivsel',
    act: async () => {
      for (const t of tracks(inv())) { await runPolicy(t.case_id); const v = q('SELECT code FROM interventions WHERE case_id = ? ORDER BY (code = \'TR\') DESC LIMIT 1', [t.case_id])[0]; if (v) run('UPDATE interventions SET selected = 1 WHERE case_id = ? AND code = ?', [t.case_id, v.code]); }
      save(); render();
    } },
  { title: 'Choose one school', text: 'Only now, with the field answers and total costs side by side, do you choose ONE receiving school. The officer decides; nothing is chosen automatically. "Do it for me" chooses the school with the lower total cost.', path: i => `case/${i}/report`, target: '#opt-table',
    act: async () => {
      const best = tracks(inv()).map(t => ({ id: t.to_id, cost: q('SELECT COALESCE(SUM(cost_inr), 0) AS c FROM interventions WHERE case_id = ? AND selected = 1', [t.case_id])[0].c })).sort((a, b) => a.cost - b.cost)[0];
      chooseFinal(inv(), best.id); render();
    } },
  { title: 'Review the report and submit', text: 'The draft is written only from the evidence, and every sentence carries a reference. Check it, tick the review box and submit for administrative review. That is the end of the demo.', target: '#rp-text', last: true },
];

let box;
function panel() {
  if (!box) { box = document.createElement('aside'); box.id = 'demo'; box.setAttribute('aria-label', 'Quick demo guide'); document.body.appendChild(box); }
  return box;
}
function hl() {
  $$('.demo-hl').forEach(e => e.classList.remove('demo-hl'));
  const s = STEPS[st.i]; if (!s || !st.on) return;
  const el = $(s.target); if (el) { el.classList.add('demo-hl'); el.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
}
function draw() {
  const p = panel(), s = STEPS[st.i];
  if (!st.on) { p.hidden = true; $$('.demo-hl').forEach(e => e.classList.remove('demo-hl')); return; }
  p.hidden = false;
  p.innerHTML = `<div class="dm-top"><span class="dm-n">Quick demo · step ${st.i + 1} of ${STEPS.length}</span><button class="dm-x" id="dm-exit" aria-label="Exit the demo">✕</button></div>
    <div class="dm-bar"><i style="width:${(st.i + 1) / STEPS.length * 100}%"></i></div>
    <h3>${s.title}</h3><p>${s.text}</p>
    <div class="dm-btns"><button class="btn sm" id="dm-back" ${st.i ? '' : 'disabled'}>← Back</button>${s.act ? '<button class="btn sm primary" id="dm-do">Do it for me</button>' : ''}<button class="btn sm ${s.act ? '' : 'primary'}" id="dm-next">${s.last ? 'Finish' : 'Next →'}</button></div>`;
  $('#dm-exit').onclick = stop;
  $('#dm-back').onclick = () => goStep(st.i - 1);
  $('#dm-next').onclick = () => (s.last ? stop() : goStep(st.i + 1));
  const d = $('#dm-do'); if (d) d.onclick = async () => { d.disabled = true; d.textContent = 'Working…'; try { await s.act(); } catch (e) { console.error(e); } await wait(() => true); draw(); hl(); };
}
async function goStep(i) {
  st.i = Math.max(0, Math.min(STEPS.length - 1, i)); const s = STEPS[st.i], id = inv();
  if (s.path != null) { const p = typeof s.path === 'function' ? (id ? s.path(id) : null) : s.path; if (p != null) { if (route().join('/') !== p) go(p); await wait(() => route().join('/') === p); } }
  draw(); await wait(() => $(s.target)); hl();
}
export function startDemo() {
  st.on = true; caseState.sel = null; caseState.picks = new Set(); caseState.district = 'Kullu';
  const stale = q("SELECT inv_id FROM investigations WHERE from_id = 'PK2' ORDER BY CAST(substr(inv_id, 2) AS INTEGER) DESC LIMIT 1")[0];
  try { localStorage.removeItem('pathshala.demo.inv'); if (stale) localStorage.setItem('pathshala.demo.inv', stale.inv_id); } catch (e) {}
  if (!hashIs(/^#\/?$/)) go(''); else render();
  goStep(0);
}
export function stop() { st.on = false; draw(); }
/* Called after every render so the highlight and panel survive page changes. */
export function demoRefresh() { if (st.on) { draw(); setTimeout(hl, 60); } }
export const demoActive = () => st.on;
