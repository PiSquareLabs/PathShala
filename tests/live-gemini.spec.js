import { execFileSync } from 'node:child_process';
import { expect, test } from '@playwright/test';
/* Runs against the real Gemini proxy only when LLM_KEY is in the environment (never committed). */
test.skip(!process.env.LLM_KEY, 'set LLM_KEY to run against Gemini');
test('live Gemini: category summaries', async ({ page }) => {
  test.setTimeout(240000);
  // the sandbox browser has no route to the internet: relay the proxy call through curl (which does)
  await page.route('https://pathshala-llm-api.onrender.com/**', route => {
    const req = route.request(), CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type,x-api-key' };
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 200, headers: CORS });
    const out = execFileSync('curl', ['-s', '-m', '120', '-w', '\n%{http_code}', '-X', 'POST', req.url(), '-H', 'Content-Type: application/json', '-H', 'X-API-Key: ' + req.headers()['x-api-key'], '-d', req.postData()], { encoding: 'utf8', maxBuffer: 1e7 });
    const i = out.lastIndexOf('\n');
    route.fulfill({ status: +out.slice(i + 1), headers: CORS, contentType: 'application/json', body: out.slice(0, i) });
  });
  await page.goto('/'); await page.waitForSelector('#hmap');
  await page.evaluate(k => localStorage.setItem('pathshala.llm', JSON.stringify({ key: k })), process.env.LLM_KEY); await page.reload(); await page.waitForSelector('#hmap');
  const r = await page.evaluate(async () => {
    const P = window.__pathshala, inv = P.createCase('PK2', ['GSH']), cid = inv + '-GSH';
    const c = await P.runClassify(cid); await P.runCategoryAgents(cid);
    return { c, cls: P.q('SELECT category, sentiment, subject, stance, src, count(*) n FROM feedback_class WHERE case_id = ? GROUP BY 1,2,3,4,5', [cid]), con: P.q('SELECT category, summary, src, sup, opp, stance FROM concerns WHERE case_id = ?', [cid]) };
  });
  console.log(JSON.stringify(r, null, 1));
  expect(r.con.every(c => c.src === 'gemini')).toBeTruthy();
});

/* Gemini mode for the research agents: it may choose steps and wording, but every citation and number is still checked. */
test('live Gemini: research agents keep their guardrails', async ({ page }) => {
  test.setTimeout(400000);
  await page.route('https://pathshala-llm-api.onrender.com/**', route => {
    const req = route.request(), CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type,x-api-key' };
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 200, headers: CORS });
    try { const out = execFileSync('curl', ['-s', '-m', '120', '-w', '\n%{http_code}', '-X', 'POST', req.url(), '-H', 'Content-Type: application/json', '-H', 'X-API-Key: ' + req.headers()['x-api-key'], '-d', req.postData()], { encoding: 'utf8', maxBuffer: 1e7 }); const i = out.lastIndexOf('\n'); route.fulfill({ status: +out.slice(i + 1), headers: CORS, contentType: 'application/json', body: out.slice(0, i) }); } catch (e) { route.abort(); }
  });
  await page.goto('/'); await page.waitForSelector('#hmap');
  await page.evaluate(k => localStorage.setItem('pathshala.llm', JSON.stringify({ key: k })), process.env.LLM_KEY); await page.reload(); await page.waitForSelector('#hmap');
  const r = await page.evaluate(async () => {
    const P = window.__pathshala, inv = P.createCase('PK2', ['GSH', 'NGN']), cid = inv + '-GSH', out = {};
    out.t = await P.runResearch('transportPlanner', cid); out.f = await P.runResearch('feedbackChecker', cid);
    const ok = new Set(); P.q('SELECT eid FROM research_evidence').forEach(x => ok.add(x.eid)); P.q('SELECT passages FROM research_steps WHERE passages IS NOT NULL').forEach(s => JSON.parse(s.passages).forEach(p => ok.add(p.id)));
    out.cited = [...out.t.sentences, ...out.f.sentences].every(s => s.refs.length && s.refs.every(x => ok.has(x)));
    out.steps = P.q('SELECT count(*) n FROM research_steps GROUP BY agent').map(x => x.n); out.src = P.q('SELECT DISTINCT src FROM research_steps').map(x => x.src);
    return { mode: [out.t.mode, out.f.mode], cited: out.cited, steps: out.steps, src: out.src, fallbacks: [out.t.fallbacks, out.f.fallbacks] };
  });
  console.log(JSON.stringify(r));
  expect(r.mode).toEqual(['Gemini', 'Gemini']); expect(r.cited).toBe(true); r.steps.forEach(n => expect(n).toBeLessThanOrEqual(12));
});
