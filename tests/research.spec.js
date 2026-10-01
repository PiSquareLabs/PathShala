import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => { await page.goto('/'); await page.waitForSelector('#hmap'); });
const NUM = /\d[\d,]*(?:\.\d+)?/g;

/* The fixed test: the Pekhri-2 case with Gushaini and Nagini. */
const setup = page => page.evaluate(() => window.__pathshala.createCase('PK2', ['GSH', 'NGN']));
const runAll = (page, inv) => page.evaluate(async inv => {
  const P = window.__pathshala, out = {};
  for (const a of ['transportPlanner', 'feedbackChecker']) out[a] = await P.runResearch(a, inv + '-GSH');
  out.suggestion = await P.runSuggestion(inv); return out;
}, inv);

test.describe('RAG', () => {
  test('five collections, tagged with source, date, place and wording', async ({ page }) => {
    const r = await page.evaluate(async () => {
      const P = window.__pathshala, out = {};
      for (const [c, query] of [['policy', 'transport escort'], ['feedback', 'bus'], ['reports', 'footbridge Tirthan river'], ['past', 'high court merger'], ['case', 'transport']]) {
        const s = await P.ragSearch({ collections: [c], query, cid: c === 'case' ? 'C1-GSH' : undefined, places: ['India', 'Himachal Pradesh', 'Tirthan valley', 'Pekhri', 'Jawal', 'Baridropa', 'Banjar', 'Kullu'] });
        out[c] = s.passages.map(p => ({ id: p.id, source: !!p.source, wording: p.wording, place: !!p.place, label: p.label, score: p.score }));
      }
      return out;
    });
    for (const c of ['policy', 'feedback', 'reports', 'past']) { expect(r[c].length, c).toBeGreaterThan(0); r[c].forEach(p => { expect(p.source).toBe(true); expect(['exact wording', 'summary']).toContain(p.wording); expect(p.place).toBe(true); }); }
    r.reports.forEach(p => expect(p.label).toBe('Web source, needs verification'));
    expect(r.policy.length).toBeLessThanOrEqual(5);
  });
  test('the right policy passages are in the top 3, and nothing matching says "No source found"', async ({ page }) => {
    const r = await page.evaluate(async () => {
      const P = window.__pathshala, pl = ['India', 'Himachal Pradesh'];
      const a = await P.ragSearch({ collections: ['policy'], query: 'transport escort facility distance terrain habitation seasonal walking', places: pl });
      const b = await P.ragSearch({ collections: ['policy'], query: 'walking distance primary', places: pl });
      const c = await P.ragSearch({ collections: ['policy'], query: 'zzzz qqqq nothing', places: pl });
      const d = await P.ragSearch({ collections: ['policy'], query: 'transport escort', places: ['Kerala'] });
      return { a: a.passages.slice(0, 3).map(p => p.id), b: b.passages[0].id, c: c.none && c.text, d: d.none };
    });
    expect(r.a).toEqual(expect.arrayContaining(['C3', 'C6'])); expect(r.b).toBe('C1'); expect(r.c).toBe('No source found'); expect(r.d).toBe(true);   // the place filter removes everything
  });
  test('Transport Planner finds C6 in its top 3 policy passages', async ({ page }) => {
    const inv = await setup(page);
    const top = await page.evaluate(async inv => { const P = window.__pathshala; await P.runResearch('transportPlanner', inv + '-GSH'); const s = P.q("SELECT passages FROM research_steps WHERE case_id = ? AND agent = 'transportPlanner' AND tool = 'rag_search'", [inv + '-GSH'])[0]; return JSON.parse(s.passages).slice(0, 3).map(p => p.id); }, inv);
    expect(top).toContain('C6');
  });
});

test.describe('agent loop', () => {
  test('at most 12 steps; every step has a tool, a reason, input and output; evidence has a source and a status', async ({ page }) => {
    const inv = await setup(page); await runAll(page, inv);
    const r = await page.evaluate(inv => { const P = window.__pathshala, q = P.q; return { runs: q("SELECT agent, case_id, mode FROM research_runs"), steps: q('SELECT case_id, agent, count(*) n, min(length(tool)) t, min(length(reason)) r, min(length(input)) i, min(length(output)) o FROM research_steps GROUP BY 1,2'), ev: q('SELECT DISTINCT status s FROM research_evidence').map(x => x.s), nosrc: q("SELECT count(*) n FROM research_evidence WHERE source = '' OR source IS NULL")[0].n }; }, inv);
    expect(r.runs.length).toBe(3); r.runs.forEach(x => expect(x.mode).toBe('Simulated'));
    r.steps.forEach(s => { expect(s.n).toBeLessThanOrEqual(12); expect(s.t).toBeGreaterThan(0); expect(s.r).toBeGreaterThan(0); expect(s.i).toBeGreaterThan(0); expect(s.o).toBeGreaterThan(0); });
    r.ev.forEach(s => expect(['reported', 'verified', 'calculated', 'needs verification']).toContain(s)); expect(r.nosrc).toBe(0);
  });
  test('every sentence has a valid citation and no number a tool did not produce', async ({ page }) => {
    const inv = await setup(page); const out = await runAll(page, inv);
    const r = await page.evaluate(({ inv, out }) => {
      const q = window.__pathshala.q, res = [];
      for (const [agent, cid] of [['transportPlanner', inv + '-GSH'], ['feedbackChecker', inv + '-GSH'], ['suggestion', inv]]) {
        const ok = new Set(q('SELECT eid FROM research_evidence WHERE case_id = ? AND agent = ?', [cid, agent]).map(x => x.eid));
        q('SELECT passages FROM research_steps WHERE case_id = ? AND agent = ? AND passages IS NOT NULL', [cid, agent]).forEach(s => JSON.parse(s.passages).forEach(p => ok.add(p.id)));
        const nums = new Set(q('SELECT output FROM research_steps WHERE case_id = ? AND agent = ?', [cid, agent]).flatMap(s => (s.output.match(/\d[\d,]*(?:\.\d+)?/g) || []).map(n => n.replace(/,/g, ''))));
        ['Pekhri-2', 'Gushaini', 'Nagini'].forEach(n => (n.match(/\d+/g) || []).forEach(d => nums.add(d)));
        for (const s of out[agent].sentences) res.push({ agent, text: s.text, refsOk: s.refs.length > 0 && s.refs.every(x => ok.has(x)), bad: (s.text.replace(/\[[^\]]*\]/g, ' ').match(/\d[\d,]*(?:\.\d+)?/g) || []).map(n => n.replace(/,/g, '')).filter(n => !nums.has(n)) });
      }
      return res;
    }, { inv, out });
    expect(r.length).toBeGreaterThan(10);
    r.forEach(s => { expect(s.refsOk, s.text).toBe(true); expect(s.bad, s.text).toEqual([]); });
  });
  test('the same inputs give the same findings in simulated mode', async ({ page }) => {
    const inv = await setup(page);
    const [a, b] = await page.evaluate(async inv => { const P = window.__pathshala, once = async () => { const o = { t: await P.runResearch('transportPlanner', inv + '-GSH'), f: await P.runResearch('feedbackChecker', inv + '-GSH'), s: await P.runSuggestion(inv) }; return JSON.stringify(o) + JSON.stringify(P.q('SELECT tool, input, output FROM research_steps ORDER BY case_id, agent, seq')); }; return [await once(), await once()]; }, inv);
    expect(a).toBe(b); expect(a.length).toBeGreaterThan(1000);
  });
  test('nothing in the case changes before the officer approves', async ({ page }) => {
    const inv = await setup(page);
    const snap = () => page.evaluate(inv => { const q = window.__pathshala.q, t = ['findings', 'evidence', 'field_questions', 'interventions', 'reports', 'concerns_x'].filter(x => x !== 'concerns_x'); return JSON.stringify([...t.map(x => q(`SELECT * FROM ${x} ORDER BY 1, 2`)), q('SELECT * FROM investigations'), q('SELECT * FROM cases')]); }, inv);
    const before = await snap(); await runAll(page, inv); const after = await snap();
    expect(after).toBe(before);
    // web results are stored only in research_evidence, never in the case evidence
    expect(await page.evaluate(() => window.__pathshala.q("SELECT count(*) n FROM evidence WHERE label LIKE '%Public report%' OR label LIKE '%Web source%'")[0].n)).toBe(0);
    // the checker's questions and the suggestion enter the case only through an officer action
    const acts = await page.evaluate(async inv => { const P = window.__pathshala, q = P.q; const n0 = q('SELECT count(*) n FROM field_questions')[0].n; P.acceptSuggestion(inv); const chosen = q('SELECT chosen_id FROM investigations')[0].chosen_id;
      const out = q("SELECT out FROM research_runs WHERE agent = 'feedbackChecker'")[0].out; P.addFieldQuestions(inv + '-GSH', JSON.parse(out).open_questions); return { n0, n1: q('SELECT count(*) n FROM field_questions')[0].n, chosen }; }, inv);
    expect(acts.chosen).toBeNull(); expect(acts.n1).toBeGreaterThan(acts.n0);
  });
  test('no tool can help: Data unavailable and a field question', async ({ page }) => {
    const r = await page.evaluate(async () => { const P = window.__pathshala; P.sqlRun("DELETE FROM habitations WHERE school_id = 'JYN'"); const inv = P.createCase('JYN', ['BUA']); const o = await P.runResearch('transportPlanner', inv + '-BUA'); return { o, ev: P.q("SELECT label, status FROM research_evidence WHERE case_id = ?", [inv + '-BUA']) }; });
    expect(r.o.stop_reason).toMatch(/No tool can help/); expect(r.o.open_questions.length).toBeGreaterThan(0); expect(r.ev.some(e => /Data unavailable/.test(e.label) && e.status === 'needs verification')).toBe(true);
  });
  test('the checker marks claims supported, contradicted or unchecked with sources; web alone never supports a claim', async ({ page }) => {
    const inv = await setup(page); const o = (await runAll(page, inv)).feedbackChecker;
    expect(new Set(o.claims.map(c => c.status))).toEqual(new Set(['supported', 'contradicted', 'unchecked'])); expect(o.counts.total).toBe(o.claims.length);
    o.claims.filter(c => c.status !== 'unchecked').forEach(c => expect(c.sources.length, c.text).toBeGreaterThan(0));
    o.claims.filter(c => c.status === 'unchecked').forEach(c => expect(c.sources.some(s => /Public report|W\d/.test(s.ref))).toBe(false));
    expect(o.open_questions.length).toBeGreaterThan(0); expect(o.web.every(w => w.label === 'Web source, needs verification')).toBe(true);
  });
  test('the suggestion is a suggestion: it selects nothing and records both choices when they differ', async ({ page }) => {
    const inv = await setup(page);
    const r = await page.evaluate(async inv => { const P = window.__pathshala, q = P.q; const sg = await P.runSuggestion(inv); const before = q('SELECT chosen_id FROM investigations')[0].chosen_id;
      const other = ['GSH', 'NGN'].find(x => x !== sg.suggested) || 'GSH'; P.chooseFinal(inv, other); const row = P.suggestionRow(inv); return { sg: sg.suggested, before, other, row: { s: row.suggested, o: row.officer_choice }, log: q("SELECT action FROM case_log WHERE case_id = ? AND action LIKE '%differs%'", [inv]).length }; }, inv);
    expect(r.before).toBeNull(); expect(r.row.s).toBe(r.sg); expect(r.row.o).toBe(r.other); if (r.sg !== r.other) expect(r.log).toBe(1);
  });
});

test.describe('UI', () => {
  const go = (page, h) => page.evaluate(h => { location.hash = '#/' + h; }, h);
  test('Transport Planner on Evidence: steps, passages with scores and sources, mode, approval', async ({ page }) => {
    const inv = await setup(page); await go(page, `case/${inv}/evidence`); await page.locator('.opttabs button', { hasText: 'Gushaini' }).click();
    const p = page.locator('#rs-transportPlanner'); await expect(p).toContainText('Transport Planner'); await expect(p).toContainText('Simulated');
    await p.locator('[data-run]').click(); await expect(p.locator('.rstep')).toHaveCount(7, { timeout: 30000 });
    await expect(p.locator('.rstep').first()).toContainText('habitations_and_children');
    const search = p.locator('.rstep', { hasText: 'rag_search' }); await search.locator('summary').click(); await expect(search).toContainText('score'); await expect(search).toContainText('exact wording');
    await expect(search.locator('.pass').first()).toBeVisible(); await expect(p).toContainText('Data unavailable');
    await expect(p.locator('.rsent li').first()).toContainText('children'); await expect(p.locator('.cite').first()).toBeVisible();
    await p.scrollIntoViewIfNeeded(); await page.screenshot({ path: 'docs/screens/16-transport-planner.png', fullPage: true });
    await p.locator('[data-addq]').click();   // the questions enter the case only now
  });
  test('Feedback Checker on Feedback: claims by status, questions added on approval', async ({ page }) => {
    const inv = await setup(page); await go(page, `case/${inv}/feedback`); await page.locator('.opttabs button', { hasText: 'Gushaini' }).click();
    const p = page.locator('#rs-feedbackChecker'); await p.locator('[data-run]').click(); await expect(p.locator('.rstep')).toHaveCount(10, { timeout: 30000 });
    await expect(p.locator('.ccount')).toContainText('contradicted'); await p.locator('#rs-c-contradicted > summary').click(); await expect(p.locator('#rs-c-contradicted .claim').first()).toBeVisible();
    await expect(p).toContainText('Web source, needs verification');
    await p.locator('.rstep', { hasText: 'web_search' }).locator('summary').click(); await expect(p.locator('.rstep', { hasText: 'web_search' }).locator('.pill.s-red').first()).toContainText('Web source, needs verification');
    const n0 = await page.evaluate(inv => window.__pathshala.q('SELECT count(*) n FROM field_questions WHERE case_id = ?', [inv + '-GSH'])[0].n, inv); expect(n0).toBe(0);
    await p.locator('[data-addq]').click(); const n1 = await page.evaluate(inv => window.__pathshala.q('SELECT count(*) n FROM field_questions WHERE case_id = ?', [inv + '-GSH'])[0].n, inv); expect(n1).toBeGreaterThan(0);
    await page.screenshot({ path: 'docs/screens/17-feedback-checker.png', fullPage: true });
  });
  test('AI suggestion on Report: labelled, cited, accept pre-fills but does not choose', async ({ page }) => {
    const inv = await setup(page); await go(page, `case/${inv}/report`);
    const p = page.locator('#rs-suggestion'); await expect(p).toContainText('Suggestion. The officer decides.'); await p.locator('[data-runsg]').click(); await expect(p.locator('.sgbox')).toBeVisible({ timeout: 30000 });
    await expect(p.locator('.rstep')).toHaveCount(4); await expect(p.locator('.sgbox .cite').first()).toBeVisible();
    await p.locator('#sg-wc > summary').click(); await expect(p.locator('#sg-wc')).toContainText('would change');
    await p.locator('[data-sg="accept"]').click(); await expect(page.locator('#rs-suggestion')).toContainText('Accepted as a starting point');
    expect(await page.evaluate(() => window.__pathshala.q('SELECT chosen_id FROM investigations')[0].chosen_id)).toBeNull();
    await expect(page.locator('#opt-table [data-final]').first()).toBeVisible(); await page.screenshot({ path: 'docs/screens/18-ai-suggestion.png', fullPage: true });
    await page.locator('#opt-table [data-final]').first().click(); await expect(page.locator('#opt-table th.chosen')).toHaveCount(1);
  });
});
