// Loads every page of the app and fails on any error card, SQL error, console error or "undefined"/"NaN" in the text.
import { test, expect } from '@playwright/test';
import fs from 'node:fs';

const BAD = /no such column|no such table|SQLITE_|\bundefined\b|\bNaN\b|\[object|Cannot read/;
let errors;
test.beforeEach(async ({ page }) => {
  errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/fonts\.g|ERR_CERT|ERR_NAME|ERR_CONNECTION|ERR_TUNNEL|Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
});
test.afterEach(() => { expect(errors, errors.join('\n')).toEqual([]); });

async function visit(page, hash, bad = []) {
  await page.evaluate(h => { location.hash = h; }, '#/' + hash);
  await page.waitForTimeout(250);
  if (/case\/C\d+\/(policy|report)/.test(hash)) await page.locator('.ivc, #rp-ok, .card').first().waitFor();
  const text = await page.locator('#app').innerText();
  if (await page.locator('#app .card.err').count()) bad.push(`${hash}: error card: ${(await page.locator('#app .card.err').first().innerText()).slice(0, 200)}`);
  const m = text.match(BAD); if (m) bad.push(`${hash}: page contains "${m[0]}"`);
  if (!text.trim()) bad.push(`${hash}: empty page`);
}

test('every page of a fresh app loads without errors', async ({ page }) => {
  await page.goto('/'); await page.waitForSelector('#hmap');
  const ids = await page.evaluate(() => {
    const { q } = window.__pathshala;
    return { merges: q('SELECT DISTINCT merge_id FROM merge_groups').map(x => x.merge_id), groups: q('SELECT group_id, merge_id FROM merge_groups').map(x => [x.merge_id, x.group_id]),
      items: q('SELECT p.group_id, p.code, g.merge_id FROM plan_items p JOIN merge_groups g USING (group_id)').map(x => [x.merge_id, x.group_id, x.code]), schools: q('SELECT school_id FROM schools').map(x => x.school_id) };
  });
  const bad = [];
  for (const h of ['', 'ai', 'cases', 'merges', 'inbox', 'rules', 'sql', 'new']) await visit(page, h, bad);
  for (const m of ids.merges) for (const sub of ['', '/survey', '/feedback']) await visit(page, `m/${m}${sub}`, bad);
  for (const [m, g] of ids.groups) await visit(page, `m/${m}/g/${g}`, bad);
  for (const [m, g, c] of ids.items) await visit(page, `m/${m}/p/${g}/${c}`, bad);
  for (const s of ids.schools) { await visit(page, `s/${s}`, bad); await visit(page, `new/${s}`, bad); }
  expect(bad).toEqual([]);
  console.log(`checked ${9 + ids.merges.length * 3 + ids.groups.length + ids.items.length + ids.schools.length * 2} pages`);
});

test('every case page loads, for every closing school, every receiver and the final choice', async ({ page }) => {
  test.setTimeout(600000);
  await page.goto('/'); await page.waitForSelector('#hmap');
  const senders = await page.evaluate(() => window.__pathshala.q("SELECT school_id FROM schools WHERE district = 'Kullu'").map(x => x.school_id));
  const bad = []; let n = 0;
  for (const s of senders) {
    const made = await page.evaluate(async sid => {
      const { q, createCase } = window.__pathshala;
      const near = q('SELECT school_id FROM schools WHERE school_id != ? AND level_code = (SELECT level_code FROM schools WHERE school_id = ?)', [sid, sid]).map(x => x.school_id).slice(0, 3);
      if (!near.length) return null;
      const inv = createCase(sid, near);
      return { inv, tracks: q('SELECT case_id, to_id FROM cases WHERE inv_id = ? ORDER BY seq', [inv]) };
    }, s);
    if (!made) continue;
    const inv = made.inv;
    for (const step of ['compare', 'feedback', 'evidence', 'investigate', 'policy', 'report']) { await visit(page, `case/${inv}/${step}`, bad); n++; }     // before any results
    for (const t of made.tracks) await page.evaluate(async id => { await window.__pathshala.runInvestigation(id); await window.__pathshala.runPolicy(id); }, t.case_id);
    for (const t of made.tracks) {
      await page.evaluate(([i, id]) => { window.__pathshala.state.opt[i] = id; }, [inv, t.to_id]);
      for (const step of ['feedback', 'evidence', 'investigate', 'policy']) { await visit(page, `case/${inv}/${step}`, bad); n++; }
    }
    for (const t of made.tracks) {                                                                                                            // every option can be the final choice
      await page.evaluate(([i, id]) => window.__pathshala.chooseFinal(i, id), [inv, t.to_id]);
      await visit(page, `case/${inv}/report`, bad); n++;
      await page.locator('#rp-ok, .card').first().waitFor();
    }
    await visit(page, `case/${inv}/compare`, bad); n++;
  }
  expect(bad).toEqual([]);
  expect(n).toBeGreaterThan(40);
});

test('a database saved by an older build is discarded, not loaded', async ({ page }) => {
  const old = fs.readFileSync('tests/seed-previous-build.sql', 'utf8');
  await page.goto('/'); await page.waitForSelector('#hmap');
  const saved = await page.evaluate(sql => window.__pathshala.makeSavedDb(sql), old);
  expect(saved.length).toBeGreaterThan(1000);
  // stale copy under the current key, and another under the previous key
  await page.evaluate(b => { localStorage.setItem('pathshala.db.v7', b); localStorage.setItem('pathshala.db.v6', b); localStorage.setItem('pathshala.db.v5', b); }, saved);
  await page.reload(); await page.waitForSelector('#cpanel .srow');
  expect(await page.evaluate(() => window.__pathshala.q("SELECT name FROM pragma_table_info('citizen_feedback')").map(c => c.name))).toContain('about_id');
  expect(await page.evaluate(() => [localStorage.getItem('pathshala.db.v6'), localStorage.getItem('pathshala.db.v5')])).toEqual([null, null]);
  const bad = [];
  for (const h of ['', 'merges', 'm/M5', 'inbox', 'rules', 'sql']) await visit(page, h, bad);
  expect(bad).toEqual([]);
});

test('a current save is kept across a reload', async ({ page }) => {
  await page.goto('/'); await page.waitForSelector('#hmap');
  await page.evaluate(() => window.__pathshala.createCase('PK2', ['GSH', 'NGN']));
  await page.evaluate(() => { location.hash = '#/rules'; });
  await page.locator('.rl input').first().fill('4'); await page.locator('#rl-go').click();
  await page.reload(); await page.waitForSelector('#nav');
  expect(await page.evaluate(() => window.__pathshala.q('SELECT count(*) AS n FROM investigations')[0].n)).toBe(1);
  expect(await page.evaluate(() => window.__pathshala.q('SELECT count(*) AS n FROM cases')[0].n)).toBe(2);
  expect(await page.evaluate(() => window.__pathshala.q("SELECT param_value AS v FROM rules ORDER BY rule_id LIMIT 1")[0].v)).toBe(4);
});
