import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => { await page.goto('/'); await page.waitForSelector('#hmap'); });

test('Full control: one closing school in, researched recommendation, budget and report out; stops for the field officer', async ({ page }) => {
  test.setTimeout(300000);
  await page.locator('#nav a', { hasText: 'Full control' }).click(); await expect(page).toHaveURL(/#\/full$/);
  await expect(page.locator('h1')).toContainText('Full control'); await page.locator('#fc-school').selectOption('PK2');
  await expect(page.locator('#fc-cands')).toContainText('GPS Gushaini'); await page.locator('#fc-start').click(); await expect(page).toHaveURL(/#\/full\/C\d+/);
  // AI research runs for every candidate, then stops at the field form
  await expect(page.locator('#fc-form')).toBeVisible({ timeout: 120000 });
  await expect(page.locator('.fcsteps [aria-current="step"]')).toContainText('Field form');
  const st1 = await page.evaluate(() => { const q = window.__pathshala.q; return { stage: q('SELECT stage FROM full_runs')[0].stage, tracks: q('SELECT count(*) n FROM cases')[0].n, found: q('SELECT count(DISTINCT case_id) n FROM findings')[0].n, tp: q("SELECT count(*) n FROM research_runs WHERE agent = 'transportPlanner'")[0].n, fc: q("SELECT count(*) n FROM research_runs WHERE agent = 'feedbackChecker'")[0].n, sel: q('SELECT count(*) n FROM interventions WHERE selected = 1')[0].n, chosen: q('SELECT chosen_id FROM investigations')[0].chosen_id, submitted: q("SELECT count(*) n FROM investigations WHERE status LIKE 'Ready%'")[0].n }; });
  expect(st1.stage).toBe('field'); expect(st1.found).toBe(st1.tracks); expect(st1.tp).toBe(st1.tracks); expect(st1.fc).toBe(st1.tracks); expect(st1.sel).toBe(0); expect(st1.chosen).toBeNull(); expect(st1.submitted).toBe(0);
  const secs = await page.locator('.fcsec').count(); expect(secs).toBe(st1.tracks); expect(await page.locator('.fcsec .fq').count()).toBeGreaterThan(secs * 5);   // 5 standard + the research's extra questions
  await expect(page.locator('#fc-print')).toBeVisible(); await expect(page.locator('.fcprint')).toContainText('Officer:');
  await page.screenshot({ path: 'docs/screens/19-full-field-form.png', fullPage: true });
  // the officer must answer something for every school
  await page.locator('#fc-submit').click(); await expect(page.locator('#toast')).toContainText('Answer at least one question'); await expect(page.locator('#fc-form')).toBeVisible();
  for (const sec of await page.locator('.fcsec').all()) {
    await sec.locator('.fq[data-q="Q1"] .opts button[data-v="No"]').click(); await sec.locator('.fq[data-q="Q2"] .fv').fill('20');
    await sec.locator('.fq[data-q="Q3"] .opts button[data-v="No"]').click(); await sec.locator('.fq[data-q="Q4"] .fv').fill('45');
  }
  await page.locator('#fc-submit').click();
  // policies, budget, ranking and the final screen follow automatically
  await expect(page.locator('.fcrec')).toBeVisible({ timeout: 180000 });
  await expect(page.locator('.fcrec .eyebrow')).toContainText('a suggestion, the officer decides');
  await expect(page.locator('#fc-compare thead th')).toHaveCount(4); await expect(page.locator('#fc-compare')).toContainText('Confirmed concerns'); await expect(page.locator('#fc-compare')).toContainText('First-year cost');
  expect(await page.locator('.fcwhycard').count()).toBeGreaterThan(0); await expect(page.locator('#fc-budget')).toContainText('Three-year total');
  await expect(page.locator('#fc-report h3')).toHaveCount(await page.locator('#fc-report h3').count()); expect(await page.locator('#fc-report h3').count()).toBeGreaterThanOrEqual(5);
  await expect(page.locator('#fc-report')).toContainText('Budget'); await expect(page.locator('#fc-report')).toContainText('Still to be confirmed');
  const st2 = await page.evaluate(() => { const q = window.__pathshala.q; return { stage: q('SELECT stage FROM full_runs')[0].stage, sel: q('SELECT count(*) n FROM interventions WHERE selected = 1')[0].n, auto: q('SELECT count(*) n FROM auto_choices')[0].n, chosen: q('SELECT chosen_id FROM investigations')[0].chosen_id, status: q('SELECT status FROM investigations')[0].status, answered: q("SELECT count(*) n FROM field_questions WHERE answer != ''")[0].n }; });
  expect(st2.stage).toBe('final'); expect(st2.sel).toBe(st2.auto); expect(st2.answered).toBeGreaterThan(0);
  expect(st2.chosen).toBeNull(); expect(st2.status).not.toMatch(/^Ready/);   // prepared, not decided or submitted
  await page.screenshot({ path: 'docs/screens/20-full-final.png', fullPage: true });
  // the officer adopts, downloads, and continues on the Report step
  const dl = page.waitForEvent('download'); await page.locator('#fc-dl').click(); expect((await dl).suggestedFilename()).toMatch(/report\.txt$/);
  await page.locator('#fc-adopt').click(); await expect(page.locator('#toast')).toContainText(/adopted/i);
  const st3 = await page.evaluate(() => window.__pathshala.q('SELECT chosen_id FROM investigations')[0].chosen_id); const rec = await page.evaluate(() => JSON.parse(window.__pathshala.q('SELECT out FROM full_runs')[0].out).recommended);
  if (rec !== 'keep') expect(st3).toBe(rec); else expect(st3).toBeNull();
  await page.locator('a', { hasText: 'Open the Report step' }).click(); await expect(page).toHaveURL(/report$/);
  // reload keeps everything
  await page.goto('/'); await page.waitForSelector('#hmap'); await page.evaluate(() => { location.hash = '#/full/' + window.__pathshala.q('SELECT inv_id FROM full_runs')[0].inv_id; }); await expect(page.locator('.fcrec')).toBeVisible();
});

test('Full control: starting needs a closing school with candidates; the page is listed with its data sources', async ({ page }) => {
  await page.evaluate(() => { location.hash = '#/full'; }); await expect(page.locator('#fc-start')).toBeVisible(); await page.locator('#srcs summary').click(); await expect(page.locator('#srcs')).toContainText('UDISE');
  await page.locator('#fc-school').selectOption('NHN'); await expect(page.locator('#fc-cands')).toContainText(/No suitable receiving school|Candidate receiving schools/);
});
