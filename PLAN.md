# PLAN: prototype function to module map

The prototype (`reference/PathShala_app.html`, readable source `app_template_v5.html`) is one IIFE with about 2,400 lines
of script. It was split **verbatim** into ES modules by a script that only adds `import`/`export` lines; nothing else in
the moved functions changed, so the HTML they produce is identical. After that, only three seams were refactored
(all covered by tests): the SQLite handle, Leaflet's map registry, and the case agent (see "Agent seam" below).

## 1. Verbatim split

| Module | Prototype functions and constants moved into it |
|---|---|
| `src/db/sqlite.js` | `STORE`, `SQL`, `db`, `q`, `q1`, `run`, `b64`, `unb64`, `persisted`, `save`, `freshDb`, `openDb`, `loadScript`, `bootSql` |
| `src/db/schema.js` | `ENGINE_DDL`, `MERGE_DDL`, `CASE_DDL` |
| `src/ui/helpers.js` | `$`, `$$`, `esc`, `css`, `today`, `nowTime`, `MONTHS`, `P`, `school`, `place`, `inr`, `monthsText`, `haversine`, `hasTable`, `facts`, `capOf`, `linkOf`, `nowTs`, `logCase`, `segKm`, `sleep`, `groups`, `state`, `route`, `go`, `HC`, `colour`, `STATUS_CLS`, `short`, `plural`, `mergeOf`, `mergesAll`, `mergeRow`, `pairsOf`, `mHealth`, `mLine`, `implOf`, `stChip`, `tone`, `crumbs`, `mCrumbs`, `caseState`, `STEPS`, `EV_LBL`, `evChip` |
| `src/engine/classify.js` | `ISSUE_KW`, `NEG`, `POS`, `classify` |
| `src/engine/rules.js` | `Q_OPTIONS`, `optLabel`, `HAZARD_ANSWER`, `analyse`, `analyseAll`, `snapshot`, `newItems`, `diff`, `commit` |
| `src/engine/merges.js` | `RANK`, `ISSUE_ITEMS`, `RECEIVER_ISSUES`, `IMPL`, `successLabel`, `successHealth`, `computeMerges` |
| `src/engine/evalPair.js` | `evalPair` |
| `src/ui/toast.js` | `toast`, `dbStatus` |
| `src/ui/components.js` | `qCards`, `wireQuestions`, `saveAnswer`, `checksHtml`, `attChart`, `feedbackHtml`, `msgHtml`, `successHtml` |
| `src/ui/pages/inbox.js` | `SAMPLES`, `renderInbox` |
| `src/ui/pages/rules.js` | `renderRules` |
| `src/ui/pages/sql.js` | `SAMPLE_SQL`, `renderSql`, `exec` |
| `src/case/analysis.js` | `walkProfile`, `routeHazards`, `transportAt`, `screen`, `nearby`, `createCase` |
| `src/retrieval/bm25.js` | `retrieve` |
| `src/agent/plan.js` | `agentPlan` |
| `src/case/findings.js` | `writeFindings`, `applyField`, `buildInterventions`, `draftText` |
| `src/ui/pages/caseHome.js` | `renderCaseHome`, `schoolPanel` |
| `src/ui/map/caseMap.js` | `caseMap`, `pickLayer`, `buildCaseMap`, `drawPick`, `caseMapPanel`, `drawCaseMap` |
| `src/ui/map/geoLayers.js` | `geoLayers` |
| `src/ui/pages/case.js` | `renderCase` |
| `src/ui/pages/compare.js` | `stepCompare` |
| `src/ui/pages/access.js` | `stepAccess`, `profileSvg` |
| `src/ui/pages/community.js` | `stepCommunity` |
| `src/ui/pages/investigate.js` | `stepInvestigate`, `agentRow`, `runAgent`, `findingsHtml`, `fieldQ`, `wireField` |
| `src/ui/pages/policy.js` | `stepPolicy` |
| `src/ui/pages/report.js` | `stepReport` |
| `src/ui/pages/cases.js` | `renderCases` |
| `src/ui/map/baseMap.js` | `maps`, `baseMap` |
| `src/ui/map/districts.js` | `districts` |
| `src/ui/router.js` | `render` |
| `src/ui/pages/home.js` | `renderHome` |
| `src/ui/map/homeMap.js` | `buildHomeMap` |
| `src/ui/pages/merge.js` | `renderMerge` |
| `src/ui/map/miniMap.js` | `miniMap` |
| `src/ui/pages/pair.js` | `renderPair` |
| `src/ui/pages/item.js` | `ITEM_Q`, `ITEM_FB`, `renderItem` |
| `src/ui/pages/mergeFeedback.js` | `renderMergeFeedback` |
| `src/ui/pages/survey.js` | `renderSurvey` |
| `src/ui/pages/surveys.js` | `renderSurveys` |
| `src/ui/pages/problems.js` | `renderProblems` |
| `src/ui/pages/school.js` | `renderSchool` |
| `src/ui/pages/planner.js` | `renderPlanner` |
| `src/main.js` | boot: reset button, `bootSql()`, first `analyseAll()`, first `render()` |
| `src/geo.js`, `src/data/hp.json` | replaces the inlined `GEO` constant |

Mechanical changes made while moving code (all needed only because the code is now in separate modules):

- `db` is exported as a live binding; `setDb()` replaces the two assignments in the boot code.
- `newItems` and `maps` are reset through `resetNewItems()` and `resetMaps()`, since importers cannot assign to a binding.
- `$('#seed').textContent` became `import seedSql from './seed.sql?raw'`.
- `initSqlJs` and Leaflet come from npm (`sql.js`, `leaflet`) instead of `<script>` tags. The asm.js fallback is a dynamic import.

## 2. Agent seam (AGENTS.md)

| Prototype | New home |
|---|---|
| `agentPlan()` (8 steps) | `src/agent/plan.js`, each step now calls a tool from `src/agent/tools.js` |
| `runAgent()` loop | `src/agent/runner.js` `runInvestigation()`; `investigate.js` only renders the events |
| `writeFindings()` (one big function that built and inserted rows) | Access Analyst, Community Analyst, Gap Finder, Coordinator (`src/agent/agents/*`) return schema-valid JSON; `src/case/findings.js` `writeFindings()` inserts it |
| `applyField()` | `apply_field_answers` tool, Evidence Updater agent, `applyEvidenceUpdate()` |
| `buildInterventions()` | Policy Researcher agent, `cost_calc` tool, `saveInterventions()` |
| `draftText()` | `draft_report` tool, Report Drafter agent (`src/case/draft.js`), checked by the Report Critic |
| `retrieve()` | `src/retrieval/bm25.js`, exposed as the `policy_retrieve` tool |
| `walkProfile`, `routeHazards`, `transportAt`, `nearby` | `src/case/analysis.js`, exposed as `route_calc`, `gis_overlay`, `transport_lookup`, `nearby_schools` |

## 3. Order of work (one commit each)

1. Port the prototype to a Vite project (verbatim split, all pages).
2. Playwright acceptance suite and the screenshot comparison script.
3. Agent layer: tools, schemas, agents, provider, runner. Checked by `tests/parity.mjs`, which runs the same investigation in the
   prototype and in the new build and diffs every table the flow writes.
4. Exhaustive button tests, fixtures, retrieval and guardrail tests.
5. Docs and deployment files.
