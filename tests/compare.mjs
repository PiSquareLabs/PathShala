// Saves side-by-side images (reference | actual) to tests/compare/. Run `npx playwright test` first.
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const ref = 'reference/screenshots', act = 'tests/compare/actual', out = 'tests/compare';
const b64 = f => 'data:image/png;base64,' + fs.readFileSync(f).toString('base64');
const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const page = await browser.newPage();
for (const f of fs.readdirSync(ref).filter(f => f.endsWith('.png'))) {
  const a = path.join(act, f);
  if (!fs.existsSync(a)) { console.log('missing actual', f); continue; }
  await page.setContent(`<body style="margin:0;background:#888;display:flex;gap:12px;align-items:flex-start">
    <div style="flex:1"><div style="font:14px sans-serif;color:#fff;padding:4px">reference</div><img style="width:100%" src="${b64(path.join(ref, f))}"></div>
    <div style="flex:1"><div style="font:14px sans-serif;color:#fff;padding:4px">actual</div><img style="width:100%" src="${b64(a)}"></div></body>`);
  await page.setViewportSize({ width: 2400, height: 800 });
  await page.screenshot({ path: path.join(out, 'compare_' + f), fullPage: true });
  console.log('compared', f);
}
await browser.close();
