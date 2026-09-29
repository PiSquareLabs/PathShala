import { test, expect } from '@playwright/test';

const SHOT = 'tests/compare/actual/';
const shot = (page, name, full = true) => page.screenshot({ path: `${SHOT}${name}.png`, fullPage: full });

test.describe.configure({ mode: 'serial' });

let page, errors;
test.beforeAll(async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  page = await ctx.newPage();
  errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/fonts\.g|ERR_CERT|ERR_NAME|ERR_CONNECTION|ERR_TUNNEL|Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
  await page.goto('/');
  await page.waitForSelector('#hmap');
});
test.afterAll(async () => { expect(errors, errors.join('\n')).toEqual([]); });

const app = () => page.locator('#app');
const toastText = () => page.locator('#toast').innerText();

test('01 case map lists schools to review', async () => {
  await page.waitForTimeout(800);
  const names = await page.locator('#cpanel .srow .nm').allInnerTexts();
  expect(names).toContain('GPS Pekhri-2');
  expect(names.length).toBe(7);
  await shot(page, '01_case_map', false);
  for (const d of ['Kangra', 'Bilaspur', 'All HP', 'Kullu']) {
    await page.locator('.maplegend button', { hasText: d }).click();
    await expect(page.locator('.maplegend button.primary')).toHaveText(d);
  }
});

test('02 school panel and nearby screening', async () => {
  await page.locator('#cpanel .srow', { hasText: 'GPS Pekhri-2' }).click();
  await expect(page.locator('#cpanel h1')).toHaveText('GPS Pekhri-2');
  const rows = await page.locator('#cpanel tr[data-b]').allInnerTexts();
  const score = n => +rows.find(r => r.includes(n)).trim().split(/\s+/).pop();
  expect([score('Gushaini'), score('Nagini'), score('Bathad'), score('Jibhi'), score('Banjar')]).toEqual([77, 60, 56, 46, 36]);
  await expect(page.locator('#cp-go')).toBeDisabled();
  await page.locator('#cpanel tr[data-b]', { hasText: 'Bathad' }).click();
  await expect(page.locator('#cp-go')).toContainText('Bathad');
  await page.locator('#cpanel tr[data-b]', { hasText: 'Gushaini' }).click();
  await expect(page.locator('#cp-go')).toContainText('GPS Pekhri-2 + GPS Gushaini');
  await shot(page, '02_school_panel_nearby', false);
  await page.locator('#cp-back').click();
  await expect(page.locator('#cpanel h1')).toHaveText(/Find a school/);
  await page.locator('#cpanel .srow', { hasText: 'GPS Pekhri-2' }).click();
  await page.locator('#cpanel tr[data-b]', { hasText: 'Gushaini' }).click();
});

test('03 compare', async () => {
  await page.locator('#cp-go').click();
  await expect(page).toHaveURL(/#\/case\/C1\/compare/);
  await expect(app()).toContainText('GPS Gushaini');
  await page.waitForTimeout(600);
  await shot(page, '03_compare');
});

test('04 access', async () => {
  await page.locator('.steps a', { hasText: 'Access' }).click();
  await expect(page).toHaveURL(/\/access/);
  await expect(app()).toContainText('4.6 km');
  const t = await app().innerText();
  expect(t).toMatch(/4\.6 km/); expect(t).toMatch(/82/); expect(t).toMatch(/3\.8 km/); expect(t).toMatch(/Data unavailable/);
  await page.waitForTimeout(600);
  await shot(page, '04_access');
});

test('05 community themes', async () => {
  await page.locator('.steps a', { hasText: 'Community' }).click();
  await page.locator('.theme').first().waitFor();
  const themes = await page.locator('.theme').allInnerTexts();
  const n = k => +themes.find(x => x.includes(k)).split('\n')[0];
  expect([n('Transport'), n('Seasonal access'), n('Other'), n('Safety'), n('Facilities')]).toEqual([31, 19, 16, 14, 7]);
  await page.locator('.theme', { hasText: 'Transport' }).click();
  await expect(page.locator('.msg').first()).toBeVisible();
  expect(await page.locator('.msg').count()).toBe(31);
  await expect(app()).toContainText('Verified');
  await page.waitForTimeout(600);
  await shot(page, '05_community_theme');
  await page.locator('#th-clear').click();
  await expect(page.locator('.msg')).toHaveCount(0);
  await page.locator('.theme', { hasText: 'Transport' }).click();
  await page.locator('.theme', { hasText: 'Transport' }).click();
  await expect(page.locator('.msg')).toHaveCount(0);
});

test('06 investigate: 8 steps, findings, expand step', async () => {
  await page.locator('.steps a', { hasText: 'Investigate' }).click();
  await expect(page.locator('#ag-run')).toHaveText('Investigate case');
  await shot(page, '06a_investigate_before');
  await page.locator('#ag-run').click();
  await expect(page.locator('#ag-list li.ok')).toHaveCount(8, { timeout: 30000 });
  await expect(page.locator('.issue')).toBeVisible();
  await expect(page.locator('.fq')).toHaveCount(5);
  await expect(page.locator('#toast')).toContainText('Investigation complete');
  await page.waitForTimeout(600);
  await shot(page, '06b_investigate_findings');
  await page.locator('.agent li').nth(1).click();
  await expect(page.locator('.agent li.open')).toHaveCount(1);
  await page.locator('.agent li').nth(1).scrollIntoViewIfNeeded();
  await shot(page, '06c_tool_call_expanded', false);
  await page.locator('.agent li').nth(1).click();
  await expect(page.locator('.agent li.open')).toHaveCount(0);
});

test('07 field verification updates evidence', async () => {
  const fq = n => page.locator(`.fq[data-q="Q${n}"]`);
  await fq(1).locator('button[data-v="Seasonal"]').click();
  await fq(2).locator('.fv').fill('24');
  await fq(3).locator('button[data-v="No"]').click();
  await fq(4).locator('.fv').fill('70');
  await fq(5).locator('button[data-v="Photo"]').click();
  await fq(5).locator('.fnote').fill('Photo of the flooded crossing');
  await page.locator('#fq-go').click();
  await expect(page.locator('#toast')).toContainText('Evidence updated');
  const t = await app().innerText();
  expect(t).toMatch(/Public transport unavailable during school hours/);
  const cards = await page.locator('.fnd').allInnerTexts();
  expect(cards.find(c => c.startsWith('Transport'))).toMatch(/Confirmed concern/);
  expect(cards.find(c => c.startsWith('Seasonal access'))).toMatch(/Verified/);
  await page.waitForTimeout(600);
  await shot(page, '07_evidence_updated', false);
});

test('08 policy and cost', async () => {
  await page.locator('.steps a', { hasText: 'Policy' }).click();
  await expect(page.locator('.hits li').first()).toBeVisible();
  await expect(page.locator('.ivc')).toHaveCount(4);
  const tr = page.locator('.ivc', { hasText: 'School transport support' });
  await tr.locator('input[type=checkbox]').check();
  await expect(tr).toHaveClass(/on/);
  await expect(tr).toContainText('24 × ₹6,000');
  await expect(tr).toContainText('₹1.44 lakh');
  await shot(page, '08_policy_cost');
  // toggle another and back
  const es = page.locator('.ivc', { hasText: 'Escort for young children' });
  await es.locator('input[type=checkbox]').check(); await es.locator('input[type=checkbox]').uncheck();
  await expect(es).not.toHaveClass(/on/);
});

test('09 report: draft, approve, submit', async () => {
  await page.locator('.steps a', { hasText: 'Report' }).click();
  await expect(page.locator('#rp-submit')).toBeDisabled();
  await shot(page, '09a_report_draft');
  await page.locator('.ref').first().click();
  await expect(page.locator('#refbox .refs')).toBeVisible();
  await page.locator('[data-show="F1"]').click();
  await page.locator('[data-v="E1"]').check();
  await expect(page.locator('[data-v="E1"]')).toBeChecked();
  await page.locator('[data-f="F5"]').uncheck();
  await expect(page.locator('li.rm')).toHaveCount(1);
  await page.locator('[data-f="F5"]').check();
  await page.locator('#rp-cmt').fill('Please verify bridge photos');
  await page.locator('#rp-cmt-go').click();
  await expect(page.locator('.cmts')).toContainText('Please verify bridge photos');
  await page.locator('#rp-text').fill((await page.locator('#rp-text').inputValue()) + ' Officer note.');
  await page.locator('#rp-save').click();
  await expect(page.locator('#rp-reset')).toBeVisible();
  await page.locator('#rp-reset').click();
  await expect(page.locator('#rp-text')).not.toHaveValue(/Officer note/);
  await page.locator('#rp-ok').check();
  await expect(page.locator('#rp-submit')).toBeEnabled();
  await page.locator('#rp-submit').click();
  await expect(app()).toContainText('Ready for administrative review');
  await expect(page.locator('#rp-submit')).toHaveCount(0);
  await page.waitForTimeout(500);
  await shot(page, '09b_report_submitted');
});

test('10 investigations list', async () => {
  await page.locator('#nav a', { hasText: 'Investigations' }).click();
  await expect(app()).toContainText('GPS Pekhri-2');
  await shot(page, '10_investigations');
  await page.locator('#app a[href^="#/case/C1"]').first().click();
  await expect(page).toHaveURL(/case\/C1/);
});

test('11 merges map', async () => {
  await page.locator('#nav a', { hasText: 'Merges' }).click();
  await page.waitForTimeout(800);
  await shot(page, '11_merges_map', false);
  const rows = page.locator('#app .srow, #app .rrow, #app a[href^="#/m/"]');
  expect(await rows.count()).toBeGreaterThan(3);
});

test('12 merge success scores', async () => {
  await page.goto('/#/m/M2'); await page.waitForTimeout(700);
  await expect(app()).toContainText('88%');
  await shot(page, '12_merge_page_success');
  await page.goto('/#/m/M3'); await page.waitForTimeout(500);
  await expect(app()).toContainText('24%');
});

test('13 multi-school merge, policy item and survey', async () => {
  await page.goto('/#/merges'); await page.waitForTimeout(500);
  await page.goto('/#/m/M5'); await page.waitForTimeout(800);
  await expect(app()).toContainText('GPS Bhumteer');
  await shot(page, '13_merge_multi_school');
  await page.locator('a', { hasText: 'Details →' }).first().scrollIntoViewIfNeeded();
  await page.locator('.polcard, a[href*="/p/"]').first().click();
  await expect(page).toHaveURL(/\/m\/M5\/p\//);
  await page.waitForTimeout(400);
  await shot(page, '14_policy_item');
  await page.locator('select').first().selectOption('in progress');
  await page.locator('button', { hasText: 'Save status' }).click();
  await page.waitForTimeout(300);
  await expect(page.locator('select').first()).toHaveValue('in progress');
});

test('15 survey form updates the plan', async () => {
  await page.goto('/#/m/M5/survey'); await page.waitForTimeout(500);
  await shot(page, '15_field_survey_form');
  const before = await page.evaluate(() => document.title);
  await page.locator('input[data-f="walk_min"]').first().fill('30');
  await page.locator('.sq .opts button', { hasText: 'A stream' }).first().click();
  await page.locator('.nt').first().fill('रास्ता बहुत खराब है, बच्चे डरते हैं');
  await page.locator('#sv-go').click();
  await page.waitForTimeout(600);
  await expect(page.locator('#toast')).toContainText(/updated|Field survey|re-ran|Analysis/i);
});

test('16 new merge planner', async () => {
  await page.goto('/#/new'); await page.waitForTimeout(500);
  const opt = page.locator('#pl-r option', { hasText: 'GPS Gushaini' });
  await page.locator('#pl-r').selectOption({ label: await opt.innerText() });
  await page.waitForTimeout(400);
  await shot(page, '16_new_merge_planner');
  const chips = await page.locator('.cand').allInnerTexts();
  expect(chips.length).toBeGreaterThan(3);
});

test('17-20 problems, inbox, rules, sqlite', async () => {
  await page.locator('#nav a', { hasText: 'Problems' }).click();
  await page.waitForTimeout(400); await shot(page, '17_problems');
  await page.locator('#nav a', { hasText: 'Feedback' }).click();
  await page.waitForTimeout(400); await shot(page, '18_feedback_inbox');
  await page.locator('#nav a', { hasText: 'Rules' }).click();
  await page.waitForTimeout(400); await shot(page, '19_rules');
  await page.locator('#nav a', { hasText: 'SQLite' }).click();
  await page.waitForTimeout(400); await shot(page, '20_sqlite_console');
});

test('21 phone: no horizontal scroll on any route', async () => {
  await page.setViewportSize({ width: 400, height: 900 });
  const routes = ['', 'cases', 'merges', 'problems', 'surveys', 'inbox', 'rules', 'sql', 'new', 'm/M2', 'm/M5', 'm/M5/survey', 'm/M5/feedback', 'case/C1/compare', 'case/C1/access', 'case/C1/community', 'case/C1/investigate', 'case/C1/policy', 'case/C1/report'];
  for (const r of routes) {
    await page.goto('/#/' + r); await page.waitForTimeout(500);
    const w = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
    expect(w[0], `route ${r} overflows`).toBeLessThanOrEqual(w[1]);
    if (r === 'case/C1/access') await shot(page, '21_phone_access');
  }
  await page.setViewportSize({ width: 1400, height: 900 });
});
