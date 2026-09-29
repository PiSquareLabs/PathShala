// Runs the same investigation in the original prototype (reference/PathShala_app.html) and in the new build,
// then diffs the SQLite tables the flow writes. Usage: node tests/parity.mjs  (needs `vite preview` on :4173)
import { chromium } from '@playwright/test';
import path from 'node:path';

const targets = { reference: 'file://' + path.resolve('reference/PathShala_app.html'), build: 'http://127.0.0.1:4173/' };
const TABLES = {
  findings: 'SELECT * FROM findings ORDER BY case_id, fid',
  evidence: 'SELECT * FROM evidence ORDER BY case_id, CAST(substr(eid,2) AS INTEGER)',
  field_questions: 'SELECT case_id,qid,seq,text,type,options,gap,answer,note FROM field_questions ORDER BY qid',
  interventions: 'SELECT * FROM interventions ORDER BY code',
  agent_steps: 'SELECT case_id,seq,label,tool,input,output,summary FROM agent_steps ORDER BY seq',
  reports: 'SELECT case_id,draft,edited,comments,approved FROM reports',
  case_log: 'SELECT case_id,actor,action,detail FROM case_log ORDER BY rowid',
  cases: 'SELECT case_id,from_id,to_id,status,officer FROM cases',
};

async function flow(page, url) {
  await page.goto(url); await page.waitForSelector('#hmap'); await page.waitForTimeout(800);
  await page.locator('#cpanel .srow', { hasText: 'GPS Pekhri-2' }).click();
  await page.locator('#cpanel tr[data-b]', { hasText: 'Gushaini' }).click();
  await page.locator('#cp-go').click();
  await page.locator('.steps a', { hasText: 'Investigate' }).click();
  await page.locator('#ag-run').click();
  await page.locator('#ag-list li.ok').nth(7).waitFor({ timeout: 30000 });
  await page.locator('.fq').first().waitFor();
  // before answers: policy + report
  await page.locator('.steps a', { hasText: 'Policy' }).click(); await page.locator('.ivc').first().waitFor();
  await page.locator('.steps a', { hasText: 'Investigate' }).click();
  const fq = n => page.locator(`.fq[data-q="Q${n}"]`);
  await fq(1).locator('button[data-v="Seasonal"]').click();
  await fq(2).locator('.fv').fill('24');
  await fq(3).locator('button[data-v="No"]').click();
  await fq(4).locator('.fv').fill('70');
  await fq(5).locator('button[data-v="Photo"]').click();
  await fq(5).locator('.fnote').fill('Photo of the crossing');
  await page.locator('#fq-go').click(); await page.waitForTimeout(500);
  await page.locator('.steps a', { hasText: 'Policy' }).click(); await page.locator('.ivc').first().waitFor();
  for (const t of ['School transport support', 'Escort for young children']) await page.locator('.ivc', { hasText: t }).locator('input[type=checkbox]').check();
  await page.locator('.steps a', { hasText: 'Report' }).click(); await page.locator('#rp-ok').waitFor();
  await page.locator('[data-v="E1"]').check();
  await page.locator('[data-f="F3"]').uncheck();
  await page.locator('#rp-cmt').fill('Check the photos'); await page.locator('#rp-cmt-go').click();
  await page.locator('#rp-ok').check();
  await page.locator('#rp-submit').click(); await page.waitForTimeout(500);
  const out = {};
  await page.goto(page.url().split('#')[0] + '#/sql'); await page.waitForSelector('#sql');
  for (const [t, sql] of Object.entries(TABLES)) {
    await page.locator('#sql').fill(sql); await page.evaluate(() => document.querySelector('#runsql').click()); await page.waitForTimeout(150);
    out[t] = await page.evaluate(() => [...document.querySelectorAll('#sqlres tbody tr')].map(tr => [...tr.children].map(td => td.title)));
  }
  return out;
}

const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const res = {};
for (const [k, url] of Object.entries(targets)) { const page = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage(); res[k] = await flow(page, url); }
await browser.close();
let bad = 0;
for (const t of Object.keys(TABLES)) {
  const norm = v => JSON.stringify(v).replace(/\d{4}-\d\d-\d\d \d\d:\d\d/g, '<ts>');
  const a = norm(res.reference[t]), b = norm(res.build[t]);
  const n = res.reference[t].length;
  if (a === b) console.log(`OK   ${t} (${n} rows)`);
  else {
    bad++; console.log(`DIFF ${t}: reference ${n} rows, build ${res.build[t].length} rows`);
    res.reference[t].forEach((r, i) => { if (JSON.stringify(r) !== JSON.stringify(res.build[t][i])) { console.log('  ref  ', JSON.stringify(r).slice(0, 1500)); console.log('  build', JSON.stringify(res.build[t][i]).slice(0, 1500)); } });
  }
}
process.exit(bad ? 1 : 0);
