// Regenerates src/agent/fixtures/C1/*.json from the simulated agents. Needs `vite preview` on :4173 (after npm run build).
import { chromium } from '@playwright/test';
import fs from 'node:fs';

const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const page = await browser.newPage();
await page.goto('http://127.0.0.1:4173/'); await page.waitForSelector('#hmap');
const { out, errors } = await page.evaluate(() => window.__pathshala.captureC1Outputs());
await browser.close();
if (Object.keys(errors).length) { console.error('Schema errors', errors); process.exit(1); }
fs.mkdirSync('src/agent/fixtures/C1', { recursive: true });
for (const [id, o] of Object.entries(out)) fs.writeFileSync(`src/agent/fixtures/C1/${id}.json`, JSON.stringify(o, null, 2) + '\n');
console.log('wrote', Object.keys(out).join(', '));
