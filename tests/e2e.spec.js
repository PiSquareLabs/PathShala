// The reference investigation end to end: pick one closing school, tick several receiving schools,
// compare them side by side, choose one, investigate, verify in the field, cost, report, submit.
import { test, expect } from '@playwright/test';

const SHOT = 'docs/screens/';
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
const cell = (row, col) => page.locator('.cmptbl tbody tr', { has: page.locator('th', { hasText: row }) }).locator('td').nth(col);

test('01 investigate home lists schools to review', async () => {
  await page.waitForTimeout(800);
  const names = await page.locator('#cpanel .srow .nm').allInnerTexts();
  expect(names).toContain('GPS Pekhri-2');
  expect(names.length).toBe(7);
  await shot(page, '01_pick_school', false);
  for (const d of ['Kangra', 'Bilaspur', 'All HP', 'Kullu']) {
    await page.locator('.maplegend button', { hasText: d }).click();
    await expect(page.locator('.maplegend button.primary')).toHaveText(d);
  }
});

test('02 pick one closing school, then tick several receiving schools', async () => {
  await page.locator('#cpanel .srow', { hasText: 'GPS Pekhri-2' }).click();
  await expect(page.locator('#cpanel h1')).toHaveText('GPS Pekhri-2');
  await expect(page.locator('#cp-go')).toBeDisabled();
  const rows = page.locator('#cpanel .pickrow');
  expect(await rows.count()).toBeGreaterThanOrEqual(5);
  await page.locator('#cp-top').click();                                   // best three
  await expect(page.locator('#cpanel .pickrow.on')).toHaveCount(3);
  await expect(page.locator('#cp-go')).toHaveText('Compare 3 schools');
  await rows.nth(3).locator('input').check(); await expect(page.locator('#cp-go')).toHaveText('Compare 4 schools');
  await rows.nth(3).locator('input').uncheck(); await expect(page.locator('#cp-go')).toHaveText('Compare 3 schools');
  await rows.nth(0).locator('input').uncheck(); await expect(page.locator('#cp-go')).toHaveText('Compare 2 schools');
  await rows.nth(0).locator('input').check();
  await shot(page, '02_tick_receivers', false);
  await page.locator('#cp-back').click();
  await expect(page.locator('#cpanel h1')).toHaveText(/Which school might close/);
  await page.locator('#cpanel .srow', { hasText: 'GPS Pekhri-2' }).click();
  await page.locator('#cpanel .pickrow', { hasText: 'GPS Gushaini' }).locator('input').check();
  await page.locator('#cpanel .pickrow', { hasText: 'GPS Nagini' }).locator('input').check();
  await page.locator('#cpanel .pickrow', { hasText: 'GPS Banjar' }).locator('input').check();
});

test('03 compare the receiving schools side by side; nothing is chosen yet', async () => {
  await page.locator('#cp-go').click();
  await expect(page).toHaveURL(/#\/case\/C1\/compare/);
  await expect(page.locator('h1').first()).toContainText('3 schools to compare');
  const heads = await page.locator('.cmptbl thead th b').allInnerTexts();
  expect(heads).toEqual(['GPS Nagini', 'GPS Gushaini', 'GPS Banjar']);   // best screening score first
  await expect(page.locator('[data-choose]')).toHaveCount(0);              // no choice on this screen
  await expect(page.locator('.cmptbl th.chosen')).toHaveCount(0);
  await expect(page.locator('.cmp-top')).toContainText('Closing school');
  await expect(cell('By road', 1)).toContainText('3.8 km');
  await expect(cell('On foot', 1)).toContainText('4.6 km');
  await expect(cell('On foot', 1)).toContainText('82 min');
  await expect(cell('On foot', 2)).toContainText('9.9 km');
  await expect(cell('Mapped hazards', 1)).toContainText('Baridropa–Jawal footbridge');
  await expect(cell('Mapped hazards', 0)).toContainText('None mapped');
  await expect(cell('RTE walking limit', 1)).toContainText('Over 1 km');
  await expect(cell('Citizen feedback', 1)).toContainText('87 messages');
  await expect(cell('Citizen feedback', 0)).toContainText(/\d+ messages/);   // Nagini has its own, smaller set
  expect(await page.locator('.cmptbl td.best').count()).toBeGreaterThan(3);
  await page.waitForTimeout(600);
  await shot(page, '03_compare');
});

test('04 evidence for each school, one tab per receiving school', async () => {
  await page.locator('.steps a', { hasText: 'Evidence' }).click();
  await expect(page.locator('.opttabs button')).toHaveCount(3);
  await page.locator('.opttabs button', { hasText: 'GPS Gushaini' }).click();
  await expect(app()).toContainText('Getting to GPS Gushaini');
  const t = await app().innerText();
  expect(t).toMatch(/82 min/); expect(t).toMatch(/3\.8 km/); expect(t).toMatch(/Data unavailable/);
  const themes = await page.locator('.theme').allInnerTexts();
  const n = k => +themes.find(x => x.includes(k)).split('\n')[0];
  expect([n('Transport'), n('Seasonal access'), n('Other'), n('Safety'), n('Facilities')]).toEqual([31, 19, 16, 14, 7]);
  await page.locator('.theme', { hasText: 'Transport' }).click();
  expect(await page.locator('.msg').count()).toBe(31);
  await page.waitForTimeout(600);
  await shot(page, '04_evidence');
  await page.locator('#th-clear').click();
  await expect(page.locator('.msg')).toHaveCount(0);
  await page.locator('.opttabs button', { hasText: 'GPS Nagini' }).click();
  await expect(app()).toContainText('Getting to GPS Nagini');
  await expect(app()).not.toContainText('Baridropa');   // Nagini shows its own messages, not Gushaini's
});

test('05 investigate every school', async () => {
  await page.locator('.steps a', { hasText: 'Investigate' }).click();
  await expect(page.locator('#ag-run-all')).toHaveText('Investigate all 3 schools');
  await page.locator('#ag-run-all').click();
  await expect(page.locator('#toast')).toContainText('3 schools investigated', { timeout: 60000 });
  await expect(page.locator('.opttabs button .ok')).toHaveCount(3);        // every tab ticked
  await page.locator('.opttabs button', { hasText: 'GPS Gushaini' }).click();
  await expect(page.locator('#ag-list li.ok')).toHaveCount(8);
  await expect(page.locator('.finding')).toHaveCount(5);
  await expect(page.locator('.fq')).toHaveCount(5);
  await page.locator('.agent li').nth(3).click();                          // transport step: no timetable source
  await expect(page.locator('.agent li.open')).toContainText('Data unavailable');
  await page.locator('.agent li').nth(3).click();
  const f = await page.locator('.finding').first().innerText();
  expect(f).toMatch(/Transport/); expect(f).toMatch(/not known/);
  await page.waitForTimeout(600);
  await shot(page, '05_investigate');
});

test('06 field verification, per school', async () => {
  const fq = n => page.locator(`.fq[data-q="Q${n}"]`);
  await fq(1).locator('button[data-v="Seasonal"]').click();
  await fq(2).locator('.fv').fill('24');
  await fq(3).locator('button[data-v="No"]').click();
  await fq(4).locator('.fv').fill('70');
  await fq(5).locator('button[data-v="Photo"]').click();
  await fq(5).locator('.fnote').fill('Photo of the flooded crossing');
  await page.locator('#fq-go').click();
  await expect(page.locator('#toast')).toContainText('Evidence updated');
  await page.locator('.finding', { hasText: 'Transport' }).locator('summary').click();
  await expect(app()).toContainText('Public transport unavailable during school hours');
  const cards = await page.locator('.finding').allInnerTexts();
  expect(cards.find(c => c.startsWith('Transport'))).toMatch(/Confirmed concern/);
  expect(cards.find(c => c.startsWith('Seasonal access'))).toMatch(/Verified/);
  await shot(page, '06_field_verified', false);
  // Nagini: a different answer, its own evidence
  await page.locator('.opttabs button', { hasText: 'GPS Nagini' }).click();
  await expect(page.locator('.fq[data-q="Q2"] .fv')).toHaveValue('');       // Gushaini's answers did not leak
  await fq(3).locator('button[data-v="Yes"]').click();
  await fq(2).locator('.fv').fill('20');
  await page.locator('#fq-go').click();
  await expect(page.locator('#toast')).toContainText('Evidence updated');
});

test('07 policy and cost, per school, with the totals of every option', async () => {
  await page.locator('.steps a', { hasText: 'Policy' }).click();
  await page.locator('.opttabs button', { hasText: 'GPS Gushaini' }).click();
  await expect(page.locator('.ivc')).toHaveCount(4);
  const tr = page.locator('.ivc', { hasText: 'School transport support' });
  await tr.locator('input[type=checkbox]').check();
  await expect(tr).toHaveClass(/on/);
  await expect(tr.locator('.ivcost')).toContainText('₹1.44 lakh');
  await tr.locator('summary').click();
  await expect(tr).toContainText('24 × ₹6,000');
  await expect(tr).not.toContainText('seats');                            // no invented vehicle count
  const ret = page.locator('.ivc', { hasText: 'replace the building' });
  await expect(ret.locator('.ivcost')).toContainText('₹27 lakh');         // 3 existing classrooms × ₹9 lakh (PAB)
  await ret.locator('input[type=checkbox]').check();
  // the totals table updates as interventions are ticked
  await expect(page.locator('#opt-table')).toContainText('₹1.44 lakh');
  await page.locator('.opttabs button', { hasText: 'GPS Nagini' }).click();
  const tr2 = page.locator('.ivc', { hasText: 'School transport support' });
  await expect(tr2.locator('.ivcost')).toContainText('₹1.2 lakh');         // Nagini: 20 students by the field count
  await tr2.locator('input[type=checkbox]').check();
  await expect(page.locator('#opt-table')).toContainText('₹1.2 lakh');
  await shot(page, '07_policy');
  const es = page.locator('.ivc', { hasText: 'Escort for young children' });
  await es.locator('input[type=checkbox]').check(); await es.locator('input[type=checkbox]').uncheck();
  await expect(es).not.toHaveClass(/on/);
});

test('08 choose ONE school with the totals in view, then write and submit its report', async () => {
  await page.locator('.steps a', { hasText: 'Report' }).click();
  await expect(app()).toContainText('Compare the options and choose one');
  await expect(page.locator('[data-final]')).toHaveCount(3);
  await expect(page.locator('#rp-ok')).toHaveCount(0);                     // no report until a school is chosen
  const t = page.locator('#opt-table');
  await expect(t).toContainText('₹1.44 lakh'); await expect(t).toContainText('₹27 lakh'); await expect(t).toContainText('₹1.2 lakh');
  await expect(page.locator('#opt-table td.best').first()).toBeVisible();
  await shot(page, '08_choose');
  await page.locator('[data-final]').nth(1).click();                        // Gushaini
  await expect(page.locator('#opt-table th.chosen')).toContainText('GPS Gushaini');
  await expect(page.locator('h1').first()).toContainText('GPS Gushaini');
  await expect(page.locator('#rp-submit')).toBeDisabled();
  await shot(page, '08_report_draft');
  await page.locator('.ref').first().click();
  await expect(page.locator('#refbox .refs')).toBeVisible();
  await page.locator('#rp-ok').check();
  await expect(page.locator('#rp-submit')).toBeEnabled();
  await page.locator('#rp-submit').click();
  await expect(app()).toContainText('Ready for administrative review');
  await expect(page.locator('#rp-submit')).toHaveCount(0);
  await expect(page.locator('[data-final]')).toHaveCount(0);               // choice is locked once submitted
  await page.waitForTimeout(500);
  await shot(page, '09_report_submitted');
});

test('09 a second investigation compares two schools for a sender with no surveyed routes', async () => {
  await page.goto('/#/');
  await page.waitForSelector('#cpanel');
  if (await page.locator('#cp-back').count()) await page.locator('#cp-back').click();
  await page.locator('#cpanel .srow', { hasText: 'GPS Bathad' }).click();
  await page.locator('#cpanel .pickrow').nth(0).locator('input').check();
  await page.locator('#cpanel .pickrow').nth(1).locator('input').check();
  await page.locator('#cp-go').click();
  await expect(page).toHaveURL(/#\/case\/C\d+\/compare/);
  await expect(cell('On foot', 0)).toContainText('estimate');
  await expect(cell('Climb', 0)).toContainText('Data unavailable');
  await page.locator('.steps a', { hasText: 'Investigate' }).click();
  await page.locator('#ag-run-all').click();
  await expect(page.locator('#toast')).toContainText('2 schools investigated', { timeout: 60000 });
  await expect(app()).toContainText('The route has not been surveyed');
  await page.locator('.steps a', { hasText: 'Evidence' }).click();
  await expect(app()).toContainText('Data unavailable');
  await page.locator('.steps a', { hasText: 'Report' }).click();
  await page.locator('[data-final]').first().click();
  await page.locator('#rp-ok').waitFor();
  await expect(page.locator('.card.err')).toHaveCount(0);
});

test('10 phone: no horizontal scroll on any route', async () => {
  await page.setViewportSize({ width: 400, height: 900 });
  const routes = ['', 'cases', 'merges', 'inbox', 'rules', 'sql', 'new', 'm/M2', 'm/M5', 'm/M5/survey', 'm/M5/feedback', 'case/C1/compare', 'case/C1/evidence', 'case/C1/investigate', 'case/C1/policy', 'case/C1/report'];
  for (const r of routes) {
    await page.goto('/#/' + r); await page.waitForTimeout(500);
    const w = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
    expect(w[0], `route ${r} overflows`).toBeLessThanOrEqual(w[1]);
    if (r === 'case/C1/compare') await shot(page, '10_phone_compare');
  }
  await page.setViewportSize({ width: 1400, height: 900 });
});
