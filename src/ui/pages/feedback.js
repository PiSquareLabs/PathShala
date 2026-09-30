import { CATEGORIES, STANCE_LABEL, classified, concernsOf, ensureFeedback, feedbackAbout, runCategoryAgents } from '../../agent/feedbackAgents.js';
import { llmConfigured } from '../../agent/llm.js';
import { q1, save } from '../../db/sqlite.js';
import { $, esc } from '../helpers.js';
import { fold } from '../kit.js';
import { render } from '../router.js';
import { toast } from '../toast.js';

const CLS = { Transportation: 'k-tr', Safety: 'k-sf', 'Terrain and weather': 'k-tw', Social: 'k-so', Others: 'k-ot' };
const PILL = { support: 's-green', oppose: 's-red', neutral: '', mixed: 's-amber' };
const SUBJ = { sender: 'closing school', receiver: 'receiving school', merger: 'the merger' };
const SHORT = { support: 'Supports', oppose: 'Does not support', neutral: 'Neutral', mixed: 'Mixed' };

/* Stance bar: how many messages support merging, are neutral, or do not support it. */
export const stanceBar = (sup, neu, opp) => { const t = sup + neu + opp || 1; return `<span class="sbar" role="img" aria-label="${sup} support, ${neu} neutral, ${opp} do not support"><i class="s-sup" style="width:${sup / t * 100}%"></i><i class="s-neu" style="width:${neu / t * 100}%"></i><i class="s-opp" style="width:${opp / t * 100}%"></i></span>`; };
const totals = cs => cs.reduce((a, c) => [a[0] + c.sup, a[1] + c.n - c.sup - c.opp, a[2] + c.opp], [0, 0, 0]);
const summaryLine = c => `<span class="fbrow-h"><b class="fbn">${esc(c.category)}</b><span class="fbc">${c.n}</span>${stanceBar(c.sup, c.n - c.sup - c.opp, c.opp)}<span class="pill ${PILL[c.stance]}">${SHORT[c.stance]}</span></span><span class="fbs1">${esc(c.summary)}</span>`;

/* Compact list used by the Evidence and Investigate steps: one line per category. */
export function concernsCard(cid, title = 'What people say') {
  const cs = concernsOf(cid); if (!cs.length) return '';
  const t = totals(cs);
  return `<section class="card" id="concerns"><div class="row"><h2>${esc(title)}</h2><span class="small muted"><b class="t-green">${t[0]}</b> support · ${t[1]} neutral · <b class="t-red">${t[2]}</b> do not</span></div>
    <div class="fbrows">${cs.map(c => `<div class="fbrow static ${CLS[c.category]}">${summaryLine(c)}</div>`).join('')}</div><a class="small" href="#/case/${cid.replace(/-.*/, '')}/feedback">Details in the Feedback step</a></section>`;
}

/* The Feedback step. Nothing to press: messages are classified and summarised as the page opens. */
export async function stepFeedback(el, c, A, B) {
  const msgs = feedbackAbout(c.case_id);
  if (!msgs.length) { el.innerHTML = `<div class="card"><h2>Feedback about ${esc(A.name)} and ${esc(B.name)}</h2><p class="empty">Data unavailable: no citizen feedback is recorded about either school. Ask about it on the field visit.</p></div>`; return; }
  if (!concernsOf(c.case_id).length) { el.innerHTML = '<div class="card"><p class="muted">Reading the feedback…</p></div>'; await ensureFeedback(c.case_id); }
  const cons = concernsOf(c.case_id), cls = classified(c.case_id), by = Object.fromEntries(cls.map(x => [x.fb_id, x])), t = totals(cons);
  const aboutA = msgs.filter(m => m.about_id === A.school_id).length;
  el.innerHTML = `<section class="card" id="fbsum"><div class="row"><h2>What people say</h2><span class="small muted">${msgs.length} messages · ${aboutA} about ${esc(A.name)}, ${msgs.length - aboutA} about ${esc(B.name)}</span></div>
      <div class="fbtop">${stanceBar(...t)}<span class="stanceall"><b class="t-green">${t[0]} support</b> · <b>${t[1]} neutral</b> · <b class="t-red">${t[2]} do not support</b> merging</span></div>
      <div class="fbrows">${cons.map(k => fold(summaryLine(k), `<ul class="fbpts">${k.points.slice(0, 3).map(p => `<li>${esc(p.text)} <small>×${p.fb_ids.length}</small></li>`).join('')}</ul>
        ${fold('Messages', `<div class="fbmsgs">${cls.filter(x => x.category === k.category).slice(0, 8).map(x => { const m = msgs.find(y => y.fb_id === x.fb_id); return m ? `<div><i class="dot d-${x.stance}"></i>“${esc(m.text_en)}” <small>${esc(m.hab || m.sender_role)} · ${x.sentiment} about ${SUBJ[x.subject]}</small></div>` : ''; }).join('')}</div>`, { count: k.n, id: 'fbm-' + k.category })}
        <div class="small muted">${k.pos} positive · ${k.neg} negative · ${k.neu} neutral · ${k.src === 'gemini' ? 'summarised by Gemini' : 'summarised by rules'}</div>`, { cls: `fbrow ${CLS[k.category]}`, id: 'fb-' + k.category })).join('')}</div>
      ${fold('How this is worked out', `<p class="small muted">Every message is put in one category and given a sentiment about the closing school, the receiving school or the merger itself. Good about the receiving school, or bad about the closing school, counts as supporting merging; the reverse does not. The classification is a fixed table, not a model. ${llmConfigured() ? 'Gemini writes the summaries.' : 'Summaries are rule-based; connect Gemini under More → AI connection for written summaries.'} Messages are synthesised for the demo by PathShala.</p>${llmConfigured() ? '<button class="btn sm" id="fb-resum">Summarise again</button>' : ''}`, { id: 'fb-how' })}
    </section>`;
  const r = $('#fb-resum'); if (r) r.onclick = async () => { r.disabled = true; r.textContent = 'Summarising…'; try { await runCategoryAgents(c.case_id); save(); render(); } catch (e) { render(); toast('Summaries failed', [String(e.message || e)]); } };
}
export const hasConcerns = cid => (q1('SELECT count(*) AS n FROM concerns WHERE case_id = ?', [cid]).n || 0) > 0;
