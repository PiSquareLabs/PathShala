/* Providers decide HOW an agent produces its schema-shaped output. The UI never sees the difference.
   Config: VITE_AGENT_PROVIDER = simulated | gemini, VITE_AGENT_ENDPOINT, VITE_AGENT_STEP_DELAY_MS. */
import { renderPrompt } from './agents/index.js';
import { toolSchemas, tools } from './tools.js';

const env = import.meta.env || {};
export const CONFIG = {
  provider: env.VITE_AGENT_PROVIDER || 'simulated',
  endpoint: env.VITE_AGENT_ENDPOINT || '/api/agent',
  stepDelayMs: +(env.VITE_AGENT_STEP_DELAY_MS ?? 420),
};

/* Runs each agent's deterministic simulate(ctx): the prototype's behaviour, real tools, same outputs. */
export class SimulatedProvider {
  name = 'simulated';
  async call(agent, ctx) { return agent.simulate(ctx); }
}

/* Drives the agent with Gemini through a server proxy (Cloud Run + Vertex AI). NOT IMPLEMENTED.
   Contract (docs/AGENTS.md section 7):
     POST {endpoint}  { agent, case_id, system, messages, tools: toolSchemas, response_schema }
     <- NDJSON stream: {type:'tool_call', name, args, call_id}  -> run tools[name](args) here on sql.js,
                                                                   POST {call_id, output} back
                       {type:'final', json}                      -> validated against response_schema by the runner
   Never put the Gemini key in the browser: the proxy holds it and logs every call. */
export class GeminiProvider {
  name = 'gemini';
  buildRequest(agent, ctx) {
    return { agent: agent.id, case_id: ctx.cid, system: renderPrompt(agent, promptVars(ctx)), messages: [{ role: 'user', content: JSON.stringify(ctx.input ?? {}) }], tools: toolSchemas.filter(t => agent.tools.includes(t.name)), response_schema: agent.outputSchema };
  }
  async call(agent, ctx) {
    // TODO(gemini): POST this.buildRequest(agent, ctx) to CONFIG.endpoint, read the NDJSON stream, answer each
    // `tool_call` by running tools[name](args) and posting {call_id, output}, and return the `final` json.
    void tools;
    throw new Error('GeminiProvider is not implemented yet: set VITE_AGENT_PROVIDER=simulated');
  }
}

function promptVars(ctx) {
  return { case_id: ctx.cid, school_a: ctx.A?.name, school_b: ctx.B?.name, district: ctx.A?.district, block: ctx.A?.block };
}

let instance;
export function getProvider() {
  return (instance ||= CONFIG.provider === 'gemini' ? new GeminiProvider() : new SimulatedProvider());
}
