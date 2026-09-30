/* Feedback flow. The messages are about SCHOOLS, not necessarily about the merger, and are pooled from both
   sides of a comparison (everything about the closing school and about the receiving school).
   (1) Each message gets a category, a subject (sender / receiver / merger) and a sentiment towards that subject.
       Whether it SUPPORTS the merger follows from those by a fixed rule (below), never from the model.
   (2) One agent per category summarises the concerns; the counts come from the database.
   With an AI key the Gemini proxy does (1) and (2); without one, deterministic rules do. */
import { q, run } from '../db/sqlite.js';
import { logCase } from '../ui/helpers.js';
import { llmConfigured, llmJson } from './llm.js';

export const CATEGORIES = ['Transportation', 'Safety', 'Terrain and weather', 'Social', 'Others'];
export const CAT_AGENT = { Transportation: 'Transport agent', Safety: 'Safety agent', 'Terrain and weather': 'Terrain and weather agent', Social: 'Social agent', Others: 'Others agent' };
export const SENTIMENTS = ['positive', 'negative', 'neutral'], SUBJECTS = ['sender', 'receiver', 'merger'];

/* Stance on merging: good about the receiving school, or bad about the closing school, supports it; the reverse does not.
   A message about the merger itself supports it when positive. Neutral stays neutral. */
export function stanceOf(subject, sentiment) {
  if (sentiment === 'neutral') return 'neutral';
  const pos = sentiment === 'positive';
  return subject === 'sender' ? (pos ? 'oppose' : 'support') : (pos ? 'support' : 'oppose');
}
export const STANCE_LABEL = { support: 'Supports merging', oppose: 'Does not support merging', neutral: 'Neutral', mixed: 'Mixed' };
export const verdictOf = (sup, opp) => (sup === 0 && opp === 0 ? 'neutral' : sup > opp * 1.5 ? 'support' : opp > sup * 1.5 ? 'oppose' : 'mixed');

const RULES = [
  ['Transportation', /\b(bus|vehicle|taxi|fare|link road|main road|escort|go with|walk to|transport)\b/i],
  ['Safety', /(afraid|alone|wild|animal|unsafe|danger|collapse|fear)/i],
  ['Terrain and weather', /(rain|monsoon|winter|freez|stone|bridge|river|steep|climb|flood|snow|landslide|path|route)/i],
  ['Social', /(panchayat|identity|anganwadi|consult|caste|community|trust)/i],
];
const MERGER = /(identity|should not close|not consulted|what will happen|mid-day meal|panchayat)/i;
const SENDER = /(pekhri|our village school|our school|building|collapse|here too)/i;
const POS = /(good|better|will send|happy|support|more teachers)/i;
const NEG = /(afraid|not |cannot|no regular|collapse|difficult|closed|steep|unsafe|never|kutcha|freez|washes away|stones|wild|alone|who will|leaves at|broke)/i;
export function classifyByRules(text) {
  const category = (RULES.find(([, re]) => re.test(text)) || ['Others'])[0];
  const subject = MERGER.test(text) ? 'merger' : SENDER.test(text) ? 'sender' : 'receiver';
  const sentiment = MERGER.test(text) ? 'negative' : POS.test(text) && !NEG.test(text) ? 'positive' : NEG.test(text) ? 'negative' : 'neutral';
  return { category, subject, sentiment };
}

/* Everything said about the closing school or the receiving school, wherever the message came from. */
export const feedbackAbout = cid => q('SELECT f.*, h.name AS hab FROM citizen_feedback f LEFT JOIN habitations h ON h.hab_id = f.hab_id WHERE f.about_id IN (SELECT from_id FROM cases WHERE case_id = ?1 UNION SELECT to_id FROM cases WHERE case_id = ?1) ORDER BY f.fb_id', [cid]);
export const classified = cid => q('SELECT * FROM feedback_class WHERE case_id = ?', [cid]);
const ORDER = "CASE category WHEN 'Transportation' THEN 0 WHEN 'Safety' THEN 1 WHEN 'Terrain and weather' THEN 2 WHEN 'Social' THEN 3 ELSE 4 END";
export const concernsOf = cid => q(`SELECT * FROM concerns WHERE case_id = ? ORDER BY ${ORDER}`, [cid]).map(c => ({ ...c, points: JSON.parse(c.points || '[]') }));

const SYSTEM_CLASSIFY = `You read citizen feedback about schools in Himachal Pradesh, where a school (the "sender") may be closed and its children moved to another (the "receiver"). The messages are about schools, not always about the merger.
For each message give:
- category, exactly one of: ${CATEGORIES.join(', ')}. Transportation = buses, vehicles, fares, escorts, the link road. Safety = fear, wild animals, girls travelling alone, unsafe buildings. Terrain and weather = rain, snow, rivers, bridges, steep paths, landslides. Social = community, panchayat, identity, anganwadi, trust. Others = everything else.
- subject: "sender" (the school that may close), "receiver" (the school children would move to, or the route to it), or "merger" (the closure decision itself).
- sentiment towards that subject: positive, negative or neutral.
Return ONLY a JSON array: [{"id": <message id>, "category": "...", "subject": "...", "sentiment": "..."}]. Every id exactly once.`;

/* Step 1: classify. Returns {by, note, n} */
export async function runClassify(cid, onEvent = () => {}) {
  const msgs = feedbackAbout(cid); run('DELETE FROM feedback_class WHERE case_id = ?', [cid]); run('DELETE FROM concerns WHERE case_id = ?', [cid]);
  let by = 'rules', note = '', got = {};
  if (llmConfigured() && msgs.length) {
    try {
      const texts = [...new Set(msgs.map(m => m.text_en))], ids = Object.fromEntries(texts.map((t, i) => [t, i + 1]));   // repeated sentences are classified once
      onEvent({ label: `Asking Gemini to classify ${texts.length} distinct messages` });
      const out = await llmJson({ system: SYSTEM_CLASSIFY, messages: [{ role: 'user', content: JSON.stringify(texts.map(t => ({ id: ids[t], text: t }))) }], max_tokens: 4096 });
      const byId = {}; (Array.isArray(out) ? out : out.items || []).forEach(o => { if (CATEGORIES.includes(o.category) && SENTIMENTS.includes(o.sentiment) && SUBJECTS.includes(o.subject)) byId[o.id] = o; });
      msgs.forEach(m => { if (byId[ids[m.text_en]]) got[m.fb_id] = byId[ids[m.text_en]]; });
      by = 'gemini'; const miss = msgs.filter(m => !got[m.fb_id]).length; if (miss) note = `${miss} messages the model skipped were classified by rules`;
    } catch (e) { note = `AI unavailable (${e.message}); rules used`; by = 'rules'; got = {}; }
  }
  msgs.forEach(m => { const r = got[m.fb_id] || classifyByRules(m.text_en); run('INSERT INTO feedback_class VALUES (?,?,?,?,?,?,?)', [cid, m.fb_id, r.category, r.subject, r.sentiment, stanceOf(r.subject, r.sentiment), got[m.fb_id] ? 'gemini' : 'rules']); });
  logCase(cid, 'Agent', `Classified ${msgs.length} feedback messages`, `${by}${note ? ' · ' + note : ''}`);
  return { by, note, n: msgs.length };
}

const SYSTEM_SUMMARY = cat => `You are the ${CAT_AGENT[cat]} for PathShala, used by district education officers assessing a school merger in Himachal Pradesh. You receive citizen messages classified as "${cat}", each with a subject (sender = the school that may close, receiver = the school children would move to, merger = the decision) and a sentiment.
Summarise the concerns using ONLY these messages. Do not invent facts or numbers; do not recommend approving or rejecting the merger.
Return ONLY JSON: {"summary": "<at most 40 words>", "points": [{"text": "<one concern, at most 15 words>", "fb_ids": [<message ids that support it>]}]} with at most 4 points.`;

function simulatedSummary(rows) {
  const g = {}; rows.forEach(r => { (g[r.text_en] ||= []).push(r); });
  const top = Object.entries(g).sort((a, b) => b[1].length - a[1].length).slice(0, 4), habs = new Set(rows.map(r => r.hab_id).filter(Boolean)).size;
  return { summary: `${rows.length} responses${habs ? ` from ${habs} habitations` : ''}. Most repeated: "${top[0][0]}" (${top[0][1].length}).`, points: top.map(([t, rs]) => ({ text: t, fb_ids: rs.map(r => r.fb_id) })) };
}

/* Step 2: one agent per category summarises its concerns; counts and stance come from the classified rows. */
export async function runCategoryAgents(cid, onEvent = () => {}) {
  const msgs = Object.fromEntries(feedbackAbout(cid).map(m => [m.fb_id, m])), cls = classified(cid);
  run('DELETE FROM concerns WHERE case_id = ?', [cid]);
  const now = new Date().toISOString().slice(0, 10);
  for (const cat of CATEGORIES) {   // one call at a time: the proxy rate-limits bursts
    const mine = cls.filter(c => c.category === cat && msgs[c.fb_id]), rows = mine.map(c => ({ ...msgs[c.fb_id], subject: c.subject, sentiment: c.sentiment }));
    if (!rows.length) continue;
    onEvent({ type: 'start', agent: CAT_AGENT[cat], category: cat });
    let out, src = 'rules';
    if (llmConfigured()) {
      try {
        const g = {}; rows.forEach(r => { (g[r.text_en + '|' + r.subject + '|' + r.sentiment] ||= { text: r.text_en, subject: r.subject, sentiment: r.sentiment, fb_ids: [] }).fb_ids.push(r.fb_id); });
        out = await llmJson({ system: SYSTEM_SUMMARY(cat), messages: [{ role: 'user', content: JSON.stringify(Object.values(g).map(x => ({ ...x, count: x.fb_ids.length }))) }], max_tokens: 2048 });
        if (typeof out.summary !== 'string' || !Array.isArray(out.points)) throw new Error('unexpected shape');
        const valid = new Set(rows.map(r => r.fb_id)); out.points = out.points.slice(0, 4).map(p => ({ text: String(p.text), fb_ids: (p.fb_ids || []).filter(i => valid.has(i)) }));
        src = 'gemini';
      } catch (e) { out = null; }
    }
    out ||= simulatedSummary(rows);
    const n = (k, v) => mine.filter(c => c[k] === v).length, sup = n('stance', 'support'), opp = n('stance', 'oppose');
    run('INSERT INTO concerns VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', [cid, cat, CAT_AGENT[cat], out.summary, JSON.stringify(out.points), rows.length, new Set(rows.map(r => r.hab_id).filter(Boolean)).size, n('sentiment', 'positive'), n('sentiment', 'negative'), n('sentiment', 'neutral'), sup, opp, verdictOf(sup, opp), src, now]);
    onEvent({ type: 'done', agent: CAT_AGENT[cat], category: cat, src });
  }
  logCase(cid, 'Agent', 'Category agents summarised the feedback', concernsOf(cid).map(c => `${c.category}: ${c.n} (${c.sup} support, ${c.opp} do not)`).join(' · '));
}
