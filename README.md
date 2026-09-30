# PathShala

A school-consolidation investigation tool for district education officers in Himachal Pradesh.
An officer picks a small or unsafe school, screens nearby schools that could receive its students, and runs an investigation:
routes, terrain, transport, community feedback, field observations, policy and cost, then a referenced report that only the
officer can approve and submit. A second half of the app tracks existing merges (success score, problems, field surveys).

This is a Vite + vanilla JavaScript rebuild of the single-file prototype in `reference/PathShala_app.html`, with the same UI and
behaviour, on the same SQLite data (sql.js in the browser), and a clean seam for connecting Gemini later.

## Run it

```bash
npm install
npm run dev          # http://localhost:5173/app.html  (dev entry is app.html)
npm run build        # one self-contained dist/index.html
npm run pages        # build and copy it to ./index.html (what GitHub Pages serves)
npm run preview      # serve dist/ on :4173
```

### Host on GitHub Pages

The repo root already contains a built `index.html`: a single file with the JS, CSS, sql.js WebAssembly and map data inlined
(about 2.9 MB, 1 MB gzipped). In the GitHub repo go to **Settings → Pages → Build and deployment → Deploy from a branch**,
pick the branch and `/ (root)`, and open `https://<user>.github.io/<repo>/`. It also opens by double-clicking `index.html`.
After changing the source, run `npm run pages` and commit the new `index.html`. It makes no network requests except the
optional Google Fonts stylesheet (system fonts are used if that is blocked).

Everything runs in the browser, from that one file: SQLite (WebAssembly, with an asm.js fallback), the rules engine and the agents. The database
is saved to `localStorage` (`pathshala.db.v5`) after every write; **Reset demo** reloads it from `src/db/seed.sql`.

Deploy `dist/` anywhere: `firebase deploy` (see `firebase.json`), or `docker build -t pathshala . && docker run -p 8080:8080 pathshala`
(nginx, works on Cloud Run).

### Tests

```bash
npx playwright install chromium       # once (or set PW_CHROMIUM=/path/to/chromium)
npx playwright test                   # 48 tests: acceptance flow, every button, agents, guardrails
npm run compare                       # side-by-side images in tests/compare/ (reference | actual)
node tests/parity.mjs                 # runs the same investigation in the prototype and the build, diffs every SQLite table
node tests/gen-fixtures.mjs           # regenerates src/agent/fixtures/C1/*.json
```

`tests/e2e.spec.js` walks the reference investigation (acceptance criteria 3 and 4) and saves a screenshot for each of the 24
reference states to `tests/compare/actual/`. `tests/ui-buttons.spec.js` clicks every control on every page.
`tests/agents.spec.js` covers schema validation, fixtures, retrieval and the guardrails in `docs/AGENTS.md`.

### Regenerating the data

`npm run seed` runs `data/build_seed.py` (which imports `data/case_data.py`, the Tirthan valley case) and copies the result to
`src/db/seed.sql`. If you change the schema, bump the localStorage key (`STORE` in `src/db/sqlite.js`).

## Architecture

```
                      ┌────────────────────────── browser ───────────────────────────┐
  hash router         │  ui/pages/*  ──renders──►  DOM (same HTML and CSS as prototype) │
  #/  #/case/C1/…     │      │  ▲                                                     │
  #/m/M5 …            │      ▼  │ events {label, tool, input, output, summary}        │
                      │  agent/runner.js ── validates every output (Ajv) ─────────┐   │
                      │      │  calls                                              │   │
                      │      ▼                                                     ▼   │
                      │  agent/provider.js ──► SimulatedProvider ─► agents/*.simulate  │
                      │        (VITE_AGENT_PROVIDER)   GeminiProvider ─► POST /api/agent (stub)
                      │                                   │ tool_call                   │
                      │                                   ▼                             │
                      │  agent/tools.js  (14 tools: async JSON in, JSON out)            │
                      │      │ read-only                                                │
                      │      ▼                                                          │
                      │  db/sqlite.js (sql.js) ◄── case/findings.js (the only writer)   │
                      │      ▲                                                          │
                      │  engine/rules.js, merges.js, evalPair.js (deterministic rules)  │
                      └─────────────────────────────────────────────────────────────────┘
```

```
src/
  main.js            boot: load sql.js and hp.json, open the DB, run the analysis, start the router
  db/                sqlite.js (init, open, save/load, q/q1/run), schema.js (runtime DDL), seed.sql
  engine/            rules.js (checks, plan, questions, verdicts), merges.js, evalPair.js, classify.js
  agent/             agents/ prompts/ schemas/ fixtures/  tools.js plan.js runner.js provider.js validate.js
  retrieval/bm25.js  policy retrieval (BM25)
  case/              analysis.js (routes, hazards, transport, screening), findings.js (repository), draft.js
  ui/                router.js, helpers.js, toast.js, components.js, map/*, pages/*
  styles/app.css     the prototype CSS, verbatim
```

`PLAN.md` maps every prototype function to its module. `NOTES.md` lists prototype bugs that were kept on purpose.

### Routes

`#/` case map · `#/cases` · `#/case/:id/{compare,access,community,investigate,policy,report}` · `#/merges` · `#/m/:merge` ·
`#/m/:merge/g/:group` · `#/m/:merge/p/:group/:code` · `#/m/:merge/{survey,feedback}` · `#/surveys` · `#/problems` · `#/new` ·
`#/s/:school` · `#/inbox` · `#/rules` · `#/sql`

## The agents

Eight agents, specified in `docs/AGENTS.md`, live in `src/agent/agents/`. Each exports
`{ id, systemPrompt, tools, outputSchema, simulate(ctx) }`.

| Agent | Job | Tools | Output schema |
|---|---|---|---|
| Coordinator | merges specialist evidence into findings | (calls the specialists) | Findings |
| Access Analyst | students, routes, terrain, transport | sql_query, school_profile, route_calc, gis_overlay, transport_lookup | EvidenceBundle |
| Community Analyst | feedback themes, recurring concerns, field observations | feedback_search, classify_feedback, recurring_concerns, field_observations | EvidenceBundle |
| Gap Finder | evidence gaps and targeted field questions | evidence_gaps | FieldQuestions |
| Evidence Updater | field answers to evidence and finding statuses | apply_field_answers | EvidenceUpdate |
| Policy Researcher | policy chunks to interventions, with costs | policy_retrieve, cost_calc | Interventions |
| Report Drafter | rationale from case evidence, a reference on every sentence | get_case_evidence, draft_report | Draft |
| Report Critic | checks references, numbers and wording | get_case_evidence | Critique |

The merge-side agents (`mergePlanner`, `successMonitor`, `surveyBuilder`) keep the same shape and stay deterministic.
System prompts are in `src/agent/prompts/*.md`, output schemas (JSON Schema 2020-12) in `src/agent/schemas/*.json`.

**Hard rules, enforced in code and tested:** the LLM never produces numbers or approvals. Costs come only from `cost_calc`
(rules table and the Samagra Shiksha norm). The draft may only use evidence already in the case, and the Report Critic checks
that every sentence has a real reference and every number appears in the evidence. Only the officer approves, selects an
intervention, marks evidence verified or submits (no agent code writes `cases.status` or `reports.approved`). Every agent output is
validated with Ajv; on failure the runner retries once, then falls back to the simulated result and logs it in `case_log`.

### Where to plug in Gemini

1. **`src/agent/provider.js`**: `GeminiProvider.call(agent, ctx)` is a stub with a TODO. `buildRequest()` already builds the
   payload. Choose the provider with `VITE_AGENT_PROVIDER=gemini` (default `simulated`, which reproduces the prototype exactly).
2. **`/api/agent`**: a Cloud Run proxy (Node or Python, Google ADK or plain Vertex AI function calling) that holds the API key.
   Contract:

   ```
   POST /api/agent   { agent, case_id, system, messages, tools: toolSchemas, response_schema }
   ← NDJSON  {"type":"tool_call","name","args","call_id"}   browser runs tools[name](args) on sql.js, POSTs {call_id, output}
   ← NDJSON  {"type":"final","json":{…}}                    validated against response_schema, then written to the DB
   ```

   Use temperature 0.2 for analysts and 0.4 for the Drafter, and log every call. The repository already has a FastAPI Gemini
   proxy in `backend/` (deployed with `render.yaml`) that you can extend with this endpoint.
3. **Retrieval**: `src/retrieval/bm25.js` is BM25 over `policy_chunks`. For LLM mode add embeddings (`policy_vectors`) and
   reciprocal-rank fusion behind the same `policy_retrieve` tool (see `docs/AGENTS.md` section 6).

### Tools

Defined in `src/agent/tools.js`, each as `async (input) => output` over plain JSON. `toolSchemas` holds the same tools in
Gemini function-declaration format (`name`, `description`, `parameters` as JSON Schema). Tools never write to the database.

| Tool | Input | Output |
|---|---|---|
| `sql_query` | `{sql}` single `SELECT`/`WITH` | `{rows}` (rejects writes, multiple statements, unknown tables) |
| `school_profile` | `{school_id}` | school, facts, habitations |
| `nearby_schools` | `{school_id, max_km?}` | `[{school_id, road_km, walk_min, capacity, available, hazards, score, parts, estimated}]` |
| `route_calc` | `{from_id, to_id, mode: walk\|road}` | `{km, minutes, climb_m, descent_m, max_slope_pct, steep_km, profile}`; walking uses Tobler's function × `child_pace` (R13) |
| `gis_overlay` | `{from_id, to_id, route, buffer_m?, layers?}` | mapped bridges, steep paths and landslide zones within 150 m |
| `transport_lookup` | `{habitation_ids?, windows?}` | `[{name, kind, departures, at_school_time, available}]` for 08:15–09:15 and 14:45–15:45 |
| `feedback_search` | `{school_ids, hab_ids?, theme?, limit?}` | messages in Hindi and English with theme and status |
| `classify_feedback` | `{fb_ids}` | `{themes: {name: {count, verified, habitations, fb_ids}}}` (stored theme now; Gemini batches later) |
| `recurring_concerns` | `{themes}` | themes with ≥10 responses or from ≥3 habitations (never "Other") |
| `field_observations` | `{school_id}` | government field observations |
| `evidence_gaps` | `{case_id}` | `[{gap, why, suggested_type}]` |
| `apply_field_answers` | `{case_id, answers}` | `{evidence_changes, finding_changes, new_evidence}` (pure; the repository writes) |
| `policy_retrieve` | `{query, k?, doc_ids?}` | `[{chunk_id, doc_title, section, text, url, verbatim, score, hits}]` |
| `cost_calc` | `{intervention: TR\|ES\|SEA\|RET, inputs}` | `{inputs, formula, cost_inr, cost_type}`, the only source of costs |
| `get_case_evidence` | `{case_id}` | findings, evidence, field answers, selected interventions, cited chunks |
| `draft_report` | `{case_id}` | `{sentences: [{text, refs}]}` |

Every step of an investigation is written to `agent_steps` and shown (input and output) when a step is expanded in the UI.

## Data provenance

`src/db/seed.sql` (generated by `data/build_seed.py` and `data/case_data.py`) holds all input tables. Rows and values carry a
`source` of `real` or `mock`, shown as tags in the UI. Where there is no data the UI says "Data unavailable"; nothing is invented.

| Data | Source | Status |
|---|---|---|
| School names, levels, UDISE codes, enrolment for the merge schools | UDISE+, HP merger orders and news reports | real for named merges; other counts mock |
| Merge pairs and outcomes (Uch, Nurpur, Chhat, …) | HP Directorate merger list, Tribune, LiveLaw, Scroll, The Federal, The Wire | real |
| School coordinates | Datameet UDISE export where available | real for two demo schools, otherwise placed on the map by hand |
| Routes, elevation profiles, hazards, bridge | hand-built for the Tirthan valley demo from published reports | **mock geometry** (Google Routes, Elevation and Earth Engine are the planned sources) |
| Habitations, citizen feedback, transport timetables, field answers | synthetic | **mock** |
| RTE Rules 2010, Samagra Shiksha norm (₹6,000 per child per year), NEP 2020, HP merger decision, Sandyar judgment | official texts | real; quoted as stored, paraphrases labelled |
| Rules table (thresholds and costs) | RTE, HP proposal 2025, HP PAB 2025-26, PathShala planning assumptions | mixed, source shown per rule |

Raw pages and PDFs that were fetched for this are in `data-sources/` (index in `data-sources/README.md`);
`docs/data_sources.md` maps every item to real or mock. `docs/user_story.md` is the officer's investigation story.

## Repository layout

`app.html` and `src/` the app source · `index.html` the built single-file app for GitHub Pages · `data/` seed generators · `tests/` Playwright tests · `reference/` the prototype and its
24 screenshots · `docs/` AGENTS.md, user story, data sources · `backend/`, `render.yaml` the existing FastAPI Gemini proxy ·
`data-sources/` fetched source material.
