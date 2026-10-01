import prompt from '../prompts/reportDrafter.md?raw';
import { schemas } from '../validate.js';
import { tools } from '../tools.js';

/* Drafts the rationale from case evidence only; every sentence carries its references. */
export const reportDrafter = {
  id: 'reportDrafter',
  systemPrompt: prompt,
  tools: ['get_case_evidence', 'draft_report'],
  outputSchema: schemas.Draft,
  simulate: ctx => tools.draft_report({ case_id: ctx.cid }),
};
