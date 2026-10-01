import Ajv from 'ajv/dist/2020.js';
import costCalc from './schemas/cost_calc_output.json';
import critique from './schemas/critique.json';
import draft from './schemas/draft.json';
import evidence from './schemas/evidence.json';
import evidenceBundle from './schemas/evidence_bundle.json';
import evidenceUpdate from './schemas/evidence_update.json';
import fieldQuestions from './schemas/field_questions.json';
import findings from './schemas/findings.json';
import interventions from './schemas/interventions.json';

export const schemas = { Findings: findings, EvidenceBundle: evidenceBundle, FieldQuestions: fieldQuestions, EvidenceUpdate: evidenceUpdate, Interventions: interventions, Draft: draft, Critique: critique, CostCalcOutput: costCalc, Evidence: evidence };

const ajv = new Ajv({ allErrors: true, strict: false });
Object.values(schemas).forEach(s => ajv.addSchema(s));

/* Returns null when `value` matches the schema, else a readable error string. */
export function validate(schema, value) {
  const fn = ajv.getSchema(schema.$id);
  if (fn(value)) return null;
  return fn.errors.map(e => `${e.instancePath || '/'} ${e.message}`).join('; ');
}
