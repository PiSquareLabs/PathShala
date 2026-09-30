import { candidatesFor, fullRow, reviewList, startFull } from '../../agent/fullControl.js';
import { $, crumbs, esc, go } from '../helpers.js';
import { toast } from '../toast.js';

const STEP_FOR = { research: 'compare', field: 'investigate', answered: 'investigate', policy: 'policy', report: 'report', final: 'report' };

/* Full control starts here: pick the closing school. The rest runs on the ordinary case screens. */
export function renderFull(pg, inv) {
  pg.classList.add('wide');
  if (inv) { const r = fullRow(inv); go(r ? `case/${inv}/${STEP_FOR[r.stage] || 'compare'}` : 'full'); return; }
  const list = reviewList(); let sel = list[0]?.school_id;
  pg.innerHTML = `${crumbs([['Full control']])}<section class="ph"><h1>Full control</h1><div class="sub muted">One closing school in. A researched recommendation, comparison, budget and report out. The field officer's entries are the only manual step.</div></section>
    <div class="card"><h2>1 · Choose the closing school</h2>
      <p class="small muted">Schools with 30 or fewer students, or a poor or unsafe building. The AI then finds the nearest suitable receiving schools and researches each one.</p>
      <label class="f">Closing school<select id="fc-school">${list.map(s => `<option value="${s.school_id}">${esc(s.name)} · ${s.enrol_total} students · ${esc(s.block)}${s.building && /^(Poor|Unsafe)/.test(s.building) ? ' · building ' + esc(s.building.split('—')[0].trim().toLowerCase()) : ''}</option>`).join('')}</select></label>
      <div id="fc-cands" class="small muted"></div>
      <div class="row" style="margin-top:12px"><span class="small muted">Stages: AI research → field form (you) → policies and budget → decision.</span><button class="btn primary" id="fc-start">Start Full control</button></div></div>
    <div class="card"><h2>What happens</h2><p class="small muted">You stay on the same screens as the normal flow. The AI does each screen\'s work and moves on; it stops only for the field form.</p><ol class="fcflow"><li><b>Compare:</b> the AI picks the best candidate schools.</li><li><b>Feedback:</b> it classifies the citizen feedback and checks the claims. <b>Evidence:</b> it plans the transport.</li><li><b>Investigate:</b> it researches every school, generates the field form and <b>waits for the field officer</b>.</li><li><b>Policy and cost:</b> after your answers it picks the best policies and prices them.</li><li><b>Report:</b> the recommendation, why it beats the others, the budget and the full report. You decide and submit.</li></ol></div>`;
  const showC = () => { sel = $('#fc-school').value; const c = candidatesFor(sel); $('#fc-cands').innerHTML = c.length ? `Candidate receiving schools: ${c.map(x => `<b>${esc(x.s.name)}</b> (${x.road} km, score ${x.score})`).join(', ')}` : '<span class="t-red">No suitable receiving school within 12 km.</span>'; $('#fc-start').disabled = !c.length; };
  $('#fc-school').onchange = showC; showC();
  $('#fc-start').onclick = () => { try { go('case/' + startFull($('#fc-school').value) + '/compare'); } catch (e) { toast('Could not start', [e.message]); } };
}

