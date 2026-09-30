/* Retrieval over five collections built from the data already in the database:
     policy   RTE Rules, Samagra Shiksha norms, HP merger decision, NEP 2020, court cases   (one piece per rule or clause)
     feedback citizen messages                                                              (one piece per message)
     reports  public news items, always "Web source, needs verification"                    (fixed sample items)
     case     findings, evidence and field answers of the current case
     past     earlier merger cases (precedents)
   Every piece carries source, date, place and whether it is "exact wording" or a "summary".
   Search = keywords (BM25) + meaning (Gemini embeddings when a key is set), filtered by place, top 5.
   Nothing matching -> "No source found". An answer may cite only passages returned by the search that produced it. */
import { q } from '../db/sqlite.js';
import { school } from '../ui/helpers.js';
import { llmConfigured, llmEmbed } from './llm.js';

export const COLLECTIONS = ['policy', 'feedback', 'reports', 'case', 'past'];
export const WEB_LABEL = 'Web source, needs verification';
export const NO_SOURCE = 'No source found';

/* Fixed sample items, restating the Tribune reports already recorded in the field observations (F1, F2) and the facts table.
   They are summaries, not quotations, and they are never treated as verified. */
const REPORTS = [
  { id: 'W1', title: 'The Tribune: villagers set up a wooden bridge over the Tirthan river for the third time', date: '2025-08', place: 'Tirthan valley', places: ['Baridropa', 'Jawal', 'Pekhri'],
    text: 'Villagers built a wooden footbridge over the Tirthan river after the earlier bridge was washed away; the report describes it as the third time. The footbridge at Baridropa and Jawal washed away on 13 August 2025 and villagers rebuilt a wooden bridge. It is not safe in heavy rain.',
    url: 'https://www.tribuneindia.com/news/himachal/villagers-join-hands-to-set-up-wooden-bridge-over-tirthan-river-for-third-time/amp' },
  { id: 'W2', title: 'The Tribune: unsafe schools of Tirthan valley', date: '2026-09', place: 'Tirthan valley', places: ['Pekhri', 'Banjar'],
    text: 'The Pekhri-2 school building is reported to be in poor condition and to need demolition and replacement, as reported by the vice-pradhan. GMS Nahin is reported unsafe, with classes held under tin sheds.',
    url: 'https://www.tribuneindia.com/news/himachal/unsafe-schools-of-tirthan-valley/' },
];

const STOP = new Set(['the', 'and', 'for', 'school', 'schools', 'route', 'children', 'gps', 'gms', 'with', 'from', 'are', 'that', 'this']);   // too common to mean anything
const tok = s => s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(w => w.length > 2 && !STOP.has(w));

/* Places a case can legitimately draw on: the country, the state, and the district, block, habitations and schools involved. */
export function placesFor(schoolIds) {
  const set = new Set(['India', 'Himachal Pradesh']);
  schoolIds.map(school).filter(Boolean).forEach(s => {
    [s.district, s.block, s.name].filter(Boolean).forEach(x => set.add(x));
    q('SELECT name FROM habitations WHERE school_id = ?', [s.school_id]).forEach(h => set.add(h.name));
    if (s.block === 'Banjar') set.add('Tirthan valley');
  });
  return set;
}

/* Build the pieces of one collection. `cid` (a track id) is needed only for the case collection. */
export function pieces(collection, cid) {
  if (collection === 'policy') return q('SELECT c.*, d.title AS doc_title, d.url, d.year, d.issuer FROM policy_chunks c JOIN policy_docs d USING (doc_id)').map(c => ({
    id: c.chunk_id, collection, text: c.text, extra: `${c.keywords} ${c.section}`, title: `${c.doc_title}, ${c.section}`, source: c.doc_title, url: c.url, date: String(c.year),
    place: ['HP25', 'HCS26'].includes(c.doc_id) ? 'Himachal Pradesh' : 'India', wording: c.verbatim ? 'exact wording' : 'summary', label: '' }));
  if (collection === 'feedback') return q('SELECT f.*, h.name AS hab, s.block FROM citizen_feedback f LEFT JOIN habitations h USING (hab_id) LEFT JOIN schools s ON s.school_id = f.about_id').map(f => ({
    id: 'FB' + f.fb_id, collection, text: f.text_en, extra: f.theme, title: `Citizen message${f.hab ? ' from ' + f.hab : ''}`, source: 'Citizen feedback (PathShala, synthesised)', url: '', date: f.received,
    place: f.hab || f.block || 'Himachal Pradesh', about: f.about_id, wording: 'exact wording', label: '' }));
  if (collection === 'reports') return REPORTS.map(r => ({ id: r.id, collection, text: r.text, extra: '', title: r.title, source: r.title, url: r.url, date: r.date, place: r.place, places: r.places, wording: 'summary', label: WEB_LABEL }));
  if (collection === 'past') return q('SELECT * FROM precedents').map(p => ({ id: 'P' + p.precedent_id, collection, text: `${p.case_name}. ${p.pattern}. ${p.outcome}`, extra: '', title: p.case_name, source: p.case_name, url: p.url, date: String(p.year), place: p.state === 'Himachal Pradesh' ? 'Himachal Pradesh' : p.state, wording: 'summary', label: '' }));
  if (collection === 'case') {
    if (!cid) return [];
    const src = `Case record ${cid}`, out = [];
    q('SELECT * FROM findings WHERE case_id = ? AND removed = 0', [cid]).forEach(f => out.push({ id: f.fid, collection, text: `${f.title}. ${f.summary} Status: ${f.status}.`, extra: '', title: f.title, source: src, url: '', date: '', place: 'Himachal Pradesh', wording: 'summary', label: '' }));
    q('SELECT * FROM evidence WHERE case_id = ?', [cid]).forEach(e => out.push({ id: e.eid, collection, text: `${e.label}. ${e.detail || ''}`, extra: e.status, title: e.label, source: src, url: '', date: '', place: 'Himachal Pradesh', wording: 'summary', label: '' }));
    q('SELECT * FROM field_questions WHERE case_id = ? AND (answer != \'\' OR note != \'\')', [cid]).forEach(x => out.push({ id: 'A' + x.qid, collection, text: `${x.text} Answer: ${x.answer || ''} ${x.note || ''}`, extra: '', title: x.text, source: src + ' (field answer)', url: '', date: x.answered_on || '', place: 'Himachal Pradesh', wording: 'exact wording', label: '' }));
    return out;
  }
  return [];
}

function bm25(docs, query) {
  const qs = [...new Set(tok(query))], D = docs.map(d => tok(d.text + ' ' + (d.extra || '') + ' ' + d.title)), N = D.length || 1;
  const avg = D.reduce((a, d) => a + d.length, 0) / N || 1, df = w => D.filter(d => d.includes(w)).length;
  return docs.map((d, i) => {
    let sc = 0; qs.forEach(w => { const f = D[i].filter(x => x === w).length; if (!f) return; const idf = Math.log(1 + (N - df(w) + 0.5) / (df(w) + 0.5)); sc += idf * f * 2.2 / (f + 1.2 * (0.25 + 0.75 * D[i].length / avg)); });
    return { ...d, score: +sc.toFixed(2), hits: qs.filter(w => D[i].includes(w)) };
  }).filter(d => d.score > 0);
}
const cosine = (a, b) => { let x = 0, na = 0, nb = 0; for (let i = 0; i < a.length; i++) { x += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; } return x / (Math.sqrt(na * nb) || 1); };

/* search({collections, query, places, cid, k}) -> {passages, mode, none, note} */
export async function search({ collections = COLLECTIONS, query, places, cid, k = 5, about }) {
  // a model may send one name, a comma list or nothing: accept all of them and ignore unknown collections
  const list = v => (Array.isArray(v) ? v : typeof v === 'string' ? v.split(/[,\s]+/) : []).map(String).filter(Boolean);
  collections = list(collections).filter(c => COLLECTIONS.includes(c)); if (!collections.length) collections = COLLECTIONS;
  if (places != null && !(places instanceof Set)) { places = typeof places === 'string' ? [places] : list(places); if (!places.length) places = undefined; }
  query = String(query ?? '');
  const allowed = places ? (places instanceof Set ? places : new Set(places)) : null;
  let docs = collections.flatMap(c => pieces(c, cid));
  if (allowed) docs = docs.filter(d => allowed.has(d.place) || (d.places || []).some(p => allowed.has(p)));
  if (about) docs = docs.filter(d => d.collection !== 'feedback' || about.includes(d.about));
  let ranked = bm25(docs, query).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id)), mode = 'keyword', note = '';
  if (llmConfigured() && ranked.length) {
    try {
      const cand = ranked.slice(0, 30), vecs = await llmEmbed([query, ...cand.map(c => c.text)]), qv = vecs[0];
      const sem = cand.map((c, i) => ({ id: c.id, s: cosine(qv, vecs[i + 1]) })).sort((a, b) => b.s - a.s), rr = {};
      cand.forEach((c, i) => { rr[c.id] = 1 / (60 + i + 1); }); sem.forEach((x, i) => { rr[x.id] += 1 / (60 + i + 1); });
      ranked = cand.map(c => ({ ...c, semantic: +(sem.find(x => x.id === c.id).s).toFixed(3) })).sort((a, b) => rr[b.id] - rr[a.id]); mode = 'keyword + meaning (Gemini embeddings)';
    } catch (e) { note = `Meaning search unavailable (${e.message}); keywords only`; }
  }
  const passages = ranked.slice(0, k).map(({ extra, ...p }) => p);
  return { passages, mode, none: !passages.length, note, text: passages.length ? '' : NO_SOURCE };
}
export const passageById = (id, cid) => COLLECTIONS.flatMap(c => pieces(c, cid)).find(p => p.id === id);
