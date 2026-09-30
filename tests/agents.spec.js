import { test, expect } from '@playwright/test';
import fs from 'node:fs';

const fixture = id => JSON.parse(fs.readFileSync(`src/agent/fixtures/C1/${id}.json`, 'utf8'));
const clone = o => JSON.parse(JSON.stringify(o));

test.beforeEach(async ({ page }) => {
  await page.goto('/'); await page.waitForSelector('#hmap');
});

test.describe('retrieval (AGENTS.md 6.5)', () => {
  test('reference query returns C3 and C6 in the top 3', async ({ page }) => {
    const ids = await page.evaluate(async () => {
      const { tools } = window.__pathshala;
      const hits = await tools.policy_retrieve({ query: 'transport escort distance terrain flood bridge habitation seasonal walking Transport Seasonal access Route safety for young children Receiving-school capacity', k: 6 });
      return hits.map(h => h.chunk_id);
    });
    expect(ids.slice(0, 3)).toContain('C3'); expect(ids.slice(0, 3)).toContain('C6');
  });
  test('"walking distance primary" returns C1 first', async ({ page }) => {
    const top = await page.evaluate(async () => (await window.__pathshala.tools.policy_retrieve({ query: 'walking distance primary', k: 5 }))[0].chunk_id);
    expect(top).toBe('C1');
  });
});

test.describe('agents (simulated provider)', () => {
  test('provider config defaults to simulated', async ({ page }) => {
    expect(await page.evaluate(() => window.__pathshala.CONFIG.provider)).toBe('simulated');
  });

  test('every agent output passes schema validation and matches the C1 fixtures', async ({ page }) => {
    const { out, errors } = await page.evaluate(() => window.__pathshala.captureC1Outputs());
    expect(errors).toEqual({});
    for (const id of Object.keys(out)) expect(out[id], `${id} differs from its fixture`).toEqual(fixture(id));
    // same finding statuses and cost numbers as the reference run
    expect(out.evidenceUpdater.finding_changes).toEqual([{ fid: 'F2', status: 'Verified' }, { fid: 'F1', status: 'Confirmed concern' }]);
    const tr = out.policyResearcher.interventions.find(v => v.code === 'TR');
    expect(tr.cost).toMatchObject({ formula: '24 × ₹6,000', cost_inr: 144000, cost_type: 'per year' });
    expect(tr.cost.inputs.map(r => r[0])).toEqual(['Eligible students', 'Required route', 'Applicable rate']);   // no invented vehicle count
    expect(out.policyResearcher.interventions.find(v => v.code === 'RET').cost).toMatchObject({ formula: '3 × ₹9 lakh', cost_inr: 2700000 });
    expect(out.policyResearcher.interventions.find(v => v.code === 'SEA').title).toBe('Monsoon learning point at Pekhri (Jul–Sep)');
    expect(out.reportCritic.pass).toBe(true);
  });

  test('coordinator output cites a source on every evidence item', async () => {
    for (const f of fixture('coordinator').findings) for (const e of f.evidence) expect(e.ref.length).toBeGreaterThan(0);
  });

  test('no LLM number leaks: costs in interventions equal cost_calc output', async ({ page }) => {
    const same = await page.evaluate(async () => {
      const { out } = await window.__pathshala.captureC1Outputs();
      const { tools } = window.__pathshala;
      const iv = out.policyResearcher.interventions.find(v => v.code === 'RET');
      return JSON.stringify(iv.cost) === JSON.stringify(await tools.cost_calc({ intervention: 'RET', inputs: { classrooms: 3 } }));
    });
    expect(same).toBe(true);
  });

  test('a schema-invalid output is rejected', async ({ page }) => {
    const errs = await page.evaluate(() => {
      const { validate, schemas } = window.__pathshala;
      return [
        validate(schemas.Findings, { findings: [{ fid: 'F1', title: 'x', kind: 'primary', severity: 'high', summary: 's', status: 'Potential issue', evidence: [{ eid: 'E1', kind: 'feedback', status: 'reported', label: 'l', detail: '' }] }], gaps: [] }),
        validate(schemas.FieldQuestions, { questions: Array.from({ length: 7 }, (_, i) => ({ qid: 'Q' + i, text: 't', type: 'number', gap: 'g' })) }),
        validate(schemas.Draft, { sentences: [] }),
      ];
    });
    errs.forEach(e => expect(e).toBeTruthy());
  });
});

test.describe('guardrails (AGENTS.md 8)', () => {
  test('sql_query is read-only and limited to known tables', async ({ page }) => {
    const r = await page.evaluate(async () => {
      const { tools } = window.__pathshala, res = {};
      for (const [k, sql] of Object.entries({ ok: 'SELECT count(*) AS n FROM schools', del: 'DELETE FROM schools', multi: 'SELECT 1; DROP TABLE schools', ins: "WITH x AS (SELECT 1) INSERT INTO rules SELECT * FROM rules", tbl: 'SELECT * FROM sqlite_secret', upd: 'UPDATE schools SET name = 1' })) {
        try { res[k] = (await tools.sql_query({ sql })).rows.length; } catch (e) { res[k] = 'ERR: ' + e.message; }
      }
      return res;
    });
    expect(r.ok).toBe(1);
    for (const k of ['del', 'multi', 'ins', 'tbl', 'upd']) expect(String(r[k])).toMatch(/^ERR/);
  });

  test('critic rejects unreferenced sentences, unknown ids, invented numbers and approval language', async ({ page }) => {
    const c = await page.evaluate(async () => {
      const { captureC1Outputs, AGENTS } = window.__pathshala;
      const { cid } = await captureC1Outputs();
      const run = sentences => AGENTS.reportCritic.simulate({ cid, sentences });
      return {
        good: await run([{ text: 'Community feedback identifies transport (31 responses).', refs: ['E1'] }]),
        noref: await run([{ text: 'The route is unsafe.', refs: [] }]),
        unknown: await run([{ text: 'See evidence.', refs: ['E99'] }]),
        number: await run([{ text: 'A total of 9999 students will move.', refs: ['E4'] }]),
        approval: await run([{ text: 'The merger is approved.', refs: ['E1'] }]),
      };
    });
    expect(c.good.pass).toBe(true);
    for (const k of ['noref', 'unknown', 'number', 'approval']) expect(c[k].pass, k).toBe(false);
  });

  test('every tool has a Gemini function declaration', async ({ page }) => {
    const r = await page.evaluate(() => ({ names: window.__pathshala.toolSchemas.map(t => t.name).sort(), impl: Object.keys(window.__pathshala.tools).sort(), bad: window.__pathshala.toolSchemas.filter(t => !t.description || t.parameters.type !== 'object').length }));
    expect(r.names).toEqual(r.impl); expect(r.bad).toBe(0);
    for (const n of ['sql_query', 'school_profile', 'nearby_schools', 'route_calc', 'gis_overlay', 'transport_lookup', 'feedback_search', 'classify_feedback', 'recurring_concerns', 'field_observations', 'evidence_gaps', 'policy_retrieve', 'cost_calc', 'draft_report']) expect(r.names).toContain(n);
  });

  test('GeminiProvider is a stub against the /api/agent contract', async ({ page }) => {
    const r = await page.evaluate(async () => {
      const { GeminiProvider, AGENTS, CONFIG } = window.__pathshala, g = new GeminiProvider();
      const req = g.buildRequest(AGENTS.gapFinder, { cid: 'C1', A: { name: 'A' }, B: { name: 'B' } });
      let err = ''; try { await g.call(AGENTS.gapFinder, { cid: 'C1' }); } catch (e) { err = e.message; }
      return { keys: Object.keys(req).sort(), tools: req.tools.map(t => t.name), err, endpoint: CONFIG.endpoint };
    });
    expect(r.keys).toEqual(['agent', 'case_id', 'messages', 'response_schema', 'system', 'tools']);
    expect(r.tools).toEqual(['evidence_gaps']); expect(r.err).toMatch(/not implemented/i); expect(r.endpoint).toBe('/api/agent');
  });
});

test('Approve and Submit are officer-only: no agent tool writes case status', async ({ page }) => {
  const src = fs.readdirSync('src/agent', { recursive: true }).filter(f => f.endsWith('.js')).map(f => fs.readFileSync('src/agent/' + f, 'utf8')).join('\n');
  expect(src).not.toMatch(/Ready for administrative review|approved\s*=\s*1|UPDATE cases/);
});

test.describe('data audit: only data that has a real source', () => {
  test('no field without a source in the database', async ({ page }) => {
    const cols = await page.evaluate(() => {
      const { q } = window.__pathshala, out = {};
      for (const t of ['habitations', 'school_facts', 'citizen_feedback']) out[t] = q(`PRAGMA table_info(${t})`).map(c => c.name);
      out.tables = q("SELECT name FROM sqlite_master WHERE type='table'").map(t => t.name);
      out.rules = q('SELECT param_name FROM rules').map(r => r.param_name);
      return out;
    });
    expect(cols.habitations).toEqual(['hab_id', 'name', 'school_id', 'lat', 'lng', 'elev_m', 'road_connected', 'source']);   // no counts of children, girls or CwSN per habitation
    expect(cols.school_facts).toEqual(['school_id','building','rooms_good','rooms_minor','rooms_major','toilets_girls','toilets_boys','cwsn_toilets','ramp','handrails','drinking_water','electricity','all_weather_road','enrol_girls','enrol_boys','cwsn','transport_students','established','cluster','source','source_note','source_url']);   // no seat capacity
    expect(cols.tables).not.toContain('transport');                                                                          // no timetable source
    expect(cols.rules).not.toEqual(expect.arrayContaining(['warden_per_year']));
    for (const bad of ['warden_per_year', 'girls_safety_cost', 'vehicle_seats']) expect(cols.rules).not.toContain(bad);
    expect(cols.citizen_feedback).toContain('about_id');
  });

  test('seat capacity is classrooms times the planning maximum per room', async ({ page }) => {
    const r = await page.evaluate(async () => { const { tools } = window.__pathshala; const p = await tools.school_profile({ school_id: 'GSH' }); return { rooms: p.school.classrooms, facts: Object.keys(p.facts) }; });
    expect(r.facts).not.toContain('capacity');
    const near = await page.evaluate(async () => (await window.__pathshala.tools.nearby_schools({ school_id: 'PK2' })).find(x => x.school_id === 'GSH'));
    expect(near.capacity).toBe(6 * 40); expect(near.available).toBe(6 * 40 - 143);
  });

  test('transport is reported as Data unavailable, never a timetable', async ({ page }) => {
    const r = await page.evaluate(async () => window.__pathshala.tools.transport_lookup({}));
    expect(r.available).toBe(false); expect(r.reason).toMatch(/Data unavailable/);
  });

  test('feedback belongs to the receiving school it was about', async ({ page }) => {
    const r = await page.evaluate(async () => {
      const { tools } = window.__pathshala, both = ['PK2', 'GSH'];
      return { gsh: (await tools.feedback_search({ school_ids: both, about_id: 'GSH' })).length, ngn: (await tools.feedback_search({ school_ids: ['PK2', 'NGN'], about_id: 'NGN' })).length };
    });
    expect(r.gsh).toBe(87); expect(r.ngn).toBe(0);
  });
});
