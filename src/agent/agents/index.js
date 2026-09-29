import { accessAnalyst } from './accessAnalyst.js';
import { communityAnalyst } from './communityAnalyst.js';
import { coordinator } from './coordinator.js';
import { evidenceUpdater } from './evidenceUpdater.js';
import { gapFinder } from './gapFinder.js';
import { mergePlanner, successMonitor, surveyBuilder } from './mergeAgents.js';
import { policyResearcher } from './policyResearcher.js';
import { reportCritic } from './reportCritic.js';
import { reportDrafter } from './reportDrafter.js';

export const AGENTS = { coordinator, accessAnalyst, communityAnalyst, gapFinder, evidenceUpdater, policyResearcher, reportDrafter, reportCritic, mergePlanner, successMonitor, surveyBuilder };

/* Fill the {{placeholders}} of a system prompt. */
export const renderPrompt = (agent, vars) => agent.systemPrompt.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? `{{${k}}}`);
