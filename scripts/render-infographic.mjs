// Renders docs/infographic/asha-school-journey.html to a PNG (and a PDF) with Playwright.
import { chromium } from '@playwright/test';
import { resolve } from 'node:path';
const b = await chromium.launch({ executablePath: process.env.PW_CHROMIUM });
const page = await b.newPage({ viewport: { width: 1200, height: 900 }, deviceScaleFactor: 1.5 });
await page.goto('file://' + resolve('docs/infographic/asha-school-journey.html')); await page.waitForTimeout(500);
await page.screenshot({ path: 'docs/infographic/asha-school-journey.png', fullPage: true });
await b.close(); console.log('rendered');
