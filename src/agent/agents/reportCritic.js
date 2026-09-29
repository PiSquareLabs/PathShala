import prompt from '../prompts/reportCritic.md?raw';
import { schemas } from '../validate.js';
import { NO_INTERVENTION } from '../../case/draft.js';
import { q1 } from '../../db/sqlite.js';
import { tools } from '../tools.js';

const APPROVAL = /\b(approved|approves|recommended to merge|recommend(?:s|ed)? (?:the )?(?:merger|merge|closure))\b/i;
const numbersIn = s => [...s.matchAll(/\d+(?:\.\d+)?/g)].map(m => m[0]);

/* Checks a draft: every sentence referenced, every cited ID real, every number present in the case
   evidence, no approval language. Deterministic, so it also serves as the regex guard in LLM mode. */
export const reportCritic = {
  id: 'reportCritic',
  systemPrompt: prompt,
  tools: ['get_case_evidence'],
  outputSchema: schemas.Critique,
  async simulate(ctx) {
    const data = await tools.get_case_evidence({ case_id: ctx.cid });
    const eids = new Set(data.evidence.map(e => e.eid));
    const corpus = [...data.evidence.flatMap(e => [e.label, e.detail]), ...data.field_answers.flatMap(a => [a.text, a.answer, a.note]), ...data.interventions.flatMap(v => [v.title, v.formula, String(v.cost_inr)]), ...data.chunks.map(c => c.text)].filter(Boolean).join(' \n ');
    const has = n => new RegExp('(^|[^\\d.])' + n.replace('.', '\\.') + '($|[^\\d])').test(corpus) || corpus.includes(n);
    const issues = [];
    ctx.sentences.forEach((s, i) => {
      if (s.text === NO_INTERVENTION) return;
      if (!s.refs.length) issues.push({ sentence_index: i, problem: 'No reference', fix: 'Cite the evidence or policy chunk that supports this sentence.' });
      s.refs.forEach(r => {
        const ok = r.startsWith('E') ? eids.has(r) : r.startsWith('C') ? !!q1('SELECT 1 AS x FROM policy_chunks WHERE chunk_id = ?', [r]) : false;
        if (!ok) issues.push({ sentence_index: i, problem: `Unknown reference ${r}`, fix: 'Cite an ID that exists in the case.' });
      });
      numbersIn(s.text).filter(n => !has(n)).forEach(n => issues.push({ sentence_index: i, problem: `Number ${n} is not in the case evidence`, fix: 'Remove it or add the evidence.' }));
      if (APPROVAL.test(s.text)) issues.push({ sentence_index: i, problem: 'Approval language', fix: 'The officer decides; describe the evidence only.' });
    });
    return { pass: issues.length === 0, issues };
  },
};
