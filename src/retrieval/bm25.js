import { q } from '../db/sqlite.js';

export function retrieve(query, k = 5) {
  const docs = q('SELECT c.*, d.title AS doc_title, d.url, d.issuer FROM policy_chunks c JOIN policy_docs d USING (doc_id)');
  const tok = s => s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(w => w.length > 2);
  const qs = [...new Set(tok(query))];
  const D = docs.map(d => tok(d.text + ' ' + d.keywords + ' ' + d.section));
  const avg = D.reduce((a, d) => a + d.length, 0) / D.length, N = D.length;
  const df = w => D.filter(d => d.includes(w)).length;
  return docs.map((d, i) => {
    let sc = 0; qs.forEach(w => { const f = D[i].filter(x => x === w).length; if (!f) return; const idf = Math.log(1 + (N - df(w) + 0.5) / (df(w) + 0.5)); sc += idf * f * 2.2 / (f + 1.2 * (0.25 + 0.75 * D[i].length / avg)); });
    return Object.assign(d, { score: +sc.toFixed(2), hits: qs.filter(w => D[i].includes(w)) });
  }).filter(d => d.score > 0).sort((a, b) => b.score - a.score).slice(0, k);
}
