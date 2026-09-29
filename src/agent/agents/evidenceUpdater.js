import prompt from '../prompts/evidenceUpdater.md?raw';
import { schemas } from '../validate.js';
import { tools } from '../tools.js';

/* After field answers: maps each answer to evidence and finding statuses. Never changes a status without an answer. */
export const evidenceUpdater = {
  id: 'evidenceUpdater',
  systemPrompt: prompt,
  tools: ['apply_field_answers'],
  outputSchema: schemas.EvidenceUpdate,
  simulate: ctx => tools.apply_field_answers({ case_id: ctx.cid, answers: ctx.answers }),
};
