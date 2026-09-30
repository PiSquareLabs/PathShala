import { DEFAULT_ENDPOINT, llmChat, llmConfigured, llmSettings, saveLlmSettings } from '../../agent/llm.js';
import { $, esc } from '../helpers.js';
import { pageHead } from '../kit.js';
import { render } from '../router.js';

/* The Gemini proxy key lives only in this browser (localStorage). It is never in the source or the built page. */
export function renderAi(pg) {
  const s = llmSettings();
  pg.innerHTML = `${pageHead('', 'AI connection')}
    <div class="card"><p class="small muted">The Feedback step can classify messages and summarise concerns with Gemini. Without a key it uses built-in rules. The key is stored only in this browser and is sent only to the address below.</p>
      <label class="f">API key<input type="password" id="ai-key" autocomplete="off" value="${esc(s.key)}" placeholder="Paste the key"></label>
      <label class="f">Chat address<input type="text" id="ai-url" value="${esc(s.endpoint)}"></label>
      <label class="lyr"><input type="checkbox" id="ai-on" ${s.on ? 'checked' : ''}> Use Gemini when a key is set</label>
      <div class="row" style="margin-top:10px"><span id="ai-state" class="small">${llmConfigured() ? '<span class="t-green">Connected: Gemini will be used.</span>' : '<span class="muted">Not connected: rules are used.</span>'}</span>
        <span class="actions"><button class="btn" id="ai-clear">Remove key</button><button class="btn" id="ai-test">Test</button><button class="btn primary" id="ai-save">Save</button></span></div></div>`;
  const grab = () => ({ key: $('#ai-key').value.trim(), endpoint: $('#ai-url').value.trim() || DEFAULT_ENDPOINT, on: $('#ai-on').checked });
  $('#ai-save').onclick = () => { saveLlmSettings(grab()); render(); };
  $('#ai-clear').onclick = () => { saveLlmSettings({ key: '' }); render(); };
  $('#ai-test').onclick = async () => {
    saveLlmSettings(grab()); const st = $('#ai-state'); st.textContent = 'Testing…';
    try { const r = await llmChat({ system: 'Reply with one short sentence.', messages: [{ role: 'user', content: 'Say hello to PathShala.' }], max_tokens: 256 }, 2); st.innerHTML = `<span class="t-green">Working: ${esc(r || '(empty reply)')}</span>`; }
    catch (e) { st.innerHTML = `<span class="t-red">${esc(e.message)}</span>`; }
  };
}
