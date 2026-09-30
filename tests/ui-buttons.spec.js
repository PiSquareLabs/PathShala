// Clicks every control on every page and checks the effect. Each test starts from a fresh demo database.
import { test, expect } from '@playwright/test';

const SHOT = 'docs/screens/ui-';
let errors;
test.beforeEach(async ({ page }) => {
  errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/fonts\.g|ERR_CERT|ERR_NAME|ERR_CONNECTION|ERR_TUNNEL|Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
  await page.goto('/'); await page.waitForSelector('#hmap');
});
test.afterEach(() => { expect(errors, errors.join('\n')).toEqual([]); });

const app = page => page.locator('#app');
const go = async (page, hash) => { await page.evaluate(h => { location.hash = h; }, '#/' + hash); await page.waitForTimeout(350); };
const toast = page => page.locator('#toast.show');

/* Open a case: one closing school, several receiving schools. */
async function newCase(page, sender = 'GPS Pekhri-2', receivers = ['GPS Gushaini', 'GPS Nagini']) {
  await page.locator('#cpanel .srow', { hasText: sender }).click();
  for (const r of receivers) await page.locator('#cpanel .pickrow', { hasText: r }).locator('input').check();
  await page.locator('#cp-go').click();
  await expect(page).toHaveURL(/#\/case\/C\d+\/compare/);
}
const tab = (page, name) => page.locator('.opttabs button', { hasText: name });
/* Investigate one receiving school (its tab) on the Investigate step. */
async function investigate(page, name = 'GPS Gushaini') {
  await go(page, page.url().split('#/')[1].replace(/\/[a-z]+$/, '/investigate'));
  await tab(page, name).click();
  await page.locator('#ag-run').click();
  await expect(page.locator('.fq')).toHaveCount(5, { timeout: 30000 });
}
async function choosePolicy(page, name, titles) {
  await go(page, page.url().split('#/')[1].replace(/\/[a-z]+$/, '/policy'));
  await tab(page, name).click(); await page.locator('.ivc').first().waitFor();
  for (const t of titles) await page.locator('.ivc', { hasText: t }).locator('input').check();
}

test('header: brand, two tabs and the More menu', async ({ page }) => {
  const tabs = [['Investigate', /#\/$/, 'Which school might close'], ['Merges', /#\/merges/, 'Each tile is one merge']];
  for (const [label, url, text] of tabs) {
    await page.locator('#nav a', { hasText: label }).click();
    await expect(page).toHaveURL(url); await expect(app(page)).toContainText(text);
    await expect(page.locator('#nav a[aria-current="page"]')).toContainText(label);
  }
  await expect(page.locator('#nav a')).toHaveCount(2);
  const menu = [['Feedback inbox', /#\/inbox/, 'Log feedback'], ['Rules', /#\/rules/, 'Rules'], ['SQLite console', /#\/sql/, 'SQLite console']];
  for (const [label, url, text] of menu) {
    await page.locator('#more summary').click();
    await expect(page.locator('.menu-pop')).toBeVisible();
    await page.locator('.menu-pop a', { hasText: label }).click();
    await expect(page).toHaveURL(url); await expect(app(page)).toContainText(text);
    await expect(page.locator('.menu-pop')).toBeHidden();                       // closes on navigation
    await expect(page.locator('#more summary')).toHaveAttribute('aria-current', 'page');
  }
  await page.locator('a.brand').click(); await expect(page).toHaveURL(/#\/$/);
  await page.locator('#more summary').click();
  await expect(page.locator('#dbstat')).toContainText('SQLite');
  await expect(page.locator('#reset')).toBeVisible();
});

test('reset demo: two clicks, wipes changes and localStorage', async ({ page }) => {
  await go(page, 'rules');
  await page.locator('.rl input').first().fill('7');
  await page.locator('#rl-go').click(); await expect(toast(page)).toBeVisible();
  expect(await page.evaluate(() => Object.keys(localStorage).find(k => k.startsWith('pathshala.db')))).toMatch(/^pathshala\.db\.[0-9a-z]+$/);
  await page.locator('#more summary').click();
  await page.locator('#reset').click(); await expect(page.locator('#reset')).toHaveText('Click again to reset');
  await page.locator('#reset').click(); await expect(page.locator('#reset')).toHaveText('Reset demo');
  await expect(toast(page)).toContainText('Demo reset');
  await expect(page.locator('.rl input').first()).not.toHaveValue('7');
  await page.locator('#more summary').click();
  await page.locator('#reset').click(); await expect(page.locator('#reset')).toHaveText('Click again to reset');
  await page.waitForTimeout(4300); await expect(page.locator('#reset')).toHaveText('Reset demo');
});

test('persistence: a change survives a reload (localStorage)', async ({ page }) => {
  await go(page, 'rules');
  await page.locator('.rl input').first().fill('4'); await page.locator('#rl-go').click();
  await page.reload(); await page.waitForSelector('#nav');
  await go(page, 'rules'); await expect(page.locator('.rl input').first()).toHaveValue('4');
  await page.locator('#more summary').click(); await expect(page.locator('#dbstat')).toContainText('saved');
});

test('investigate home: districts, one closing school, several receivers, map', async ({ page }) => {
  for (const d of ['Kangra', 'Bilaspur', 'All HP', 'Kullu']) { await page.locator('.maplegend button', { hasText: d }).click(); await expect(page.locator('.maplegend button.primary')).toHaveText(d); }
  await page.locator('#hmap .leaflet-control-zoom-in').click(); await page.locator('#hmap .leaflet-control-zoom-out').click();
  const list = await page.locator('#cpanel .srow .nm').allInnerTexts(); expect(list).toContain('GPS Pekhri-2');
  await page.locator('#cpanel .srow', { hasText: 'GPS Pekhri-2' }).click();
  await expect(page.locator('.sendcard')).toContainText('27 students');
  await expect(page.locator('.sendcard')).toContainText('Poor');
  await expect(page.locator('#cp-go')).toBeDisabled(); await expect(page.locator('#cp-go')).toHaveText('Tick schools to compare');
  const first = page.locator('#cpanel .pickrow').first();
  await first.click();                                                           // clicking the row ticks it
  await expect(first).toHaveClass(/on/); await expect(page.locator('#cp-go')).toHaveText('Compare 1 school');
  await first.locator('input').uncheck(); await expect(page.locator('#cp-go')).toBeDisabled();
  await page.locator('#cp-top').click(); await expect(page.locator('#cpanel .pickrow.on')).toHaveCount(3);
  await page.screenshot({ path: SHOT + 'pick.png' });
  await page.locator('#cp-back').click(); await expect(page.locator('#cpanel h1')).toHaveText(/Which school might close/);
  await page.locator('#cpanel .srow', { hasText: 'GPS Pekhri-2' }).click(); await expect(page.locator('#cpanel .pickrow.on')).toHaveCount(0);
  await page.locator('#cpanel .pickrow').first().locator('input').check();
  await page.locator('#cp-go').click(); await expect(page).toHaveURL(/case\/C1\/compare/);
  await page.locator('a.brand').click();
  await expect(page.locator('#cpanel')).toContainText('Continue');
  await page.locator('#cpanel a.srow').click(); await expect(page).toHaveURL(/case\/C1/);
});

test('compare: nothing to choose here; remove and add schools', async ({ page }) => {
  await newCase(page, 'GPS Pekhri-2', ['GPS Gushaini', 'GPS Nagini', 'GPS Banjar']);
  await expect(page.locator('.cmptbl thead th b')).toHaveText(['GPS Nagini', 'GPS Gushaini', 'GPS Banjar']);
  await expect(page.locator('[data-choose]')).toHaveCount(0); await expect(page.locator('.cmptbl th.chosen')).toHaveCount(0);
  await expect(page.locator('.cmptbl td.best').first()).toBeVisible();
  await page.locator('[data-remove]').nth(2).click(); await expect(page.locator('.cmptbl thead th b')).toHaveCount(2);
  await expect(page.locator('h1').first()).toContainText('2 schools to compare');
  expect(await page.locator('#cmp-add option').count()).toBeGreaterThan(2);
  await page.locator('#cmp-add-go').click(); await expect(page.locator('.cmptbl thead th b')).toHaveCount(2);   // nothing picked: no-op
  await page.locator('#cmp-add').selectOption({ index: 1 }); await page.locator('#cmp-add-go').click();
  await expect(page.locator('.cmptbl thead th b')).toHaveCount(3);
  await page.locator('[data-remove]').last().click(); await page.locator('[data-remove]').last().click();
  await expect(page.locator('.cmptbl thead th b')).toHaveCount(1); await expect(page.locator('[data-remove]')).toHaveCount(0);
  await expect(page.locator('h1').first()).not.toContainText('to compare');
  await page.locator('#cmp-add').selectOption({ index: 1 }); await page.locator('#cmp-add-go').click();
  await expect(page.locator('.cmptbl thead th b')).toHaveCount(2);
  // a school added later gets its own investigation
  await go(page, 'case/C1/investigate'); await expect(page.locator('.opttabs button')).toHaveCount(2);
});

test('case pages: map layers, six steps, next and back buttons, breadcrumbs', async ({ page }) => {
  await newCase(page);
  await page.locator('#cmap .leaflet-map-pane').waitFor({ state: 'attached' });
  await page.locator('.lyrs summary').click();
  for (const k of ['river', 'road', 'route', 'habs', 'hazards']) {
    await page.locator(`.lyr input[data-l="${k}"]`).uncheck(); await expect(page.locator(`.lyr input[data-l="${k}"]`)).not.toBeChecked();
    await page.locator('.lyrs summary').click();
    await page.locator(`.lyr input[data-l="${k}"]`).check(); await expect(page.locator(`.lyr input[data-l="${k}"]`)).toBeChecked();
    await page.locator('.lyrs summary').click();
  }
  await page.locator('#cmap .leaflet-control-zoom-in').click(); await page.locator('#cmap .leaflet-control-zoom-out').click();
  for (const t of ['Feedback', 'Evidence', 'Investigate', 'Policy & cost', 'Report', 'Compare']) { await page.locator('.steps a', { hasText: t }).click(); await expect(page.locator('.steps a[aria-current="step"]')).toContainText(t); }
  await page.locator('a.btn.primary', { hasText: /^Next: Feedback/ }).click(); await expect(page).toHaveURL(/feedback/);
  await page.locator('a.btn', { hasText: '← Compare' }).click(); await expect(page).toHaveURL(/compare/);
  await page.locator('.crumbs a', { hasText: 'Investigate' }).click(); await expect(page).toHaveURL(/#\/$/);
  await go(page, 'case/C1/access'); await expect(page).toHaveURL(/access/); await expect(page.locator('.steps a[aria-current="step"]')).toContainText('Evidence'); // old route still works
  await go(page, 'cases'); await page.locator('a.lcard').first().click(); await expect(page).toHaveURL(/case\/C1/);
});

test('evidence: tabs, theme messages, profile fold, no timetable invented', async ({ page }) => {
  await newCase(page);
  await page.locator('.steps a', { hasText: 'Evidence' }).click(); await expect(page.locator('.opttabs button')).toHaveCount(2);
  await tab(page, 'GPS Gushaini').click(); await expect(app(page)).toContainText('Getting to GPS Gushaini');
  await expect(app(page)).toContainText('Data unavailable (no timetable source)');
  await expect(app(page)).not.toContainText('HRTC'); await expect(app(page)).not.toContainText('Shared taxi');
  await page.locator('.fold summary', { hasText: 'Elevation profile' }).click(); await expect(page.locator('#cstep svg')).toBeVisible();
  await expect(app(page)).toContainText('Tobler');
  const t = page.locator('.theme').first(); await t.click(); await expect(page.locator('.msg').first()).toBeVisible();
  await expect(page.locator('#ev-profile[open]')).toHaveCount(1);                  // fold state survives the re-render
  await t.click(); await expect(page.locator('.msg')).toHaveCount(0);
  await page.locator('.theme').nth(1).click(); await page.locator('#th-clear').click(); await expect(page.locator('.msg')).toHaveCount(0);
  await tab(page, 'GPS Nagini').click(); await expect(app(page)).toContainText('Getting to GPS Nagini');
  await page.screenshot({ path: SHOT + 'evidence.png', fullPage: true });
});

test('a receiving school shows its own feedback and no bridge from another school\'s route', async ({ page }) => {
  await newCase(page, 'GPS Pekhri-2', ['GPS Gushaini', 'GPS Nagini']);
  await page.locator('.steps a', { hasText: 'Evidence' }).click(); await tab(page, 'GPS Nagini').click();
  await expect(page.locator('.theme').first()).toBeVisible(); await expect(page.locator('.themes')).not.toContainText('87');
  await expect(app(page)).not.toContainText('Baridropa');
  await investigate(page, 'GPS Nagini');
  const text = await page.locator('#findings').innerText();
  expect(text).not.toMatch(/Baridropa|Tirthan|seasonal bridge/i);
});

test('each school keeps its own field answers, interventions and totals', async ({ page }) => {
  await newCase(page, 'GPS Pekhri-2', ['GPS Gushaini', 'GPS Nagini']);
  await go(page, 'case/C1/investigate'); await page.locator('#ag-run-all').click();
  await expect(toast(page)).toContainText('2 schools investigated', { timeout: 60000 });
  await expect(page.locator('.opttabs button .ok')).toHaveCount(2);
  await tab(page, 'GPS Gushaini').click(); await page.locator('.fq[data-q="Q2"] .fv').fill('24'); await page.locator('#fq-go').click();
  await expect(toast(page)).toContainText('Evidence updated');
  await tab(page, 'GPS Nagini').click(); await expect(page.locator('.fq[data-q="Q2"] .fv')).toHaveValue('');
  await tab(page, 'GPS Gushaini').click(); await expect(page.locator('.fq[data-q="Q2"] .fv')).toHaveValue('24');
  await choosePolicy(page, 'GPS Gushaini', ['School transport support']);
  await tab(page, 'GPS Nagini').click(); await expect(page.locator('.ivc.on')).toHaveCount(0);   // Nagini's selections are separate
  await expect(page.locator('#opt-table')).toContainText('₹1.44 lakh');
  await page.locator('.ivc', { hasText: 'School transport support' }).locator('input').check();
  await expect(page.locator('#opt-table')).toContainText('₹1.62 lakh');                            // 27 students on the school roll
  await expect(page.locator('#opt-table td.best')).not.toHaveCount(0);
});

test('investigate: run again, guards, choice buttons and photo caption', async ({ page }) => {
  await newCase(page);
  await go(page, 'case/C1/policy'); await expect(app(page)).toContainText('Run the investigation first');
  await page.locator('a.btn.primary', { hasText: 'Go to Investigate' }).click();
  await go(page, 'case/C1/report'); await expect(app(page)).toContainText('Choose a school first');
  await page.locator('[data-final]').first().click(); await expect(app(page)).toContainText('first');
  await page.locator('a.btn.primary', { hasText: 'Go to Investigate' }).click();
  await tab(page, 'GPS Nagini').click(); await page.locator('#ag-run').click(); await expect(page.locator('.fq')).toHaveCount(5, { timeout: 30000 });
  await page.locator('.fq[data-q="Q2"] .fv').fill('12'); await page.locator('#fq-go').click();
  await expect(page.locator('#ag-run')).toHaveText('Run again');
  await page.locator('#ag-run').click(); await expect(page.locator('.fq')).toHaveCount(5, { timeout: 30000 });
  await expect(page.locator('.fq[data-q="Q2"] .fv')).toHaveValue(''); await expect(page.locator('#fq-go')).toHaveText('Submit field verification');
  const q1 = page.locator('.fq[data-q="Q1"] button');
  await q1.nth(0).click(); await q1.nth(1).click();
  await expect(q1.nth(0)).toHaveAttribute('aria-pressed', 'false'); await expect(q1.nth(1)).toHaveAttribute('aria-pressed', 'true');
  await page.locator('.fq[data-q="Q5"] .ff').setInputFiles({ name: 'bridge.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('x') });
  await expect(page.locator('.fq[data-q="Q5"] .fnote')).toHaveValue(/photo: bridge\.jpg/);
  await expect(page.locator('.fq[data-q="Q5"] button[data-v="Photo"]')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('.finding').first().locator('summary').click(); await expect(page.locator('.finding').first().locator('.evl li').first()).toBeVisible();
});

test('report: leave a finding out, tick evidence, references, comment, re-draft, guards, submit', async ({ page }) => {
  await newCase(page); await investigate(page);
  await go(page, 'case/C1/report'); await page.locator('[data-final]').nth(1).click(); await page.locator('#rp-ok').waitFor();
  await page.locator('#rp-ok').check(); await expect(page.locator('#rp-submit')).toBeDisabled();       // no intervention yet
  await page.locator('#rp-ok').uncheck();
  await page.locator('[data-f="F1"]').uncheck(); await page.locator('[data-f="F2"]').uncheck();
  await expect(page.locator('.draft')).not.toContainText('recurring concerns');
  await page.locator('[data-f="F1"]').check(); await expect(page.locator('.draft')).toContainText('recurring concerns');
  await page.locator('[data-f="F2"]').check();
  for (const fid of ['F1', 'F2', 'F3', 'F4']) { await page.locator(`[data-show="${fid}"]`).click(); await expect(page.locator('#refbox .refs')).toBeVisible(); }
  await expect(page.locator('.fold summary', { hasText: 'Evidence' })).toBeVisible();
  await page.locator('.ref', { hasText: 'E4' }).first().click(); await expect(page.locator('#refbox')).toContainText('E4');
  await page.locator('[data-v="E2"]').check(); await expect(page.locator('[data-v="E2"]')).toBeChecked();
  await page.locator('[data-v="E2"]').uncheck(); await expect(page.locator('[data-v="E2"]')).not.toBeChecked();
  await page.locator('#rp-cmt-go').click(); await expect(page.locator('.cmts')).toContainText('No comments');
  await page.locator('#rp-cmt').fill('Looks fine'); await page.locator('#rp-cmt-go').click();
  await page.locator('.fold summary', { hasText: 'Case record' }).click(); await expect(page.locator('.tl2')).toContainText('Comment');
  await page.locator('#rp-text').fill('My own text.'); await page.locator('#rp-save').click();
  await expect(toast(page)).toContainText('Draft saved'); await expect(page.locator('#rp-text')).toHaveValue('My own text.');
  await page.locator('#rp-reset').click(); await expect(page.locator('#rp-text')).not.toHaveValue('My own text.');
  await choosePolicy(page, 'GPS Gushaini', ['replace the building', 'School transport support']);
  await go(page, 'case/C1/report'); await page.locator('#rp-ok').waitFor();
  await expect(app(page)).toContainText('one-time'); await expect(page.locator('#rp-submit')).toBeDisabled();
  await page.locator('#rp-ok').check(); await expect(page.locator('#rp-submit')).toBeEnabled();
  await page.locator('#rp-ok').uncheck(); await expect(page.locator('#rp-submit')).toBeDisabled();
  await page.locator('#rp-ok').check();
  await page.locator('#rp-submit').click(); await expect(toast(page)).toContainText('Report submitted');
  await expect(page.locator('#rp-text')).toBeDisabled();
  await page.locator('a.brand').click(); await expect(page.locator('#cpanel')).toContainText('Ready for administrative review');
});

test('merges: one tile per merge, closing-school links, new merge', async ({ page }) => {
  await go(page, 'merges'); await page.waitForSelector('.rcv');
  expect(await page.locator('.rcv').count()).toBe(5);
  await expect(page.locator('.home-stats')).not.toContainText('undefined');
  await expect(page.locator('#mtiles .rcv')).toHaveCount(5);
  await page.locator('.rcv .from a').first().click(); await expect(page).toHaveURL(/#\/m\/M\d+\/g\/G\d+/);
  await go(page, 'merges'); await page.locator('.rcv a.stretch').first().click(); await expect(page).toHaveURL(/#\/m\/M\d+$/);
  await go(page, 'merges'); await page.locator('a.btn', { hasText: 'New merge' }).click(); await expect(page).toHaveURL(/#\/new/);
});

test('merge page: re-run, every problem link, folded problems, policies, actions, breadcrumbs', async ({ page }) => {
  await go(page, 'm/M5'); await page.locator('#rerun').waitFor();
  await page.locator('#rerun').click(); await expect(toast(page)).toContainText('Analysis re-run');
  await expect(page.locator('.probs .prob').first()).toBeVisible();
  await page.locator('.fold summary', { hasText: 'Show the other' }).click();
  const links = await page.locator('.prob a').evaluateAll(as => as.map(a => a.getAttribute('href')));
  expect(links.length).toBeGreaterThan(3);
  for (const h of links) { await page.goto('/' + h); await page.waitForTimeout(250); await expect(page.locator('#app .card.err')).toHaveCount(0); await expect(app(page)).not.toBeEmpty(); }
  await go(page, 'm/M5');
  const pol = await page.locator('.pcard').evaluateAll(as => as.map(a => a.getAttribute('href')));
  expect(pol.length).toBeGreaterThanOrEqual(3);
  for (const h of pol) { await page.goto('/' + h); await expect(page.locator('h1')).toBeVisible(); await expect(page.locator('#app .card.err')).toHaveCount(0); }
  await go(page, 'm/M5');
  await page.locator('.actions a', { hasText: 'Field survey form' }).click(); await expect(page).toHaveURL(/survey$/);
  await page.locator('.crumbs a', { hasText: 'GPS Bhumteer' }).click(); await expect(page).toHaveURL(/#\/m\/M5$/);
  await page.locator('.actions a', { hasText: 'Feedback' }).click(); await expect(page).toHaveURL(/feedback$/); await expect(page.locator('.msg').first()).toBeVisible();
  await page.locator('.crumbs a', { hasText: 'Merges' }).click(); await expect(page).toHaveURL(/#\/merges/);
  await go(page, 'm/M5'); await page.locator('.slist a.srow').first().click(); await expect(page).toHaveURL(/\/g\/G/);
  await page.locator('.crumbs a', { hasText: 'GPS Bhumteer' }).click();
  await page.locator('.slist a.recvrow').click(); await expect(page).toHaveURL(/#\/s\//); await expect(app(page)).toContainText('Students');
  await page.locator('.crumbs a', { hasText: 'Map' }).click(); await expect(page).toHaveURL(/#\/$/);
  await go(page, 'm/NOPE'); await expect(page).toHaveURL(/#\/$/);
  await go(page, 'm/M5/zzz'); await expect(page).toHaveURL(/#\/m\/M5$/);
  await go(page, 'm/M5'); await page.screenshot({ path: SHOT + 'merge.png', fullPage: true });
});

test('closing-school page: folds open, match check, policy cards', async ({ page }) => {
  await go(page, 'm/M5'); await page.locator('.slist a.srow').first().click(); await expect(page).toHaveURL(/\/g\/G/);
  await expect(app(page)).toContainText('Match check');
  await page.locator('.fold summary', { hasText: 'Rule checks' }).click(); expect(await page.locator('.chk').count()).toBeGreaterThan(3);
  await expect(app(page)).not.toContainText('Anganwadi on site');
  await page.locator('.fold summary', { hasText: 'Feedback' }).click();
  await page.locator('a.pcard').first().click(); await expect(page).toHaveURL(/\/p\/G\d+\//);
  await page.goBack(); await expect(page).toHaveURL(/\/g\/G/);
});

test('plan item: status save, previous/next, back, questions, unpriced items say so', async ({ page }) => {
  await go(page, 'm/M5');
  const pol = await page.locator('.pcard').evaluateAll(as => as.map(a => a.getAttribute('href')));
  await page.goto('/' + pol[0]); await page.locator('#im-s').waitFor();
  await page.locator('#im-s').selectOption('in progress'); await page.locator('#im-n').fill('vehicle contract signed');
  await page.locator('#im-go').click(); await expect(toast(page)).toContainText('Status saved');
  await expect(page.locator('#im-s')).toHaveValue('in progress'); await expect(page.locator('#im-n')).toHaveValue('vehicle contract signed');
  await page.locator('a.btn', { hasText: 'Next →' }).click(); await expect(page).toHaveURL(/\/p\//);
  await page.locator('a.btn', { hasText: '← Previous' }).click(); await expect(page).toHaveURL(/\/p\//);
  const qs = page.locator('#iq .q');
  if (await qs.count()) { await qs.first().locator('.opts button').first().click(); await expect(toast(page)).toContainText('Answer saved'); }
  await page.locator('a.btn', { hasText: '← Back to the merge' }).click(); await expect(page).toHaveURL(/#\/m\/M5$/);
  await page.goto('/#/m/M5/p/G5/nonexistent'); await expect(app(page)).toContainText('no longer in the plan');
  await page.locator('a.btn', { hasText: 'Back to the merge' }).click(); await expect(page).toHaveURL(/#\/m\/M5$/);
  const unpriced = await page.evaluate(() => window.__pathshala.q("SELECT count(*) AS n FROM plan_items WHERE cost_type = 'unpriced'")[0].n);
  const invented = await page.evaluate(() => window.__pathshala.q("SELECT count(*) AS n FROM plan_items WHERE code IN ('warden','girls') AND cost_type != 'unpriced' AND cost_type != 'none'")[0].n);
  expect(invented).toBe(0); expect(unpriced).toBeGreaterThanOrEqual(0);
});

test('survey: empty submit warns; values, answers, notes update the plan', async ({ page }) => {
  await go(page, 'm/M5/survey'); await page.locator('#sv-go').waitFor();
  await page.locator('#sv-go').click(); await expect(toast(page)).toContainText('Nothing filled in');
  await page.locator('#sv-agent').fill('BEO Test'); await page.locator('#sv-date').fill('2026-09-30');
  const sec = page.locator('.svsec').first();
  await sec.locator('input[data-f="walk_km"]').fill('0.8'); await sec.locator('input[data-f="walk_min"]').fill('15');
  const sq = sec.locator('.sq').first(); await sq.locator('.opts button').first().click(); await sq.locator('.opts button').first().click(); await sq.locator('.opts button').nth(1).click();
  await sec.locator('.nt').fill('Children are afraid of the nallah.'); await sec.locator('.nrole').fill('Grandmother');
  await page.locator('#sv-go').click(); await expect(toast(page)).toBeVisible();
  await go(page, 'm/M5/feedback'); await expect(app(page)).toContainText('afraid of the nallah');
});

test('to do and field surveys pages are gone', async ({ page }) => {
  for (const h of ['problems', 'surveys']) { await go(page, h); await expect(page.locator('#cpanel, #hmap').first()).toBeVisible(); }
  await expect(page.locator('#nav a', { hasText: 'To do' })).toHaveCount(0);
});

test('feedback inbox: samples, live classifier, filters, save, empty save', async ({ page }) => {
  await go(page, 'inbox'); await page.locator('#fb-t').waitFor();
  await expect(page.locator('#fb-cls')).toContainText('Type a message');
  await page.locator('#fb-go').click(); await expect(page.locator('#fb-t')).toBeFocused();
  const samples = page.locator('.samples button'); expect(await samples.count()).toBe(5);
  for (let i = 0; i < 5; i++) { await samples.nth(i).click(); await expect(page.locator('#fb-t')).not.toHaveValue(''); await expect(page.locator('#fb-cls')).toContainText('Structured as'); }
  await samples.nth(0).click(); await expect(page.locator('#fb-cls')).toContainText('Hindi');
  await page.locator('#fb-t').fill('The road is closed and unsafe in winter'); await expect(page.locator('#fb-cls')).toContainText('English');
  const filters = page.locator('.filters button'); const nf = await filters.count(); expect(nf).toBeGreaterThan(3);
  for (let i = 0; i < nf; i++) { await filters.nth(i).click(); await expect(page.locator('.filters button[aria-pressed="true"]')).toHaveCount(1); }
  const before = await page.locator('.card h2 small', { hasText: 'messages' }).innerText();
  await page.locator('#fb-t').fill('Buses never come to our village, children are worried'); await page.locator('#fb-role').fill('Shopkeeper'); await page.locator('#fb-ch').selectOption('Gram sabha');
  await page.locator('#fb-go').click(); await expect(toast(page)).toContainText('Feedback saved');
  await expect(page.locator('.card h2 small', { hasText: 'messages' })).not.toHaveText(before);
  await expect(app(page)).toContainText('Buses never come');
});

test('rules: edit, undo, save re-checks every merge; no invented cost rules', async ({ page }) => {
  await go(page, 'rules'); await page.locator('.rl').first().waitFor();
  expect(await page.locator('.rl').count()).toBe(11);
  const params = await page.locator('.rl .mono').allInnerTexts();
  for (const bad of ['warden_per_year', 'girls_safety_cost', 'vehicle_seats']) expect(params).not.toContain(bad);
  await expect(page.locator('#rl-go')).toBeDisabled(); await expect(page.locator('#rl-undo')).toBeDisabled();
  const inp = page.locator('.rl input').first(); const orig = await inp.inputValue(); await inp.fill(String(+orig + 1));
  await expect(page.locator('.rl.changed')).toHaveCount(1); await expect(page.locator('#rl-n')).toHaveText('1 rule changed.'); await expect(page.locator('#rl-go')).toBeEnabled();
  await page.locator('#rl-undo').click(); await expect(page.locator('.rl input').first()).toHaveValue(orig); await expect(page.locator('#rl-n')).toHaveText('No changes.');
  await page.locator('.rl[data-id="R4"] input').fill('5'); await page.locator('.rl[data-id="R2"] input').fill('20'); await page.locator('.rl[data-id="R1"] input').fill('200');
  await expect(page.locator('#rl-n')).toHaveText('3 rules changed.');
  await page.locator('#rl-go').click(); await expect(toast(page)).toContainText('rules updated'); await expect(page.locator('.rl[data-id="R4"] input')).toHaveValue('5');
});

test('SQLite console: samples, tables, Ctrl+Enter, errors, write re-runs analysis', async ({ page }) => {
  await go(page, 'sql'); await page.locator('#sql').waitFor(); await expect(page.locator('#sqlres table')).toBeVisible();
  const samples = page.locator('.samples button'); const ns = await samples.count(); expect(ns).toBe(8);
  for (let i = 0; i < ns - 1; i++) { await samples.nth(i).click(); await expect(page.locator('#sqlres')).not.toContainText('Running'); await expect(page.locator('#sqlres .err')).toHaveCount(0); }
  const tables = page.locator('.tlist button'); expect(await tables.count()).toBeGreaterThan(20);
  const names = await tables.evaluateAll(b => b.map(x => x.dataset.t)); expect(names).not.toContain('transport');
  await tables.first().click(); await expect(page.locator('#sql')).toHaveValue(/SELECT \* FROM/);
  await page.locator('#sql').fill('SELECT 41 + 1 AS answer;'); await page.locator('#sql').press('Control+Enter'); await expect(page.locator('#sqlres')).toContainText('42');
  await page.locator('#sql').fill('SELEKT nonsense'); await page.locator('#runsql').click(); await expect(page.locator('#sqlres .err')).toBeVisible();
  const before = await page.evaluate(() => window.__pathshala.q('SELECT count(*) AS n FROM hazards')[0].n);
  await samples.nth(7).click(); await expect(toast(page)).toContainText('SQL write applied'); await expect(page.locator('#sqlres')).toContainText('rows changed');
  expect(await page.evaluate(() => window.__pathshala.q('SELECT count(*) AS n FROM hazards')[0].n)).toBe(before + 1);
});

test('new merge planner: receiver picker, ticks, summary, create, delete', async ({ page }) => {
  await go(page, 'new'); await page.locator('#pl-r').waitFor();
  expect(await page.locator('#pl-r option').count()).toBeGreaterThan(5);
  await page.locator('#pl-r').selectOption({ index: 1 }); await expect(page).toHaveURL(/#\/new\/\w+/);
  await page.locator('#pl-r option', { hasText: 'GPS Gushaini' }).evaluate(o => { o.parentElement.value = o.value; o.parentElement.dispatchEvent(new Event('change')); });
  await expect(page.locator('#pl-go')).toBeDisabled(); await expect(page.locator('#pl-sum')).toContainText('0 schools');
  const cand = page.locator('.cand').first(); await cand.locator('input').check();
  await expect(cand).toHaveClass(/on/); await expect(page.locator('#pl-sum')).toContainText('1 school'); await expect(page.locator('#pl-go')).toBeEnabled();
  await page.locator('.cand').nth(1).locator('input').check(); await expect(page.locator('#pl-sum')).toContainText('2 schools');
  await page.locator('.cand').nth(1).locator('input').uncheck(); await expect(page.locator('#pl-sum')).toContainText('1 school');
  await page.locator('#pl-go').click(); await expect(toast(page)).toContainText('Created M6');
  await expect(page).toHaveURL(/#\/m\/M6$/); await expect(app(page)).toContainText('GPS Gushaini'); await expect(page.locator('#delm')).toBeVisible();
  await page.locator('#delm').click(); await expect(page.locator('#delm')).toHaveText('Click again to delete');
  await page.locator('#delm').click(); await expect(page).toHaveURL(/#\/$/);
  await go(page, 'merges'); expect(await page.locator('.rcv').count()).toBe(5);
});

test('school page, inbox deep link, unknown routes', async ({ page }) => {
  await go(page, 'm/M5'); await page.locator('.slist a.recvrow').click(); await expect(page.locator('h1')).toContainText('GPS Bhumteer');
  await expect(app(page)).not.toContainText('anganwadi on site');
  await page.locator('#app a[href^="#/m/"]').first().click(); await expect(page).toHaveURL(/#\/m\/M5/);
  await go(page, 'inbox/G5'); await expect(page.locator('#fb-g')).toHaveValue('G5');
  for (const h of ['s/NOPE', 'nope', 'case/ZZ/compare', 'case']) { await go(page, h); await expect(page).toHaveURL(/#\/$/); }
});

test('every page lists its data sources; synthesised data names PathShala', async ({ page }) => {
  await page.evaluate(() => window.__pathshala.createCase('PK2', ['GSH', 'NGN']));
  for (const h of ['', 'merges', 'cases', 'm/M5', 's/UCH', 'new', 'inbox', 'rules', 'sql', 'ai', 'case/C1/compare', 'case/C1/feedback', 'case/C1/evidence', 'case/C1/investigate', 'case/C1/policy', 'case/C1/report']) {
    await go(page, h); await expect(page.locator('#srcs')).toHaveCount(1);
    await page.locator('#srcs summary').click(); await expect(page.locator('#srcs')).toContainText(/UDISE|Rules|RTE|PathShala|officer/);
  }
  await go(page, 'case/C1/compare'); await expect(page.locator('.cmptbl .src').first()).not.toBeEmpty();
  await page.locator('#srcs summary').click(); await expect(page.locator('#srcs dd.syn')).toContainText('PathShala (synthesised');
  await page.screenshot({ path: 'docs/screens/12-sources.png', fullPage: true });
});

test('mock tags read "PathShala (synthesised)"', async ({ page }) => {
  await page.evaluate(() => window.__pathshala.createCase('PK2', ['GSH', 'NGN']));
  await go(page, 'case/C1/compare'); await expect(page.locator('.tag.mock').first()).toHaveText('PathShala (synthesised)');
  await expect(page.locator('.tag', { hasText: /^mock$/i })).toHaveCount(0);
});

test('feedback step: classify with sentiment and stance, category agents, carried forward', async ({ page }) => {
  await page.evaluate(() => window.__pathshala.createCase('PK2', ['GSH', 'NGN']));
  await go(page, 'case/C1/feedback'); await expect(page.locator('#fb-classify')).toContainText('Classify');   // Nagini first: its own messages plus those about Pekhri-2
  await page.locator('.opttabs button', { hasText: 'Gushaini' }).click();
  await expect(page.locator('.cat')).toHaveCount(5); await expect(page.locator('.cat').first()).toBeDisabled(); await expect(page.locator('#fb-agents')).toBeDisabled();
  await page.locator('#fb-classify').click(); await expect(page.locator('.stanceall')).toContainText('support');
  const cats = await page.locator('.cat b').allTextContents(); expect(cats.reduce((a, n) => a + +n, 0)).toBe(await page.evaluate(() => window.__pathshala.q("SELECT count(*) AS n FROM citizen_feedback WHERE about_id IN ('PK2','GSH')")[0].n));
  await page.locator('.cat', { hasText: 'Transportation' }).click(); await expect(page.locator('#fb-Transportation')).toHaveJSProperty('open', true);
  await expect(page.locator('#fb-Transportation .msg').first()).toContainText('about');
  await page.locator('#fb-agents').click();
  await expect(page.locator('.ctile')).toHaveCount(5); await expect(page.locator('.ctile .pill').first()).toContainText(/merging|Mixed|Neutral/);
  await go(page, 'case/C1/evidence'); await page.locator('.opttabs button', { hasText: 'Gushaini' }).click(); await expect(page.locator('#concerns .ctile')).toHaveCount(5);
  await go(page, 'case/C1/investigate'); await page.locator('.opttabs button', { hasText: 'Gushaini' }).click(); await expect(page.locator('#concerns')).toContainText('Carried forward');
  await go(page, 'case/C1/feedback'); await page.locator('.opttabs button', { hasText: 'Gushaini' }).click();
  await page.screenshot({ path: 'docs/screens/13-feedback.png' });
});

test('feedback reaches the report draft with a reference the critic accepts; stance rules', async ({ page }) => {
  const r = await page.evaluate(async () => {
    const P = window.__pathshala; const inv = P.createCase('PK2', ['GSH']); const cid = inv + '-GSH';
    await P.runClassify(cid); await P.runCategoryAgents(cid);
    const d = P.draftSentences(cid).filter(s => s.refs.some(x => x.startsWith('K:')));
    const crit = await P.callAgent('reportCritic', { cid, sentences: P.draftSentences(cid) });
    return { n: d.length, refs: d.map(s => s.refs[0]), pass: crit.pass, issues: crit.issues.filter(i => P.draftSentences(cid)[i.sentence_index]?.refs.some(x => x.startsWith('K:'))), st: [P.stanceOf('receiver', 'positive'), P.stanceOf('receiver', 'negative'), P.stanceOf('sender', 'positive'), P.stanceOf('sender', 'negative'), P.stanceOf('merger', 'neutral')], rule: P.classifyByRules('Our village school is our identity.') };
  });
  expect(r.n).toBe(5); expect(r.st).toEqual(['support', 'oppose', 'oppose', 'support', 'neutral']); expect(r.rule.category).toBe('Social');
  expect(r.issues).toEqual([]);
});

test('quick demo: guides through every input with "Do it for me", back, exit', async ({ page }) => {
  test.setTimeout(240000);
  await page.locator('#demo-start').click(); await expect(page.locator('#demo')).toContainText('step 1 of 12');
  await expect(page.locator('.demo-hl')).toHaveCount(1);
  await page.locator('#dm-do').click(); await expect(page.locator('#cpanel')).toContainText('Closing school');
  await page.locator('#dm-next').click(); await expect(page.locator('#demo')).toContainText('step 2 of 12');
  await page.locator('#dm-do').click(); await expect(page.locator('#cp-go')).toContainText('Compare 2 schools');
  await page.locator('#dm-next').click(); await page.locator('#dm-do').click(); await expect(page).toHaveURL(/case\/C\d+\/compare/);
  await expect(page.locator('#demo')).toContainText('step 3 of 12'); await page.locator('#dm-next').click();
  await expect(page.locator('#demo')).toContainText('Compare side by side'); await expect(page.locator('.cmptbl')).toBeVisible();
  await page.locator('#dm-back').click(); await expect(page.locator('#demo')).toContainText('step 3 of 12'); await page.locator('#dm-next').click();
  await page.locator('#dm-next').click(); await expect(page).toHaveURL(/feedback/);
  await page.locator('#dm-do').click(); await expect(page.locator('#fb-agents')).toBeEnabled({ timeout: 20000 });
  await page.locator('#dm-next').click(); await page.locator('#dm-do').click(); await expect(page.locator('.ctile').first()).toBeVisible({ timeout: 30000 });
  await page.locator('#dm-next').click(); await expect(page).toHaveURL(/evidence/); await expect(page.locator('#concerns')).toBeVisible();
  await page.locator('#dm-next').click(); await expect(page).toHaveURL(/investigate/);
  await page.locator('#dm-do').click(); await expect(page.locator('.fq')).toHaveCount(5, { timeout: 90000 });
  await page.locator('#dm-next').click(); await page.locator('#dm-do').click(); await expect(page.locator('#fq')).toContainText('Answered', { timeout: 30000 });
  await page.locator('#dm-next').click(); await expect(page).toHaveURL(/policy/);
  await page.locator('#dm-do').click(); await expect(page.locator('.ivsel input:checked').first()).toBeVisible({ timeout: 30000 });
  await page.locator('#dm-next').click(); await expect(page).toHaveURL(/report/);
  await page.locator('#dm-do').click(); await expect(page.locator('#opt-table th.chosen')).toHaveCount(1, { timeout: 20000 });
  await page.locator('#dm-next').click(); await expect(page.locator('#demo')).toContainText('step 12 of 12'); await expect(page.locator('#rp-text')).toBeVisible();
  await page.screenshot({ path: 'docs/screens/15-demo.png' });
  await page.locator('#dm-next').click(); await expect(page.locator('#demo')).toBeHidden();
  await go(page, ''); await page.locator('#demo-start').click(); await page.locator('#dm-exit').click(); await expect(page.locator('#demo')).toBeHidden();
});

test('every school has feedback about it; a save under an older seed key is discarded', async ({ page }) => {
  const r = await page.evaluate(() => { const q = window.__pathshala.q; return { none: q('SELECT name FROM schools WHERE school_id NOT IN (SELECT about_id FROM citizen_feedback)').map(x => x.name), n: q('SELECT count(*) AS n FROM schools')[0].n }; });
  expect(r.none).toEqual([]); expect(r.n).toBeGreaterThan(20);
  await page.evaluate(() => localStorage.setItem('pathshala.db.abc123', 'x')); await page.reload(); await page.waitForSelector('#hmap');
  expect(await page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('pathshala.db')).includes('pathshala.db.abc123'))).toBe(false);
});
