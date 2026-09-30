import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => { await page.goto('/'); await page.waitForSelector('#hmap'); });
const cont = page => page.locator('#fc-now').click();

test('Full control drives the ordinary screens: one closing school in, AI research, field form (waits), policies, final report', async ({ page }) => {
  test.setTimeout(400000);
  await expect(page.locator('#nav a', { hasText: 'Full control' })).toHaveCount(0);      // a mode of the home page, not a tab
  await page.locator('#mode-full').click(); await expect(page.locator('#demo-school')).toContainText('GPS Kasta'); await page.locator('#cpanel [data-s="PK2"]').click();
  await expect(page.locator('#cpanel')).toContainText('Start Full control'); await expect(page.locator('#cpanel')).toContainText('GPS Gushaini'); await page.locator('#cp-full').click();
  // Compare: the AI already chose the candidates
  await expect(page).toHaveURL(/case\/C\d+\/compare/); await expect(page.locator('#fc-banner')).toContainText('picked the candidate schools'); await expect(page.locator('.cmptbl')).toBeVisible();
  const cands = await page.locator('.cmptbl thead th b').count(); expect(cands).toBe(3);
  await expect(page.locator('#fc-count')).toContainText('Moving on in'); await expect(page.locator('#fc-now')).toHaveText('Next: Feedback →'); await expect(page.locator('.fcsay')).toContainText('You do not need to click Next');
  await page.locator('#fc-pause').click(); await expect(page.locator('#fc-count')).toHaveText('Paused'); await page.locator('#fc-pause').click();
  // Feedback: the AI classifies, summarises and checks claims, then the real Feedback screen appears
  await cont(page); await expect(page).toHaveURL(/feedback/); await expect(page.locator('#fbsum, #rs-feedbackChecker').first()).toBeVisible({ timeout: 120000 });
  await expect(page.locator('#rs-feedbackChecker .rstep').first()).toBeVisible(); await expect(page.locator('#fc-banner')).toContainText('checked it against the records');
  // Evidence: the Transport Planner has run
  await cont(page); await expect(page).toHaveURL(/evidence/); await expect(page.locator('#rs-transportPlanner .rstep')).toHaveCount(8, { timeout: 120000 }); await expect(page.locator('#rs-transportPlanner .rplain').first()).toContainText(/villages|geography|road route/); await expect(page.locator('#rs-transportPlanner')).toContainText('Studying the geography around both schools');
  // Investigate: research of every school, the field form is generated, and the flow waits
  await cont(page); await expect(page).toHaveURL(/investigate/); await expect(page.locator('#fc-form')).toBeVisible({ timeout: 180000 });
  await expect(page.locator('#fc-banner')).toContainText('waiting for the field officer'); await expect(page.locator('#fc-now')).toHaveCount(0);   // no auto-advance while waiting
  const st1 = await page.evaluate(() => { const q = window.__pathshala.q; return { stage: q('SELECT stage FROM full_runs')[0].stage, tracks: q('SELECT count(*) n FROM cases')[0].n, found: q('SELECT count(DISTINCT case_id) n FROM findings')[0].n, sel: q('SELECT count(*) n FROM interventions WHERE selected = 1')[0].n, chosen: q('SELECT chosen_id FROM investigations')[0].chosen_id }; });
  expect(st1.stage).toBe('field'); expect(st1.found).toBe(st1.tracks); expect(st1.sel).toBe(0); expect(st1.chosen).toBeNull();
  expect(await page.locator('.fcsec').count()).toBe(st1.tracks); await expect(page.locator('#fc-print')).toBeVisible(); await expect(page.locator('.fcprint')).toContainText('Officer:');
  // policy and report cannot run ahead of the form
  await page.locator('.steps a', { hasText: 'Policy' }).click(); await expect(page.locator('#fc-banner')).toContainText('Waiting for the field form');
  expect(await page.evaluate(() => window.__pathshala.q('SELECT count(*) n FROM interventions WHERE selected = 1')[0].n)).toBe(0);
  await page.locator('.steps a', { hasText: 'Investigate' }).click(); await expect(page.locator('#fc-form')).toBeVisible();
  await page.screenshot({ path: 'docs/screens/19-full-field-form.png', fullPage: true });
  await page.locator('#fc-submit').click(); await expect(page.locator('#toast')).toContainText('Answer at least one question');
  for (const sec of await page.locator('.fcsec').all()) {
    await sec.locator('.fq[data-q="Q1"] .opts button[data-v="No"]').click(); await sec.locator('.fq[data-q="Q2"] .fv').fill('20');
    await sec.locator('.fq[data-q="Q3"] .opts button[data-v="No"]').click();
    expect(await sec.locator('.fq').count()).toBeLessThanOrEqual(4);          // a short form: at most four questions per school
  }
  await page.locator('#fc-submit').click();
  // after the answers: evidence updated, then Policy and cost with the best policies selected
  await expect(page.locator('#fc-banner')).toContainText('field answers are recorded', { timeout: 120000 });
  await cont(page); await expect(page).toHaveURL(/policy/); await expect(page.locator('#fc-banner')).toContainText('chose the policies', { timeout: 120000 });
  await expect(page.locator('.ivsel input:checked').first()).toBeVisible(); await expect(page.locator('#fc-pick')).toContainText('AI picked the best policies'); expect(await page.locator('.aiwhy').count()).toBeGreaterThan(1); await expect(page.locator('.aiwhy').first()).toContainText(/The AI (chose|did not choose) this/);
  const st2 = await page.evaluate(() => { const q = window.__pathshala.q; return { sel: q('SELECT count(*) n FROM interventions WHERE selected = 1')[0].n, auto: q("SELECT count(*) n FROM auto_choices WHERE code != '_mode' AND reason NOT LIKE 'not:%'")[0].n, chosen: q('SELECT chosen_id FROM investigations')[0].chosen_id }; });
  expect(st2.sel).toBe(st2.auto); expect(st2.chosen).toBeNull();
  await page.locator('.ivsel input:checked').first().uncheck(); await expect(page.locator('#fc-pick-note')).toContainText('You changed'); await expect(page.locator('#fc-count')).toHaveText('Paused'); await page.locator('#fc-pause').click();
  await cont(page); await expect(page).toHaveURL(/report/); await expect(page.locator('.fcrec')).toBeVisible({ timeout: 180000 });
  await expect(page.locator('.fcrec .eyebrow')).toContainText('a suggestion, the officer decides'); await expect(page.locator('.fcrec')).not.toContainText(/out of 100|scores \d+/);   // reasons in words, not a ranking
  await expect(page.locator('#fc-compare')).not.toContainText('Rank');
  await expect(page.locator('#fc-compare thead th')).toHaveCount(4); await expect(page.locator('#fc-compare')).toContainText('Confirmed concerns');
  expect(await page.locator('.fcwhycard').count()).toBeGreaterThan(0); await expect(page.locator('#fc-budget')).toContainText('Three-year total'); await expect(page.locator('#fc-budget-notes')).toContainText('For each school the AI picked only the policies'); await expect(page.locator('#fc-report')).toContainText('Budget compared across schools');
  expect(await page.locator('#fc-report h3').count()).toBeGreaterThanOrEqual(5); await expect(page.locator('#fc-report')).toContainText('Still to be confirmed');
  await expect(page.locator('#opt-table')).toBeVisible();      // the ordinary Report step is still there for the officer's decision
  const st3 = await page.evaluate(() => { const q = window.__pathshala.q; return { stage: q('SELECT stage FROM full_runs')[0].stage, chosen: q('SELECT chosen_id FROM investigations')[0].chosen_id, status: q('SELECT status FROM investigations')[0].status }; });
  expect(st3.stage).toBe('final'); expect(st3.chosen).toBeNull(); expect(st3.status).not.toMatch(/^Ready/);
  await page.screenshot({ path: 'docs/screens/20-full-final.png', fullPage: true });
  const dl = page.waitForEvent('download'); await page.locator('#fc-dl').click(); expect((await dl).suggestedFilename()).toMatch(/report\.txt$/);
  await page.locator('#fc-adopt').click(); await expect(page.locator('#toast')).toContainText(/adopted/i);
  // Visiting earlier screens later does not auto-advance any more
  await page.locator('.steps a', { hasText: 'Compare' }).click(); await expect(page.locator('#fc-now')).toHaveCount(0);
});

test('Full control: research agents all complete for every school (no failed step)', async ({ page }) => {
  test.setTimeout(400000);
  const r = await page.evaluate(async () => {
    const P = window.__pathshala, bad = [];
    for (const s of P.q('SELECT school_id FROM schools').map(x => x.school_id)) {
      const near = await P.tools.nearby_schools({ school_id: s }); if (!near.length) continue;
      const inv = P.createCase(s, near.slice(0, 1).map(x => x.school_id)), cid = P.q('SELECT case_id FROM cases WHERE inv_id = ?', [inv])[0].case_id;
      for (const a of ['transportPlanner', 'feedbackChecker']) { try { const o = await P.runResearch(a, cid); if (/failed/i.test(o.stop_reason || '')) bad.push([cid, a, o.stop_reason]); } catch (e) { bad.push([cid, a, e.message]); } }
    }
    return bad;
  });
  expect(r).toEqual([]);
});

test('Full control: start page lists the schools and their candidates', async ({ page }) => {
  await page.evaluate(() => { location.hash = '#/full'; }); await expect(page.locator('#mode-full')).toHaveAttribute('aria-pressed', 'true'); await page.locator('#cpanel [data-s]').first().click(); await expect(page.locator('#cp-full')).toBeVisible(); await page.locator('#srcs summary').click(); await expect(page.locator('#srcs')).toContainText('UDISE');
});

test('Field questions differ by school: they come from each school\'s own terrain', async ({ page }) => {
  test.setTimeout(300000);
  const r = await page.evaluate(async () => {
    const P = window.__pathshala, out = {};
    for (const s of ['PK2', 'JYN', 'BHM', 'SDY', 'PHL']) {
      const near = await P.tools.nearby_schools({ school_id: s }); if (!near.length) continue;
      const inv = P.createCase(s, [near[0].school_id]), cid = P.q('SELECT case_id FROM cases WHERE inv_id = ?', [inv])[0].case_id;
      const o = await P.runResearch('transportPlanner', cid); out[s] = { qs: o.open_questions.map(x => x.text), steps: P.q("SELECT tool FROM research_steps WHERE case_id = ? AND agent = 'transportPlanner'", [cid]).map(x => x.tool) };
    }
    const rag = await P.tools.rag_search({ collections: 'policy', query: 'transport', places: 'Himachal Pradesh', k: 2 });   // a model may send strings instead of lists
    return { out, ragOk: Array.isArray(rag.passages) };
  });
  expect(r.ragOk).toBe(true);
  const sets = Object.values(r.out).map(x => JSON.stringify(x.qs.filter(t => !/bus or shared|pickup stops|Survey the road/.test(t))));
  expect(new Set(sets).size).toBe(sets.length);            // no two schools get the same terrain questions
  for (const v of Object.values(r.out)) { expect(v.steps).toContain('terrain_profile'); expect(v.qs.length).toBeGreaterThan(2); }
  expect(r.out.JYN.qs.join(' ')).toContain('Slope failures after long rain'); expect(r.out.BHM.qs.join(' ')).toContain('Ankle to knee deep'); expect(r.out.SDY.qs.join(' ')).toContain('Stream runs high');
});

test('Full control: GPS Kasta is pinned on the home page in every district and has three candidates', async ({ page }) => {
  await page.locator('#mode-full').click();
  for (const d of ['Kangra', 'Bilaspur', 'All']) { await page.locator(`.maplegend [data-d="${d}"]`).click(); await page.locator('#mode-full').click(); await expect(page.locator('#demo-school')).toBeVisible(); }
  await page.locator('#demo-school').click(); await expect(page.locator('#cpanel')).toContainText('GPS Dobhi'); await expect(page.locator('#cpanel')).toContainText('GPS Kukari'); await expect(page.locator('#cpanel')).toContainText('GPS Soyal'); await expect(page.locator('#cp-full')).toBeEnabled();
});
