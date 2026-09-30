import prompt from '../prompts/policyResearcher.md?raw';
import { schemas } from '../validate.js';
import { q, q1 } from '../../db/sqlite.js';
import { routeInfo } from '../../case/options.js';
import { P, place, school } from '../../ui/helpers.js';
import { tools } from '../tools.js';

/* Connects findings to retrieved policy chunks and proposes interventions. Costs come only from cost_calc. */
export const policyResearcher = {
  id: 'policyResearcher',
  systemPrompt: prompt,
  tools: ['policy_retrieve', 'cost_calc'],
  outputSchema: schemas.Interventions,
  async simulate(ctx) {
    const cid = ctx.cid;
    const c = q1('SELECT * FROM cases WHERE case_id = ?', [cid]), A = school(c.from_id), rt = routeInfo(c.from_id, c.to_id), R = P();
    const F = q('SELECT * FROM findings WHERE case_id = ? AND removed = 0', [cid]);
    const query = 'transport escort distance terrain flood bridge habitation seasonal walking ' + F.map(f => f.title).join(' ');
    await tools.policy_retrieve({ query, k: 6 });
    const q2 = q1("SELECT answer FROM field_questions WHERE case_id = ? AND qid = 'Q2'", [cid])?.answer;
    const kids = +q2 || A.enrol_total;
    const have = new Set(q('SELECT eid FROM evidence WHERE case_id = ?', [cid]).map(e => e.eid));
    const refs = ids => ids.filter(e => have.has(e));
    const cost = (intervention, inputs) => tools.cost_calc({ intervention, inputs });
    const bridgeRef = q1("SELECT ref FROM evidence WHERE case_id = ? AND eid = 'E7'", [cid])?.ref;
    const primary = A.level_code === 'primary', limit = primary ? R.walk_limit_primary_km : R.walk_limit_upper_km;
    const rule = primary ? 'Children under 11 must have a school within 1 km (Rule 6(1)(a))' : `Children in Classes 6 to 8 must have a school within ${limit} km (Rule 6(1)(b))`;
    const rooms = have.has('E13') ? A.classrooms : 0;
    return { interventions: [
      { code: 'TR', title: 'School transport support', chunk_ids: ['C6', 'C4', 'C7'], interpretation: 'The consolidation increases travel for the affected students, and field verification and community feedback identify transport and access constraints.', evidence_refs: refs(['E1', 'E2', 'E3', 'E5']), cost: await cost('TR', { kids, kids_source: kids === A.enrol_total ? 'School roll' : 'Field count (Q2)', road_km: rt.road_km }) },
      ...(A.enrol_primary > 0 ? [{ code: 'ES', title: 'Escort for young children on the footpath', chunk_ids: ['C6'], interpretation: bridgeRef ? 'When the footbridge is open, an adult escort can walk the youngest children; the same Samagra Shiksha norm covers escort facility.' : 'An adult escort can walk the youngest children on the footpath; the same Samagra Shiksha norm covers escort facility.', evidence_refs: refs(['E10', 'E11']), cost: await cost('ES', { kids: A.enrol_primary }) }] : []),
      ...(bridgeRef ? [{ code: 'SEA', title: `Monsoon learning point at ${place(A).replace(/-\d+$/, '')} (Jul–Sep)`, chunk_ids: ['C3'], interpretation: 'RTE Rule 6(3) asks the government to avoid dangers from floods and difficult terrain on the route; a seasonal learning point keeps children off the crossing when it floods.', evidence_refs: refs(['E6', 'E7', 'E8']), cost: await cost('SEA', { feature_id: bridgeRef.replace('feature:', '') }) }] : []),
      { code: 'RET', title: rooms ? `Keep ${A.name} and replace the building` : `Keep ${A.name} open`, chunk_ids: ['C3', 'C1'], interpretation: `${rule}. ${bridgeRef ? `The case shows the alternative school is ${rt.walk_km} km on foot across a flood-prone crossing.` : `The alternative school is ${rt.est ? 'about ' : ''}${rt.walk_km} km on foot${rt.est ? ' (estimated from the straight line)' : ''}.`}`, evidence_refs: refs(['E13']), cost: await cost('RET', { classrooms: rooms }) },
    ] };
  },
};
