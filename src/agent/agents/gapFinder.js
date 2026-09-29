import prompt from '../prompts/gapFinder.md?raw';
import { schemas } from '../validate.js';

/* Missing evidence -> one targeted field question per gap, naming the actual place. */
export const gapFinder = {
  id: 'gapFinder',
  systemPrompt: prompt,
  tools: ['evidence_gaps'],
  outputSchema: schemas.FieldQuestions,
  async simulate(ctx) {
    const bridge = ctx.hz.find(h => h.kind === 'bridge'), g = ctx.gaps;
    return { questions: [
      { qid: 'Q1', text: `Is the ${bridge ? bridge.name : 'river crossing'} passable during heavy rain?`, type: 'choice', options: ['Yes', 'No', 'Seasonal'], gap: g[0] },
      { qid: 'Q2', text: 'How many affected students currently use this route?', type: 'number', options: [], gap: g[1] },
      { qid: 'Q3', text: 'Is public transport available at school arrival and departure times?', type: 'choice', options: ['Yes', 'No', 'Unknown'], gap: g[2] },
      { qid: 'Q4', text: 'What is the approximate travel time during school hours?', type: 'minutes', options: [], gap: g[3] },
      { qid: 'Q5', text: 'Upload supporting evidence', type: 'evidence', options: ['Photo', 'GPS', 'Note'], gap: g[4] },
    ] };
  },
};
