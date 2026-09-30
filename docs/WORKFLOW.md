# PathShala: workflow and features, page by page (technical)

PathShala helps a district education officer decide whether a low-enrolment school should be merged into another, using evidence instead of only distance and headcount. It is a static single-page app: everything runs in the browser, with the database, agents and maps included in one `index.html`.

## 1. Architecture at a glance

| Layer | What it is | Where |
|---|---|---|
| UI | Vanilla JS ES modules, hash routing (`#/…`), Leaflet maps (no tiles, GeoJSON polygons) | `src/ui/` |
| Database | SQLite compiled to WebAssembly (sql.js). The schema and demo data are loaded from `src/db/seed.sql` at start-up. Changes are saved to `localStorage`; the key includes a fingerprint of the seed, so a save made from older data is discarded | `src/db/` |
| Case model | An *investigation* (one closing school) holds several *tracks* (one per candidate receiving school). Each track has its own findings, evidence, field questions, interventions, agent log and feedback summary | `src/case/options.js` |
| Agents | Eight agents plus feedback agents. Each is `{id, systemPrompt, tools, outputSchema, simulate}`. A runner validates every output against a JSON schema (Ajv), retries once, then falls back to the simulated result and logs it | `src/agent/` |
| Tools | Async, read-only functions over SQLite (`sql_query`, `route_calc`, `gis_overlay`, `feedback_search`, `policy_retrieve`, `cost_calc` …) with Gemini-format declarations | `src/agent/tools.js` |
| Retrieval | BM25 over policy chunks (RTE Rules, Samagra Shiksha norms, HP decisions) | `src/retrieval/bm25.js` |
| Rules engine | Merge-side checks, success score, problems, survey questions | `src/engine/` |
| Build | Vite 6 + `vite-plugin-singlefile`; `npm run pages` builds and copies `dist/index.html` to the root `index.html` for GitHub Pages | `package.json` |
| Data pipeline | Python scripts build `seed.sql` from real sources and synthesised tables (`npm run seed`) | `data/` |

No server is needed. Gemini is optional and is reached through a proxy with a key the officer pastes into the browser; nothing secret is in the source or the build.

## 2. The officer's workflow

Top navigation: **Investigate** (home) and **Merges**; a **More** menu holds the Feedback inbox, AI connection, Rules and the SQLite console.

### Page 0: Home (`#/`): pick the schools

**What the officer does**
1. Chooses ONE closing school (map click or the "needs review" list). The list is schools with 30 or fewer students or a poor or unsafe building.
2. Ticks two or more receiving schools (or "Pick the best 3").
3. Presses "Compare".
4. Or presses **Quick demo: guide me** for a guided tour (see section 5).

**What it provides**
- District map of every school (marker size = enrolment, red = 10 or fewer students); district filter (Kullu, Kangra, Bilaspur, All).
- For each candidate: road km, free seats and a 0 to 100 screening score. The score is `100 − 2×road km − seat-shortfall penalty − 0.1×(walk min − 30) − 5×hazards`; it is a screening aid, not a recommendation.
- Case creation orders the tracks by score and creates the `investigations` and `cases` rows.

### Step 1: Compare (`#/case/<id>/compare`)
- Closing-school card: students, teachers, classrooms, building condition, source tag, habitations and their heights and road access.
- Side-by-side table, one column per candidate: screening score, free seats (rooms × planning norm), road and walking distance and time, RTE walking limit, climb, mapped hazards, students and teachers, building, facilities (girls' and boys' toilets, ramp, handrails, water, electricity, road), citizen feedback count.
- Best value in each row is highlighted. Each row names its data source. Route values not surveyed are marked as estimates.
- Add or remove a school. **Nothing is chosen here.**
- Technical: `stepCompare` builds columns from `routeInfo()`, `capOf()`, `facts()` and `nearby()`.

### Step 2: Feedback (`#/case/<id>/feedback`): what citizens say
Runs automatically on opening; the officer presses nothing.
1. **Pool.** All messages about the closing school and the receiving school, wherever they came from (`about_id IN (from, to)`).
2. **Classify (hardcoded).** Each message gets a *category* (Transportation, Safety, Terrain and weather, Social, Others), a *subject* (closing school, receiving school, the merger) and a *sentiment* (positive, negative, neutral). There is a fixed table for every demo message and keyword rules for new ones. No model is involved.
3. **Stance (fixed rule).** Good about the receiving school or bad about the closing school supports merging; the reverse does not; a message about the merger counts as given; neutral stays neutral. The stance is computed by code, never by a model.
4. **Category agents.** One agent per category summarises its concerns. With a Gemini key the summary is written by Gemini (JSON with a summary and up to four points citing message ids); otherwise a rule writes it. The counts, sentiment totals and verdict (support, oppose, mixed, neutral) always come from the database.
5. **View.** Overall stance bar; one row per category with count, stance bar, verdict and a one-line summary; a row opens to show its top concerns and example messages. A collapsed note explains the method.
- Tables: `feedback_class(case_id, fb_id, category, subject, sentiment, stance, src)` and `concerns(case_id, category, agent, summary, points, n, habs, pos, neg, neu, sup, opp, stance, src, run_at)`.
- A school with no messages shows "Data unavailable".
- Technical: `src/agent/feedbackAgents.js` (`runClassify`, `runCategoryAgents`, `ensureFeedback`), `src/ui/pages/feedback.js`.

### Step 3: Evidence (`#/case/<id>/evidence`)
- One tab per receiving school.
- Getting there: walking and road distance, walking time for a young child (Tobler's hiking function on the elevation profile, at the child pace set in the rules), climb, elevation profile chart.
- On the route: bridges, steep paths, landslide zones within 150 m, each with source.
- Feedback carried forward: the same category rows as step 2, one line each.
- Older theme view: responses per theme; clicking a theme sizes the habitation circles on the map, showing demand hotspots.
- Public transport is always "Data unavailable" (no timetable source is connected).

### Step 4: Investigate (`#/case/<id>/investigate`)
1. **Run.** "Investigate case" runs one school; "Investigate all schools" runs every track. The run makes eight visible tool calls, each expandable to show its input and output:
   analyse affected students, check routes, check GIS layers, check transport, analyse feedback, identify recurring concerns (a theme with at least 10 responses or from at least 3 habitations), cross-check field observations, find evidence gaps.
2. **Findings.** The Coordinator combines the results into findings (transport, seasonal access and so on), each "Potential issue" until verified, with evidence items tagged reported, verified, calculated or needs.
3. **Field questions.** Up to five questions specific to the route (for example bridge passable in heavy rain, students using the route, transport at school times, travel time, photo or GPS note).
4. **Field verification.** The officer answers (option buttons, numbers, minutes, note or photo caption) and submits. The Evidence Updater changes statuses (for example Seasonal access to Verified) and re-costs any chosen interventions.
- Technical: `runInvestigation` (calls `ensureFeedback`, then `agentPlan`, then Access Analyst, Community Analyst, Gap Finder and Coordinator) and `runFieldUpdate`; results are written only through `src/case/findings.js`.

### Step 5: Policy and cost (`#/case/<id>/policy`)
- The Policy Researcher retrieves policy text with BM25 and proposes interventions (school transport support, escort, keeping and repairing the closing school and others). Each shows the quoted policy passage, a separate interpretation citing evidence ids, and a cost.
- Costs come only from `cost_calc` (for example ₹6,000 per child per year from the Samagra Shiksha norm, vehicle seats, classroom cost). A model never computes a cost.
- The officer ticks interventions per school. A table adds up the total cost per school (yearly, one-time, first-year).

### Step 6: Report (`#/case/<id>/report`)
1. **Choose ONE school, last.** A table compares all candidates (investigated, field answers, concerns confirmed, interventions, costs). The officer presses "Choose this school" with the totals in view. The choice is stored in `investigations.chosen_id`.
2. **Draft.** The Report Drafter builds 4 to 7 sentences from case evidence only, each ending with references (`E…` evidence, `C…` policy chunks, `K:<category>` feedback concerns).
3. **Critic.** The Report Critic rejects a sentence with no reference, an unknown id, a number not in the cited evidence, or approval language. The drafter and critic loop at most twice.
4. **Officer review.** Edit the text, leave findings out, tick evidence, add comments, tick the review box, and submit. Status becomes "Ready for administrative review".
- **Only the officer approves or submits.** No agent can approve a merger, select an intervention, mark evidence verified, or submit.

## 3. The Merges area

- **Merges (`#/merges`).** One tile per merge: receiving school, closing schools, students before and after, health colour (green, amber, red, awaiting answers), verdict or success score, problem count and yearly cost. Header totals: average success, open problems, proposed.
- **Merge page (`#/m/<id>`).** Success score for merged schools, problems with severity and links, policies, implementation actions, closing-school pages, feedback and a survey form.
- **Closing-school page (`#/m/<id>/g/<group>`).** Match check (walking limit, capacity, hazards), policy cards.
- **Plan item, survey and feedback pages.** Status tracking per plan item; unknown data points become survey questions; answers re-run the analysis.
- **New merge (`#/new`).** Planner: pick a receiving school, tick closing schools, see a summary, create or delete.
- Technical: `src/engine/merges.js` computes success scores and problems; `src/engine/rules.js` holds editable rules; `src/engine/evalPair.js` scores a pair.

## 4. Supporting pages

| Page | Purpose |
|---|---|
| Feedback inbox (`#/inbox`) | Log a message from WhatsApp, phone, gram sabha, grievance portal or a school visit, in Hindi or English. A keyword classifier shows issue, sentiment, severity and language live; saving re-runs the merge analysis |
| AI connection (`#/ai`) | Paste a Gemini proxy key (kept in `localStorage`), test the connection, remove it. Without a key everything still works with rules |
| Rules (`#/rules`) | Edit thresholds and costs (walking limits, ₹ per child, child pace and so on); saving re-checks every merge; undo is supported |
| SQLite console (`#/sql`) | Read and write SQL against the live in-browser database, sample queries and Ctrl+Enter; writes re-run the analysis |
| School page (`#/s/<id>`) | Profile of one school |
| Cases (`#/cases`) | List of investigations |
| Every page | A "Sources of data on this page" fold; synthesised data names PathShala as its source |

## 5. Quick demo (home page button)
A coach panel (`src/ui/demo.js`) walks a first-time user through 11 steps for GPS Pekhri-2 with two candidate schools: pick the closing school, tick receivers, start the comparison, compare, feedback, evidence, run the investigation, answer field questions, choose interventions, choose one school, review the report. Each step highlights the control to use and explains it; "Do it for me" performs that step's input; Next, Back and Exit work anywhere.

## 6. Data: real, derived and synthesised

| Data | Status | Source |
|---|---|---|
| School register, enrolment, teachers, rooms | Real for five schools (UDISE+ School Report Cards 2025-26: Nahin, Jiyani, Jana, Dobhi, Soyal); the rest from the UDISE+ school list | UDISE+ |
| Facilities (toilets by sex, ramp, handrails, water, electricity, road, cluster, year) | Real for the five report-card schools; otherwise "Not recorded" | UDISE+ |
| Locations | Real, partial | India Data Portal, Datameet |
| Walking and road routes, elevation | Real for the Pekhri-2 area; elsewhere labelled estimates (straight line × 1.3 or 1.4) | Google Routes and Elevation APIs |
| Rivers, roads, bridges, hazards | Real | OpenStreetMap, JRC surface water, GSI landslide susceptibility |
| Policy text | Real | RTE Rules 2010, Samagra Shiksha norms, HP merger decision, NEP 2020 |
| Citizen feedback | Synthesised by PathShala from real complaint patterns (87 messages about Gushaini; 5 to 8 about every other school) | PathShala |
| Attendance, success scores, survey answers | Synthesised | PathShala |
| Transport timetables | Not available; shown as "Data unavailable" | |

Principle: show only data with a real source or a labelled synthetic one; otherwise say so. Estimates are labelled.

## 7. Guardrails

- The model never produces a number, cost or approval. Counts, distances, times and costs come from tools; stance comes from a rule.
- Every claim carries a reference; an output without references fails validation.
- `sql_query` is read-only and limited to known tables.
- Every agent output is schema-validated; failures fall back to the simulated result and are logged in `case_log`.
- Each track keeps its own answers and evidence; feedback about one school is never shown for another.
- Secrets: the Gemini key exists only in the officer's browser storage.

## 8. Testing

Playwright drives the built app (`tests/`): a button-by-button suite (`ui-buttons`), an end-to-end walk with screenshots (`e2e`), agent and guardrail checks with reference fixtures for case C1 (`agents`), and a crawl of every page and case step, including stale-save handling (`pages`). `tests/live-gemini.spec.js` runs against the real proxy only when `LLM_KEY` is set. Screenshots are in `docs/screens/`.

## 9. Not built yet

Voice transcription, languages beyond Hindi and English, national demographic and infrastructure indices as data layers, public investment plans, server-side Gemini for the investigation agents (only the feedback summaries can use Gemini today), and public transport timetables.

## 10. Research agents (tool calls and RAG, shown step by step)

Three agents run a visible loop, once per press of "Run research" (or "Get a suggestion" on the Report step). They only propose: results go to `research_runs`, `research_steps`, `research_evidence` and `suggestions`, never to the case's findings, evidence, field questions or choice. Field questions from an agent enter the case only when the officer presses "Add … to the field questions"; the AI suggestion selects nothing, and "Use as a starting point" only highlights the option, so the officer still presses "Choose this school". If the officer's choice differs, both are stored and logged.

**Loop (`src/agent/loop.js`).** plan → one tool or search → save the result as evidence (source + status: reported, verified, calculated, needs verification) → check it → decide the next step → stop when answered, when no tool can help ("Data unavailable" plus a field question), or after 12 steps. Numbers come only from tools; every sentence carries citations to evidence ids or to passages returned in that run, and a sentence with an unknown citation or a number no tool produced is rejected.

**Modes.** *Simulated* (default, no key): fixed rules choose every step; search is keyword-only. *Gemini* (key under More → AI connection, never in the code): Gemini picks the next tool (as JSON over the chat proxy, validated against the tool declarations, no repeats, cannot stop early), writes the plan, one-line reasons and the final wording. If a reply fails or is invalid the simulated step or wording is used and the fallback is logged in the case record and shown on the panel. The panel shows which mode ran.

**RAG (`src/agent/rag.js`).** Five collections built from the existing data: policy (one piece per rule or clause), citizen feedback (one per message), public reports (fixed sample summaries of The Tribune reports on the Tirthan footbridge and unsafe schools of Tirthan valley, always "Web source, needs verification", never changing evidence status), the case record, and past cases. Each piece has source, date, place and "exact wording" or "summary". Search is keywords (BM25) plus meaning (Gemini embeddings when a key is set; the proxy is expected to offer `POST /embed`, and if it does not, the step says keywords only), filtered by place, top 5; no match returns "No source found".

| Agent | Screen | What it does | Tools |
|---|---|---|---|
| Transport Planner | Evidence | habitations and children → road route → bus timetable against school hours → web search if missing → pickup stops → transport policy (RAG) → cost from the cost calculator. Output: route plan, cost, policy citation, open questions | `habitations_and_children`, `route_calc`, `route_estimate`, `transport_lookup`, `web_search`, `pickup_stops`, `rag_search`, `cost_calc` |
| Feedback Checker | Feedback | retrieve feedback → extract claims (place, time, what is said) → check against timetable, attendance by month, map hazards, field observations and school records → search public reports. Each claim is supported, contradicted or unchecked, with sources; unchecked claims become proposed field questions | `rag_search`, `extract_claims`, `transport_lookup`, `attendance_by_month`, `gis_overlay`, `field_observations`, `school_profile`, `web_search`, `check_claims` |
| AI suggestion | Report, above the decision | compare candidates on walk time, seats, confirmed concerns and cost (tool numbers only) → past cases and policy → fixed ranking rule → suggested option or "keep and repair the closing school", 2 to 4 cited reasons, what would change it, outstanding checks. Labelled "Suggestion. The officer decides." | `compare_options`, `rag_search`, `suggest_option` |

Each step shows the tool or search, a one-line reason, the result, and expands to the input, output, retrieved passages with score, source, date, place and wording, and the evidence it saved. Tests: `tests/research.spec.js` (Pekhri-2 case; Gemini checks in `tests/live-gemini.spec.js` run only when `LLM_KEY` is set).

## 11. Full control (a mode on the home page)

The same case screens as the normal flow, driven by the AI, with far less input. The officer picks ONE closing school; everything else is automatic except the field form.

0. **Choose the mode.** The home page (Investigate) has a switch: *Step by step* or *Full control*. There is no separate tab; `#/full` just opens the home page in that mode.
1. **Start.** In Full control, click the closing school on the map or list (30 or fewer students, or a poor or unsafe building) and press *Start Full control*. The AI chooses the three best candidate receiving schools by the screening score and opens an investigation.
2. **Compare.** The candidates it chose are shown. A banner ("Full control") says what the AI did and counts down to the next screen (the officer does not click Next); **Skip ahead** goes at once and **Pause** stops the countdown. A progress strip on every screen shows each stage, tagged **AI** or **You**: the only stage tagged You is the field form.
3. **Feedback.** Before the screen appears the AI classifies and summarises the citizen feedback and runs the Feedback Checker for every school (working log shown while it runs).
4. **Evidence.** The Transport Planner runs for every school.
5. **Investigate.** The AI runs the eight-step investigation for every school, adds the research's extra questions, and generates the **field form**: one section per school, printable blank. **The flow stops here** until the field officer submits (at least one answer per school). Policy and Report cannot run ahead of the form.
6. **Policy and cost.** After the answers the evidence is updated, then the AI proposes interventions for each school and selects the best by a fixed rule (for each confirmed concern, the cheapest intervention that addresses it), priced by the cost calculator.
   *Update:* with a Gemini key the model chooses the policies from the same list (it must give a reason for every option; an answer with an unknown code is discarded and the rule's choice stands); without a key the rule chooses. Each option on the Policy screen shows "The AI chose this / did not choose this" with the reason, and every tick can be changed by the officer ("Put back the AI's choice" restores it). This screen waits 20 s (any edit pauses it) before the report is built from the officer's final ticks; an edit after the report exists rebuilds it.
7. **Report.** The AI ranks the candidates and shows, above the ordinary Report step: the recommendation (or "keep and repair the closing school", plus the best candidate if the merger goes ahead) with cited reasons; a side-by-side comparison with a "why not" card for each other option; the budget (yearly, one-time, first-year, three-year, and the keep-and-repair alternative); the full report text with citations and the critic's result; open issues; the log; Download text and Print or save as PDF. The ordinary options table and report editor stay below for the officer's decision.
   The report step compares the policies and budgets of all schools (lowest and highest first-year cost, how far the best candidate is from the cheapest, the keep-and-repair cost) as a "Budget compared across schools" section.

Auto-advance runs only during the first pass; afterwards the officer can visit any screen without being moved on. Guardrails: the AI selects policies here because the officer started this mode (each choice is logged as "Full control" with its reason); it never submits and does not choose the school. **Adopt this recommendation** or the ordinary "Choose this school" buttons record the officer's decision, and submitting stays on the Report step. If a research tool fails, the run ends that agent honestly with "Data unavailable" and a field question instead of stopping the flow. Tests: `tests/full.spec.js`.

**Field form length (Full control).** Each school's form has at most four questions: the three standard ones (route passable, students using it, public transport) tailored to the school, plus the one question the research found most important for that school (from its terrain, its citizen claims or its transport gaps). The travel-time and upload questions are left out.
