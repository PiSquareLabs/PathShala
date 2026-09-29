import prompt from '../prompts/policyResearcher.md?raw';
import { schemas } from '../validate.js';
import { q, q1 } from '../../db/sqlite.js';
import { linkOf, school } from '../../ui/helpers.js';
import { tools } from '../tools.js';

/* Connects findings to retrieved policy chunks and proposes interventions. Costs come only from cost_calc. */
export const policyResearcher = {
  id: 'policyResearcher',
  systemPrompt: prompt,
  tools: ['policy_retrieve', 'cost_calc'],
  outputSchema: schemas.Interventions,
  async simulate(ctx) {
    const cid = ctx.cid;
    const c = q1('SELECT * FROM cases WHERE case_id = ?', [cid]), A = school(c.from_id), L = linkOf(c.from_id, c.to_id);
    const F = q('SELECT * FROM findings WHERE case_id = ? AND removed = 0', [cid]);
    const query = 'transport escort distance terrain flood bridge habitation seasonal walking ' + F.map(f => f.title).join(' ');
    await tools.policy_retrieve({ query, k: 6 });
    const q2 = q1("SELECT answer FROM field_questions WHERE case_id = ? AND qid = 'Q2'", [cid])?.answer;
    const kids = +q2 || q1('SELECT sum(children) AS n FROM habitations WHERE school_id = ?', [A.school_id]).n || A.enrol_total;
    const have = new Set(q('SELECT eid FROM evidence WHERE case_id = ?', [cid]).map(e => e.eid));
    const refs = ids => ids.filter(e => have.has(e));
    const cost = (intervention, inputs) => tools.cost_calc({ intervention, inputs });
    return { interventions: [
      { code: 'TR', title: 'School transport support', chunk_ids: ['C6', 'C4', 'C7'], interpretation: 'The consolidation increases travel for the affected students, and field verification and community feedback identify transport and access constraints.', evidence_refs: refs(['E1', 'E2', 'E3', 'E5']), cost: await cost('TR', { kids, kids_source: kids === A.enrol_total ? 'School roll' : 'Field count (Q2)', road_km: L.road_km }) },
      { code: 'ES', title: 'Escort for young children on the footpath', chunk_ids: ['C6'], interpretation: 'When the footbridge is open, an adult escort can walk the youngest children; the same Samagra Shiksha norm covers escort facility.', evidence_refs: refs(['E10', 'E11']), cost: await cost('ES', { kids }) },
      { code: 'SEA', title: 'Monsoon learning point at Pekhri (Jul–Sep)', chunk_ids: ['C3'], interpretation: 'RTE Rule 6(3) asks the government to avoid dangers from floods and difficult terrain on the route; a seasonal learning point keeps children off the crossing when it floods.', evidence_refs: refs(['E6', 'E7', 'E8']), cost: await cost('SEA', {}) },
      { code: 'RET', title: `Keep ${A.name} and replace the building`, chunk_ids: ['C3', 'C1'], interpretation: `Children under 11 must have a school within 1 km (Rule 6(1)(a)). The case shows the alternative school is ${L.walk_km} km on foot across a flood-prone crossing.`, evidence_refs: refs(['E13']), cost: await cost('RET', { classrooms: 2 }) },
    ] };
  },
};
