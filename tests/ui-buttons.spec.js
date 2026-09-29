// Clicks every control on every page and checks the effect. Each test starts from a fresh demo database.
import { test, expect } from '@playwright/test';

const SHOT = 'tests/compare/actual/ui-';
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

test('header: brand and all eight nav links', async ({ page }) => {
  const nav = [['Case map', /#\/$/, 'Find a school'], ['Investigations', /#\/cases/, 'Investigations'], ['Merges', /#\/merges/, 'school merges'], ['Problems', /#\/problems/, 'Problems to address'], ['Surveys', /#\/surveys/, 'Field surveys'], ['Feedback', /#\/inbox/, 'Log feedback'], ['Rules', /#\/rules/, 'Rules'], ['SQLite', /#\/sql/, 'SQLite console']];
  for (const [label, url, text] of nav) {
    await page.locator('#nav a', { hasText: label }).first().click();
    await expect(page).toHaveURL(url);
    await expect(app(page)).toContainText(text);
    await expect(page.locator('#nav a[aria-current="page"]')).toContainText(label);
  }
  await page.locator('a.brand').click();
  await expect(page).toHaveURL(/#\/$/);
  await expect(page.locator('#b-p')).toHaveText('4');
});

test('reset demo: two clicks, wipes changes and localStorage', async ({ page }) => {
  await go(page, 'rules');
  await page.locator('.rl input').first().fill('7');
  await page.locator('#rl-go').click();
  await expect(toast(page)).toBeVisible();
  const key = await page.evaluate(() => Object.keys(localStorage).find(k => k.startsWith('pathshala.db')));
  expect(key).toBe('pathshala.db.v5');
  await page.locator('#reset').click();
  await expect(page.locator('#reset')).toHaveText('Click again to reset');
  await page.locator('#reset').click();
  await expect(page.locator('#reset')).toHaveText('Reset demo');
  await expect(toast(page)).toContainText('Demo reset');
  await expect(page.locator('.rl input').first()).not.toHaveValue('7');
  // arming times out without a second click
  await page.locator('#reset').click();
  await expect(page.locator('#reset')).toHaveText('Click again to reset');
  await page.waitForTimeout(4300);
  await expect(page.locator('#reset')).toHaveText('Reset demo');
});

test('persistence: a change survives a reload (localStorage)', async ({ page }) => {
  await go(page, 'rules');
  await page.locator('.rl input').first().fill('4');
  await page.locator('#rl-go').click();
  await page.reload(); await page.waitForSelector('#nav');
  await go(page, 'rules');
  await expect(page.locator('.rl input').first()).toHaveValue('4');
  await expect(page.locator('#dbstat')).toContainText('saved');
});

test('case map: layer toggles, zoom, back link on the case pages', async ({ page }) => {
  await page.locator('#cpanel .srow', { hasText: 'GPS Pekhri-2' }).click();
  await page.locator('#cpanel tr[data-b]', { hasText: 'Gushaini' }).click();
  await page.locator('#cp-go').click();
  await expect(page).toHaveURL(/case\/C1\/compare/);
  for (const k of ['river', 'road', 'route', 'habs', 'hazards']) {
    await page.locator('#cmap .leaflet-map-pane').waitFor({ state: 'attached' });
    const box = page.locator(`.lyr input[data-l="${k}"]`);
    await box.uncheck(); await expect(page.locator(`.lyr input[data-l="${k}"]`)).not.toBeChecked();
    await page.locator(`.lyr input[data-l="${k}"]`).check(); await expect(page.locator(`.lyr input[data-l="${k}"]`)).toBeChecked();
  }
  await page.locator('#cmap .leaflet-control-zoom-in').click(); await page.locator('#cmap .leaflet-control-zoom-out').click();
  // step navigation: Continue and back buttons, all six step tabs
  const tabs = ['Access', 'Community', 'Investigate', 'Policy & cost', 'Report', 'Compare'];
  for (const t of tabs) { await page.locator('.steps a', { hasText: t }).click(); await expect(page.locator('.steps a[aria-current="step"]')).toContainText(t); }
  await page.locator('.cside').first().scrollIntoViewIfNeeded();
  await page.locator('a.btn.primary', { hasText: 'Continue: Access' }).click();
  await expect(page).toHaveURL(/access/);
  await page.locator('a.btn', { hasText: '← Compare' }).click();
  await expect(page).toHaveURL(/compare/);
  await page.locator('.crumbs a', { hasText: 'Investigations' }).click();
  await expect(page).toHaveURL(/#\/cases/);
  await page.locator('a.lcard').first().click();
  await expect(page).toHaveURL(/case\/C1/);
  await go(page, '');
  await page.locator('#cp-back').click();
  await expect(page.locator('#cpanel')).toContainText('Your investigations');
  await page.locator('#cpanel a.srow').click();
  await expect(page).toHaveURL(/case\/C1/);
});

test('investigate: Run again replaces findings; policy and report guard when not run', async ({ page }) => {
  await page.locator('#cpanel .srow', { hasText: 'GPS Pekhri-2' }).click();
  await page.locator('#cpanel tr[data-b]', { hasText: 'Gushaini' }).click();
  await page.locator('#cp-go').click();
  await go(page, 'case/C1/policy');
  await expect(app(page)).toContainText('Run the investigation first');
  await page.locator('a.btn.primary', { hasText: 'Go to Investigate' }).click();
  await go(page, 'case/C1/report');
  await expect(app(page)).toContainText('Run the investigation first');
  await page.locator('a.btn.primary', { hasText: 'Go to Investigate' }).click();
  await page.locator('#ag-run').click();
  await expect(page.locator('.fq')).toHaveCount(5, { timeout: 30000 });
  await page.locator('.fq[data-q="Q2"] .fv').fill('12');
  await page.locator('#fq-go').click();
  await expect(page.locator('#ag-run')).toHaveText('Run again');
  await page.locator('#ag-run').click();
  await expect(page.locator('.fq')).toHaveCount(5, { timeout: 30000 });
  await expect(page.locator('.fq[data-q="Q2"] .fv')).toHaveValue('');
  await expect(page.locator('#fq-go')).toHaveText('Submit field verification');
  // choice buttons toggle exclusively
  const q1 = page.locator('.fq[data-q="Q1"] button');
  await q1.nth(0).click(); await q1.nth(1).click();
  await expect(q1.nth(0)).toHaveAttribute('aria-pressed', 'false'); await expect(q1.nth(1)).toHaveAttribute('aria-pressed', 'true');
  // photo file input appends a caption to the note
  await page.locator('.fq[data-q="Q5"] .ff').setInputFiles({ name: 'bridge.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('x') });
  await expect(page.locator('.fq[data-q="Q5"] .fnote')).toHaveValue(/photo: bridge\.jpg/);
  await expect(page.locator('.fq[data-q="Q5"] button[data-v="Photo"]')).toHaveAttribute('aria-pressed', 'true');
});

test('report: remove finding, officer tick, evidence chips, re-draft, edit, guard on submit', async ({ page }) => {
  await page.locator('#cpanel .srow', { hasText: 'GPS Pekhri-2' }).click();
  await page.locator('#cpanel tr[data-b]', { hasText: 'Gushaini' }).click();
  await page.locator('#cp-go').click();
  await go(page, 'case/C1/investigate');
  await page.locator('#ag-run').click(); await expect(page.locator('.fq')).toHaveCount(5, { timeout: 30000 });
  await go(page, 'case/C1/report'); await page.locator('#rp-ok').waitFor();
  // approve without an intervention leaves submit disabled
  await page.locator('#rp-ok').check(); await expect(page.locator('#rp-submit')).toBeDisabled();
  await page.locator('#rp-ok').uncheck();
  // untick both main findings: the community sentence disappears from the draft
  await page.locator('[data-f="F1"]').uncheck(); await page.locator('[data-f="F2"]').uncheck();
  await expect(page.locator('.draft')).not.toContainText('recurring concerns');
  await page.locator('[data-f="F1"]').check(); await expect(page.locator('.draft')).toContainText('recurring concerns');
  await page.locator('[data-f="F2"]').check();
  // evidence buttons and reference chips flash and show details
  for (const fid of ['F1', 'F2', 'F3', 'F4']) { await page.locator(`[data-show="${fid}"]`).click(); await expect(page.locator('#refbox .refs')).toBeVisible(); }
  await page.locator('.ref', { hasText: 'E4' }).first().click(); await expect(page.locator('#refbox')).toContainText('E4');
  // officer ticks persist
  await page.locator('[data-v="E2"]').check(); await expect(page.locator('[data-v="E2"]')).toBeChecked();
  await page.locator('[data-v="E2"]').uncheck(); await expect(page.locator('[data-v="E2"]')).not.toBeChecked();
  // empty comment does nothing; a comment appears in the record
  await page.locator('#rp-cmt-go').click(); await expect(page.locator('.cmts')).toContainText('No comments');
  await page.locator('#rp-cmt').fill('Looks fine'); await page.locator('#rp-cmt-go').click();
  await expect(page.locator('.tl2')).toContainText('Comment');
  // edit + save + re-draft
  await page.locator('#rp-text').fill('My own text.'); await page.locator('#rp-save').click();
  await expect(toast(page)).toContainText('Draft saved'); await expect(page.locator('#rp-text')).toHaveValue('My own text.');
  await page.locator('#rp-reset').click(); await expect(page.locator('#rp-text')).not.toHaveValue('My own text.');
  await expect(page.locator('.draft')).toBeVisible();
  // policy: tick then the report shows the mitigation and the cost split
  await go(page, 'case/C1/policy'); await page.locator('.ivc').first().waitFor();
  await page.locator('.ivc', { hasText: 'Keep GPS Pekhri-2 and replace the building' }).locator('input').check();
  await page.locator('.ivc', { hasText: 'School transport support' }).locator('input').check();
  await go(page, 'case/C1/report'); await page.locator('#rp-ok').waitFor();
  await expect(app(page)).toContainText('one-time');
  await expect(page.locator('#rp-submit')).toBeDisabled();
  await page.locator('#rp-ok').check(); await expect(page.locator('#rp-submit')).toBeEnabled();
  await page.locator('#rp-ok').uncheck(); await expect(page.locator('#rp-submit')).toBeDisabled();
  await page.locator('#rp-ok').check();
  await page.locator('#rp-submit').click(); await expect(toast(page)).toContainText('Report submitted');
  await expect(page.locator('#rp-text')).toBeDisabled();
  await page.locator('#nav a', { hasText: 'Investigations' }).click();
  await expect(app(page)).toContainText('Ready for administrative review');
});

test('merges map: new merge, card, closing-school links, map zoom', async ({ page }) => {
  await go(page, 'merges'); await page.waitForSelector('.rcv');
  expect(await page.locator('.rcv').count()).toBe(5);
  await page.locator('#hmap .leaflet-control-zoom-in').click(); await page.locator('#hmap .leaflet-control-zoom-out').click();
  await page.locator('.rcv .from a').first().click();
  await expect(page).toHaveURL(/#\/m\/M\d+\/g\/G\d+/);
  await go(page, 'merges');
  await page.locator('.rcv a.stretch').first().click();
  await expect(page).toHaveURL(/#\/m\/M\d+$/);
  await go(page, 'merges');
  await page.locator('a.btn', { hasText: 'New merge' }).click();
  await expect(page).toHaveURL(/#\/new/);
});

test('merge page: re-run, every problem link, policy cards, three link cards, breadcrumbs', async ({ page }) => {
  await go(page, 'm/M5'); await page.locator('#rerun').waitFor();
  await page.locator('#rerun').click(); await expect(toast(page)).toContainText('Analysis re-run');
  const links = await page.locator('.prob a').evaluateAll(as => as.map(a => a.getAttribute('href')));
  expect(links.length).toBeGreaterThan(3);
  for (const h of links) { await page.goto('/' + h); await page.waitForTimeout(250); await expect(page.locator('#app .card.err')).toHaveCount(0); await expect(app(page)).not.toBeEmpty(); }
  await go(page, 'm/M5');
  const pol = await page.locator('.pcard').evaluateAll(as => as.map(a => a.getAttribute('href')));
  expect(pol.length).toBeGreaterThanOrEqual(3);
  for (const h of pol) { await page.goto('/' + h); await expect(page.locator('h1')).toBeVisible(); await expect(page.locator('#app .card.err')).toHaveCount(0); }
  await go(page, 'm/M5');
  await page.locator('a.lcard', { hasText: 'Field survey form' }).click(); await expect(page).toHaveURL(/survey$/);
  await page.locator('.crumbs a', { hasText: 'GPS Bhumteer' }).click(); await expect(page).toHaveURL(/#\/m\/M5$/);
  await page.locator('a.lcard', { hasText: 'Feedback' }).click(); await expect(page).toHaveURL(/feedback$/);
  await expect(page.locator('.msg').first()).toBeVisible();
  await page.locator('.crumbs a', { hasText: 'Merges' }).click(); await expect(page).toHaveURL(/#\/merges/);
  await go(page, 'm/M5');
  await page.locator('.slist a.srow').first().click(); await expect(page).toHaveURL(/\/g\/G/);
  await page.locator('.crumbs a', { hasText: 'GPS Bhumteer' }).click();
  await page.locator('.slist a.recvrow').click(); await expect(page).toHaveURL(/#\/s\//);
  await expect(app(page)).toContainText('Students');
  await page.locator('.crumbs a', { hasText: 'Map' }).click(); await expect(page).toHaveURL(/#\/$/);
  await go(page, 'm/NOPE'); await expect(page).toHaveURL(/#\/$/);
  await go(page, 'm/M5/zzz'); await expect(page).toHaveURL(/#\/m\/M5$/);
});

test('closing-school page: match check, rule checks, policy cards, feedback', async ({ page }) => {
  await go(page, 'm/M5');
  await page.locator('.slist a.srow').first().click(); await expect(page).toHaveURL(/\/g\/G/);
  await expect(app(page)).toContainText('Match check'); await expect(app(page)).toContainText('Rule checks');
  expect(await page.locator('.chk').count()).toBeGreaterThan(3);
  await expect(app(page)).toContainText('Policies for this school');
  await page.screenshot({ path: SHOT + 'pair.png', fullPage: true });
  await page.locator('a.pcard').first().click(); await expect(page).toHaveURL(/\/p\/G\d+\//);
  await page.goBack(); await expect(page).toHaveURL(/\/g\/G/);
  await page.locator('.crumbs a', { hasText: 'GPS Bhumteer' }).click(); await expect(page).toHaveURL(/#\/m\/M5$/);
});

test('plan item: status save, previous/next, back, questions', async ({ page }) => {
  await go(page, 'm/M5');
  const pol = await page.locator('.pcard').evaluateAll(as => as.map(a => a.getAttribute('href')));
  await page.goto('/' + pol[0]); await page.locator('#im-s').waitFor();
  await page.locator('#im-s').selectOption('in progress');
  await page.locator('#im-n').fill('vehicle contract signed');
  await page.locator('#im-go').click(); await expect(toast(page)).toContainText('Status saved');
  await expect(page.locator('#im-s')).toHaveValue('in progress'); await expect(page.locator('#im-n')).toHaveValue('vehicle contract signed');
  await page.locator('a.btn', { hasText: 'Next →' }).click(); await expect(page).toHaveURL(/\/p\//);
  await page.locator('a.btn', { hasText: '← Previous' }).click(); await expect(page).toHaveURL(/\/p\//);
  const qs = page.locator('#iq .q');
  if (await qs.count()) { await qs.first().locator('.opts button').first().click(); await expect(toast(page)).toContainText('Answer saved'); }
  await page.locator('a.btn', { hasText: '← Back to the merge' }).click(); await expect(page).toHaveURL(/#\/m\/M5$/);
  await page.goto('/#/m/M5/p/G5/nonexistent'); await expect(app(page)).toContainText('no longer in the plan');
  await page.locator('a.btn', { hasText: 'Back to the merge' }).click(); await expect(page).toHaveURL(/#\/m\/M5$/);
});

test('survey: empty submit warns; values, answers, statuses and notes update the plan', async ({ page }) => {
  await go(page, 'm/M5/survey'); await page.locator('#sv-go').waitFor();
  await page.locator('#sv-go').click(); await expect(toast(page)).toContainText('Nothing filled in');
  await page.locator('#sv-agent').fill('BEO Test'); await page.locator('#sv-date').fill('2026-09-30');
  const sec = page.locator('.svsec').first();
  await sec.locator('input[data-f="walk_km"]').fill('0.8'); await sec.locator('input[data-f="walk_min"]').fill('15');
  const sq = sec.locator('.sq').first(); await sq.locator('.opts button').first().click();
  await sq.locator('.opts button').first().click();            // second click un-toggles
  await sq.locator('.opts button').nth(1).click();
  await sec.locator('.nt').fill('Children are afraid of the nallah.'); await sec.locator('.nrole').fill('Grandmother');
  await page.locator('#sv-go').click();
  await expect(toast(page)).toBeVisible();
  await go(page, 'm/M5/feedback'); await expect(app(page)).toContainText('afraid of the nallah');
  await go(page, 'surveys'); await expect(app(page)).toContainText('Open form');
  await page.locator('a.lcard').first().click(); await expect(page).toHaveURL(/survey$/);
});

test('surveys list and problems filters', async ({ page }) => {
  await go(page, 'surveys');
  const n = await page.locator('a.lcard').count(); expect(n).toBe(5);
  await go(page, 'problems');
  for (const [k, label] of [['high', 'High'], ['medium', 'Medium'], ['low', 'Low'], ['all', 'All']]) {
    await page.locator(`.filters button[data-f="${k}"]`).click();
    await expect(page.locator(`.filters button[data-f="${k}"]`)).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.filters button[aria-pressed="true"]')).toContainText(label);
    if (k !== 'all') for (const sv of await page.locator('.prob .sv').evaluateAll(e => e.map(x => x.className))) expect(sv).toContain(k);
  }
  const link = page.locator('.prob a').first(); const h = await link.getAttribute('href');
  await link.click(); await expect(page).toHaveURL(new RegExp(h.replace(/[/#]/g, '.')));
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
  await expect(page.locator('a', { hasText: '+ Log feedback' })).toHaveCount(0);
});

test('rules: edit, undo, save re-checks every merge', async ({ page }) => {
  await go(page, 'rules'); await page.locator('.rl').first().waitFor();
  expect(await page.locator('.rl').count()).toBe(14);
  await expect(page.locator('#rl-go')).toBeDisabled(); await expect(page.locator('#rl-undo')).toBeDisabled();
  const inp = page.locator('.rl input').first(); const orig = await inp.inputValue();
  await inp.fill(String(+orig + 1));
  await expect(page.locator('.rl.changed')).toHaveCount(1); await expect(page.locator('#rl-n')).toHaveText('1 rule changed.'); await expect(page.locator('#rl-go')).toBeEnabled();
  await page.locator('#rl-undo').click(); await expect(page.locator('.rl input').first()).toHaveValue(orig); await expect(page.locator('#rl-n')).toHaveText('No changes.');
  // change the merge radius and the verdicts move
  const problemsBefore = await page.locator('#b-p').innerText();
  await page.locator('.rl[data-id="R4"] input').fill('5'); await page.locator('.rl[data-id="R2"] input').fill('20'); await page.locator('.rl[data-id="R1"] input').fill('200');
  await expect(page.locator('#rl-n')).toHaveText('3 rules changed.');
  await page.locator('#rl-go').click(); await expect(toast(page)).toContainText('rules updated');
  await expect(page.locator('.rl[data-id="R4"] input')).toHaveValue('5');
  await page.screenshot({ path: SHOT + 'rules-changed.png' });
  void problemsBefore;
});

test('SQLite console: samples, tables, Ctrl+Enter, errors, write re-runs analysis', async ({ page }) => {
  await go(page, 'sql'); await page.locator('#sql').waitFor();
  await expect(page.locator('#sqlres table')).toBeVisible();
  const samples = page.locator('.samples button'); const ns = await samples.count(); expect(ns).toBe(8);
  for (let i = 0; i < ns - 1; i++) { await samples.nth(i).click(); await expect(page.locator('#sqlres')).not.toContainText('Running'); await expect(page.locator('#sqlres .err')).toHaveCount(0); }
  const tables = page.locator('.tlist button'); expect(await tables.count()).toBeGreaterThan(20);
  await tables.first().click(); await expect(page.locator('#sql')).toHaveValue(/SELECT \* FROM/);
  await page.locator('#sql').fill('SELECT 41 + 1 AS answer;'); await page.locator('#sql').press('Control+Enter');
  await expect(page.locator('#sqlres')).toContainText('42');
  await page.locator('#sql').fill('SELEKT nonsense'); await page.locator('#runsql').click();
  await expect(page.locator('#sqlres .err')).toBeVisible();
  const hazardsBefore = await page.evaluate(() => window.__pathshala.q('SELECT count(*) AS n FROM hazards')[0].n);
  await samples.nth(7).click();                                  // "Add a hazard (write)"
  await expect(toast(page)).toContainText('SQL write applied');
  await expect(page.locator('#sqlres')).toContainText('rows changed');
  expect(await page.evaluate(() => window.__pathshala.q('SELECT count(*) AS n FROM hazards')[0].n)).toBe(hazardsBefore + 1);
  await page.locator('#sql').fill('SELECT count(*) AS n FROM hazards;'); await page.locator('#runsql').click();
  await expect(page.locator('#sqlres')).toContainText(String(hazardsBefore + 1));
  await page.screenshot({ path: SHOT + 'sql.png' });
});

test('new merge planner: receiver picker, ticks, summary, create, delete', async ({ page }) => {
  await go(page, 'new'); await page.locator('#pl-r').waitFor();
  const opts = await page.locator('#pl-r option').count(); expect(opts).toBeGreaterThan(5);
  await page.locator('#pl-r').selectOption({ index: 1 }); await expect(page).toHaveURL(/#\/new\/\w+/);
  await page.locator('#pl-r option', { hasText: 'GPS Gushaini' }).evaluate(o => { o.parentElement.value = o.value; o.parentElement.dispatchEvent(new Event('change')); });
  await expect(page.locator('#pl-go')).toBeDisabled(); await expect(page.locator('#pl-sum')).toContainText('0 schools');
  const cand = page.locator('.cand').first(); await cand.locator('input').check();
  await expect(cand).toHaveClass(/on/); await expect(page.locator('#pl-sum')).toContainText('1 school'); await expect(page.locator('#pl-go')).toBeEnabled();
  await page.locator('.cand').nth(1).locator('input').check(); await expect(page.locator('#pl-sum')).toContainText('2 schools');
  await page.locator('.cand').nth(1).locator('input').uncheck(); await expect(page.locator('#pl-sum')).toContainText('1 school');
  await page.screenshot({ path: SHOT + 'planner.png', fullPage: true });
  await page.locator('#pl-go').click(); await expect(toast(page)).toContainText('Created M6');
  await expect(page).toHaveURL(/#\/m\/M6$/); await expect(app(page)).toContainText('GPS Gushaini');
  await expect(page.locator('#delm')).toBeVisible();
  await page.locator('#delm').click(); await expect(page.locator('#delm')).toHaveText('Click again to delete');
  await page.locator('#delm').click(); await expect(page).toHaveURL(/#\/$/);
  await go(page, 'merges'); expect(await page.locator('.rcv').count()).toBe(5);
});

test('school page and inbox deep link', async ({ page }) => {
  await go(page, 'm/M5'); await page.locator('.slist a.recvrow').click();
  await expect(page.locator('h1')).toContainText('GPS Bhumteer');
  await page.locator('#app a[href^="#/m/"]').first().click(); await expect(page).toHaveURL(/#\/m\/M5/);
  await go(page, 'inbox/G5'); await expect(page.locator('#fb-g')).toHaveValue('G5');
  await go(page, 's/NOPE'); await expect(page).toHaveURL(/#\/$/);
});

test('access page: Data unavailable rows, profile chart, transport table', async ({ page }) => {
  await page.locator('#cpanel .srow', { hasText: 'GPS Pekhri-2' }).click();
  await page.locator('#cpanel tr[data-b]', { hasText: 'Gushaini' }).click();
  await page.locator('#cp-go').click();
  await go(page, 'case/C1/access'); await expect(app(page)).toContainText('Data unavailable');
  await expect(page.locator('#cmain svg').first()).toBeVisible();
  await expect(app(page)).toContainText('Tobler');
  await page.screenshot({ path: SHOT + 'access.png', fullPage: true });
});

test('unknown routes fall back to the case map', async ({ page }) => {
  for (const h of ['nope', 'case/ZZ/compare', 'case']) { await go(page, h); await expect(page).toHaveURL(/#\/$/); }
});
