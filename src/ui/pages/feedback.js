import { CATEGORIES, CAT_AGENT, STANCE_LABEL, classified, concernsOf, feedbackAbout, runCategoryAgents, runClassify } from '../../agent/feedbackAgents.js';
import { llmConfigured } from '../../agent/llm.js';
import { q1, save } from '../../db/sqlite.js';
import { $, $$, esc, evChip } from '../helpers.js';
import { fold } from '../kit.js';
import { render } from '../router.js';
import { toast } from '../toast.js';

const CLS = { Transportation: 'k-tr', Safety: 'k-sf', 'Terrain and weather': 'k-tw', Social: 'k-so', Others: 'k-ot' };
const modeBadge = () => (llmConfigured() ? '<span class="pill s-green">Gemini</span>' : '<span class="pill s-pending">Rules (no AI key) <a href="#/ai">connect</a></span>');
const SUBJ = { sender: 'closing school', receiver: 'receiving school', merger: 'the merger' };

/* Stance bar: how many messages support merging, are neutral, or do not support it. */
export const stanceBar = (sup, neu, opp) => { const t = sup + neu + opp || 1; return `<span class="sbar" role="img" aria-label="${sup} support, ${neu} neutral, ${opp} do not support"><i class="s-sup" style="width:${sup / t * 100}%"></i><i class="s-neu" style="width:${neu / t * 100}%"></i><i class="s-opp" style="width:${opp / t * 100}%"></i></span>`; };
const tally = c => `<div class="small stancel"><span class="t-green">${c.sup} support</span> · <span class="muted">${c.n - c.sup - c.opp} neutral</span> · <span class="t-red">${c.opp} do not support</span></div>`;

const concernTile = c => `<div class="ctile ${CLS[c.category]}" data-stance="${c.stance}"><div class="row"><b>${esc(c.category)}</b><span class="pill ${c.stance === 'support' ? 's-green' : c.stance === 'oppose' ? 's-red' : 's-amber'}">${STANCE_LABEL[c.stance]}</span></div>
  ${stanceBar(c.sup, c.n - c.sup - c.opp, c.opp)}${tally(c)}<p>${esc(c.summary)}</p><ul>${c.points.map(p => `<li>${esc(p.text)} <small>(${p.fb_ids.length})</small></li>`).join('')}</ul>
  <div class="small muted">${c.pos} positive · ${c.neg} negative · ${c.neu} neutral · ${esc(c.agent)} · ${c.src === 'gemini' ? 'Gemini' : 'rules'}</div></div>`;

/* Concerns carried forward, used by the Evidence, Investigate and Report steps. */
export function concernsCard(cid, title = 'Concerns from citizen feedback') {
  const cs = concernsOf(cid); if (!cs.length) return '';
  return `<section class="card" id="concerns"><h2>${esc(title)} <small>one agent per category</small></h2><div class="ctiles">${cs.map(concernTile).join('')}</div></section>`;
}

/* The Feedback step: pool the messages about both schools, classify them, then one agent per category summarises. */
export function stepFeedback(el, c, A, B) {
  const msgs = feedbackAbout(c.case_id), cls = classified(c.case_id), cons = concernsOf(c.case_id), by = Object.fromEntries(cls.map(x => [x.fb_id, x]));
  if (!msgs.length) { el.innerHTML = `<div class="card"><h2>Feedback about ${esc(A.name)} and ${esc(B.name)}</h2><p class="empty">Data unavailable: no citizen feedback is recorded about either school. Ask about it on the field visit.</p></div>`; return; }
  const aboutA = msgs.filter(m => m.about_id === A.school_id).length, aboutB = msgs.length - aboutA;
  const groups = Object.fromEntries(CATEGORIES.map(k => [k, msgs.filter(m => by[m.fb_id]?.category === k)]));
  const tot = ['support', 'neutral', 'oppose'].map(s => cls.filter(x => x.stance === s).length);
  el.innerHTML = `<div class="card"><div class="ivtop"><h2 style="margin:0">1 · Classify the feedback</h2><span class="actions">${modeBadge()}<button class="btn ${cls.length ? '' : 'primary'}" id="fb-classify">${cls.length ? 'Classify again' : `Classify ${msgs.length} messages`}</button></span></div>
      <p class="small muted">${msgs.length} messages pooled from both sides of this comparison: ${aboutA} about ${esc(A.name)} (closing), ${aboutB} about ${esc(B.name)} (receiving). Synthesised for the demo by PathShala. The messages are about the schools, not necessarily about merging, so each gets a category, a sentiment, and a stance: good about the receiving school or bad about the closing school supports merging; the reverse does not.</p>
      <div class="cats" id="cats">${CATEGORIES.map(k => `<button class="cat ${CLS[k]}" data-cat="${esc(k)}" ${cls.length ? '' : 'disabled'}><b>${cls.length ? groups[k].length : '–'}</b><span>${esc(k)}</span>${cls.length && groups[k].length ? stanceBar(...['support', 'neutral', 'oppose'].map(s => groups[k].filter(m => by[m.fb_id].stance === s).length)) : ''}</button>`).join('')}</div>
      ${cls.length ? `<p class="stanceall">Overall: <b class="t-green">${tot[0]} support</b> · <b>${tot[1]} neutral</b> · <b class="t-red">${tot[2]} do not support</b> merging</p>` : ''}
      ${cls.length ? CATEGORIES.map(k => groups[k].length ? fold(`${k} messages`, `<div class="msgs">${groups[k].slice(0, 40).map(f => { const x = by[f.fb_id]; return `<div class="msg"><span class="who">${esc(f.sender_role)} · ${esc(f.hab || '')}</span><span class="en">“${esc(f.text_en)}”</span><span class="vf"><span class="pill ${x.sentiment === 'positive' ? 's-green' : x.sentiment === 'negative' ? 's-red' : ''}">${x.sentiment} about ${SUBJ[x.subject]}</span> <span class="pill">${STANCE_LABEL[x.stance === 'oppose' ? 'oppose' : x.stance]}</span> ${evChip(f.status)}</span></div>`; }).join('')}</div>${groups[k].length > 40 ? `<p class="small muted">Showing 40 of ${groups[k].length}.</p>` : ''}`, { count: groups[k].length, id: 'fb-' + k }) : '').join('') : '<p class="small muted">Not classified yet.</p>'}</div>
    <div class="card"><div class="ivtop"><h2 style="margin:0">2 · Category agents summarise the concerns</h2><span class="actions"><button class="btn ${cls.length && !cons.length ? 'primary' : ''}" id="fb-agents" ${cls.length ? '' : 'disabled'}>${cons.length ? 'Run agents again' : 'Run category agents'}</button></span></div>
      <p class="small muted">${CATEGORIES.map(k => CAT_AGENT[k]).join(' · ')}. Each summarises its category and whether it supports merging. These carry forward into Evidence, Investigate and the report.</p>
      <ol class="agent" id="fb-list">${cons.length ? '' : '<li class="muted small" style="list-style:none">Not run yet.</li>'}</ol>${cons.length ? `<div class="ctiles">${cons.map(concernTile).join('')}</div>` : ''}</div>`;
  $('#fb-classify').onclick = async () => {
    const b = $('#fb-classify'); b.disabled = true; b.textContent = 'Classifying…';
    try { const r = await runClassify(c.case_id); save(); render(); toast('Feedback classified', [`${r.n} messages · ${r.by === 'gemini' ? 'Gemini' : 'rules'}`, ...(r.note ? [r.note] : [])]); }
    catch (e) { console.error(e); render(); toast('Classification failed', [String(e.message || e)]); }
  };
  const ag = $('#fb-agents'); if (ag) ag.onclick = async () => {
    ag.disabled = true; ag.textContent = 'Agents working…'; const list = $('#fb-list'); list.innerHTML = ''; const rows = {};
    try {
      await runCategoryAgents(c.case_id, ev => {
        if (ev.type === 'start') { const li = document.createElement('li'); li.className = 'busy'; li.innerHTML = `<span class="ck">…</span><span><b>${esc(ev.agent)}</b> <code>${esc(ev.category)}</code></span>`; list.appendChild(li); rows[ev.category] = li; }
        else if (rows[ev.category]) { rows[ev.category].className = 'ok'; rows[ev.category].innerHTML = `<span class="ck">✓</span><span><b>${esc(ev.agent)}</b> <code>${esc(ev.category)}</code> <span class="small muted">${ev.src === 'gemini' ? 'Gemini' : 'rules'}</span></span>`; }
      });
      save(); render(); toast('Concerns summarised', ['They now appear in Evidence, Investigate and the report']);
    } catch (e) { console.error(e); render(); toast('Category agents failed', [String(e.message || e)]); }
  };
  $$('.cat', el).forEach(b => b.onclick = () => { const f = document.getElementById('fb-' + b.dataset.cat); if (f) { f.open = true; f.scrollIntoView({ block: 'nearest' }); } });
}
export const hasConcerns = cid => (q1('SELECT count(*) AS n FROM concerns WHERE case_id = ?', [cid]).n || 0) > 0;
