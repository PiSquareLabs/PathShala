/* The Gemini chat proxy (POST {endpoint}/chat, header X-API-Key). The key is NEVER in the source or the build:
   the officer pastes it on the AI connection page and it stays in this browser's localStorage. A build for local
   use may set VITE_LLM_API_KEY instead. */
const env = import.meta.env || {};
const K = 'pathshala.llm';
export const DEFAULT_ENDPOINT = env.VITE_LLM_ENDPOINT || 'https://pathshala-llm-api.onrender.com/chat';
const read = () => { try { return JSON.parse(localStorage.getItem(K) || '{}'); } catch (e) { return {}; } };
export const llmSettings = () => { const s = read(); return { endpoint: s.endpoint || DEFAULT_ENDPOINT, key: s.key || env.VITE_LLM_API_KEY || '', on: s.on !== false }; };
export function saveLlmSettings(p) { try { localStorage.setItem(K, JSON.stringify({ ...read(), ...p })); } catch (e) {} }
export const llmConfigured = () => { const s = llmSettings(); return !!(s.key && s.on); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* One chat call. Retries on 502/503/429 (the model is sometimes busy). Returns the reply text. */
export async function llmChat({ system, messages, max_tokens = 2048 }, tries = 4) {
  const s = llmSettings(); let err;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(s.endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-API-Key': s.key }, body: JSON.stringify({ messages, system, max_tokens }) });
      if (r.ok) { const j = await r.json(); if (j.finish_reason === 'MAX_TOKENS' && !j.reply) throw new Error('The model ran out of tokens'); return j.reply; }
      const t = await r.text(); err = new Error(`AI service ${r.status}: ${t.slice(0, 160)}`);
      if (![429, 502, 503, 504].includes(r.status)) throw err;
    } catch (e) { err = e; if (/AI service (400|401|403)/.test(e.message)) throw e; }
    await sleep(4000 * (i + 1));
  }
  throw err;
}

/* Ask for JSON only and parse it (fences and stray prose are tolerated). */
export async function llmJson(opts) {
  const text = await llmChat(opts), m = text.match(/[\[{][\s\S]*[\]}]/);
  if (!m) throw new Error('The model did not return JSON');
  return JSON.parse(m[0]);
}
