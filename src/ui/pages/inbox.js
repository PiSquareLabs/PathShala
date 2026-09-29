import { q, q1, run } from '../../db/sqlite.js';
import { classify } from '../../engine/classify.js';
import { analyse, commit } from '../../engine/rules.js';
import { msgHtml } from '../components.js';
import { $, $$, esc, go, groups, school, state, today } from '../helpers.js';

export const SAMPLES = [
  { g: 'G4', role: 'Mother of a girl student', ch: 'WhatsApp', t: 'हमारी बेटियाँ अकेले हाईवे पार करके नहीं जा सकतीं, डर लगता है।', en: 'Our daughters cannot cross the highway alone. We are scared.' },
  { g: 'G1', role: 'Village pradhan', ch: 'Phone call', t: 'The road to Uch was closed for three weeks last winter because of snow.', en: '' },
  { g: 'G3', role: 'Parent', ch: 'Grievance portal', t: 'मेरा बेटा अब स्कूल नहीं जाता, कमरे में बहुत भीड़ है।', en: 'My son does not go to school any more; the room is very crowded.' },
  { g: 'G2', role: 'Parent', ch: 'WhatsApp', t: 'छत स्कूल में पढ़ाई अच्छी है, बच्चे खुश हैं।', en: 'Studies at Chhat are good and the children are happy.' },
  { g: 'G4', role: 'Villager', ch: 'Gram sabha', t: 'Nobody asked the gram sabha before putting Jiyani on the list.', en: '' },
];
export function renderInbox(app) {
  const gs = groups();
  const d = state.draft || {};
  const gsel = d.group || (state.inboxGroup !== 'all' ? state.inboxGroup : 'G4');
  app.innerHTML = `<div class="inbox">
    <div class="card form">
      <h2>Log feedback <small>WhatsApp, calls, gram sabha, grievance portal</small></h2>
      <div class="samples">${SAMPLES.map((x, i) => `<button data-i="${i}" class="${/[ऀ-ॿ]/.test(x.t) ? 'hi' : ''}">${x.g} · ${esc(x.t.slice(0, 42))}…</button>`).join('')}</div>
      <label class="f">Message<textarea id="fb-t" rows="4" placeholder="Type or paste in Hindi or English">${esc(d.t || '')}</textarea></label>
      <div class="g2">
        <label class="f">Merge<select id="fb-g">${gs.map(g => `<option value="${g.group_id}" ${g.group_id === gsel ? 'selected' : ''}>${esc(g.s_name)} → ${esc(g.r_name)}</option>`).join('')}</select></label>
        <label class="f">From<input type="text" id="fb-role" value="${esc(d.role || 'Parent')}"></label>
      </div>
      <div class="g2">
        <label class="f">Channel<select id="fb-ch">${['WhatsApp', 'Phone call', 'Gram sabha', 'Grievance portal', 'School visit'].map(c => `<option ${c === d.ch ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
        <label class="f">English (optional)<input type="text" id="fb-en" value="${esc(d.en || '')}" placeholder="Gemini translates in the full build"></label>
      </div>
      <div class="classify" id="fb-cls"></div>
      <div class="row"><span class="small muted">Saving writes to <span class="mono">feedback</span> and re-runs the analysis.</span><button class="btn primary" id="fb-go">Save and re-analyse</button></div>
    </div>
    <div class="card">
      <h2>All feedback <small>${q1('SELECT count(*) AS n FROM feedback').n} messages</small></h2>
      <div class="filters" style="margin-bottom:6px"><button data-f="all" aria-pressed="${state.inboxGroup === 'all'}">All</button>${gs.map(g => `<button data-f="${g.group_id}" aria-pressed="${state.inboxGroup === g.group_id}">${g.group_id}</button>`).join('')}</div>
      <div class="msgs">${q(`SELECT * FROM feedback ${state.inboxGroup === 'all' ? '' : 'WHERE group_id = ?'} ORDER BY feedback_id DESC LIMIT 60`, state.inboxGroup === 'all' ? [] : [state.inboxGroup]).map(msgHtml).join('') || '<p class="empty">No feedback.</p>'}</div>
    </div>
  </div>`;
  const cls = () => {
    const t = $('#fb-t').value, c = classify(t);
    $('#fb-cls').innerHTML = t.trim() ? `<div class="eyebrow">Structured as</div><div class="kv"><span>Issue <b>${esc(c.issue)}</b></span><span>Sentiment <b>${c.sentiment}</b></span><span>Severity <b>${c.severity}</b></span><span>Language <b>${c.lang === 'hi' ? 'Hindi' : 'English'}</b></span></div><div class="small muted">Keyword classifier running in the page. Gemini does this in the full build.</div>` : '<span class="muted">Type a message to see how it is structured.</span>';
  };
  $('#fb-t').oninput = cls; cls();
  $$('.samples button', app).forEach(b => b.onclick = () => { const x = SAMPLES[b.dataset.i]; state.draft = { group: x.g, role: x.role, ch: x.ch, t: x.t, en: x.en }; renderInbox(app); });
  $$('.filters button', app).forEach(b => b.onclick = () => { state.inboxGroup = b.dataset.f; state.draft = collect(); renderInbox(app); });
  const collect = () => ({ group: $('#fb-g').value, role: $('#fb-role').value, ch: $('#fb-ch').value, t: $('#fb-t').value, en: $('#fb-en').value });
  $('#fb-go').onclick = () => {
    const d = collect(); if (!d.t.trim()) { $('#fb-t').focus(); return; }
    const c = classify(d.t);
    state.draft = null; state.inboxGroup = d.group;
    commit(`Feedback saved to ${d.group} · ${c.issue}`, () => {
      run(`INSERT INTO feedback (group_id, received, channel, language, sender_role, text_original, text_en, issue, severity, sentiment, verification, verified_by, source, based_on)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [d.group, today(), d.ch, c.lang, d.role || 'Unknown', d.t.trim(), c.lang === 'en' ? d.t.trim() : (d.en.trim() || null), c.issue, c.severity, c.sentiment, 'unverified', '', 'officer', 'Logged on the desk']);
    });
  };
}

/* ---------- rules ---------- */
