/* Merge-side agents: deterministic rules today, same shape so they can be LLM-assisted later. */
import { evalPair } from '../../engine/evalPair.js';
import { computeMerges } from '../../engine/merges.js';
import { analyseAll } from '../../engine/rules.js';

export const mergePlanner = { id: 'mergePlanner', systemPrompt: 'Rate how well a closing school matches a receiving school (evalPair) and check combined capacity.', tools: ['sql_query'], outputSchema: null, simulate: ({ s, r, R, opts }) => evalPair(s, r, R, opts) };
export const successMonitor = { id: 'successMonitor', systemPrompt: 'Compute the success score of a merged school and list the problems to address.', tools: ['sql_query'], outputSchema: null, simulate: ({ R }) => computeMerges(R) };
export const surveyBuilder = { id: 'surveyBuilder', systemPrompt: 'List unknown data points and the community questions for a field survey.', tools: ['sql_query'], outputSchema: null, simulate: () => analyseAll() };
