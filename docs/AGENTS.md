# PathShala agent specification

This file tells the coding agent how to set up PathShala's agents, tools and retrieval (RAG).

**Now (mock mode):** every agent runs as deterministic code in the browser, against SQLite. The UI shows each step as a tool call, exactly as in `reference/PathShala_app.html`.

**Later (LLM mode):** a Gemini API will be provided. The same agents, prompts, tools and output formats are then driven by the model through a server proxy. **The UI must not change between the two modes.**

---

## 1. Principles (apply in both modes)

1. **The officer decides.** No agent approves a merger, selects an intervention, marks evidence verified or submits a report. Only UI actions by the officer do.
2. **The LLM never invents numbers.** Distances, times, counts and costs always come from tools. The drafter may only restate numbers that already appear in tool outputs or evidence rows.
3. **Every claim has a source.** Each finding, evidence item and draft sentence carries references (evidence IDs `E…` or policy chunk IDs `C…`). An output without references fails validation.
4. **Say "Data unavailable".** When a tool returns nothing, agents must say so. They must never fill the gap.
5. **Keep reported, verified, calculated and needs-verification apart.**

| Status | Meaning |
|---|---|
| `reported` | A citizen said it. |
| `verified` | A government field observation or field answer confirms it. |
| `calculated` | A tool computed it (GIS, SQL). |
| `needs` | Required, but not yet known. |

6. **Policy text and agent interpretation are shown separately.** Quote the retrieved chunk as-is, and give the interpretation as separate text.
7. **Structured output only.** Every agent returns JSON matching the schemas in section 5. The runner validates it with Ajv; if validation fails, the runner retries once, then falls back to the simulated result and logs this.

---

## 2. Agent roster

All agents live in `src/agent/agents/`. Each exports `{ id, systemPrompt, tools, outputSchema, simulate(ctx) }`. `simulate()` is the current prototype logic, moved from `v5_case.js`. It must produce the same output the LLM is asked to produce.

| # | Agent | Job | Tools it may call | Writes to | UI step |
|---|---|---|---|---|---|
| 1 | **Coordinator (Case Investigator)** | Plans the investigation, calls specialists in order, merges their results into findings | all specialists (agent-as-tool) | `agent_steps`, `findings`, `evidence` | Investigate |
| 2 | **Access Analyst** | Students affected, walking and road routes, terrain hazards, transport at school times | `sql_query`, `school_profile`, `route_calc`, `gis_overlay`, `transport_lookup` | evidence E2–E5, E7, E10 | Access, Investigate |
| 3 | **Community Analyst** | Retrieves feedback, classifies by theme, finds recurring concerns, separates reported from verified | `feedback_search`, `classify_feedback`, `recurring_concerns`, `field_observations` | evidence E1, E6, E8, E9 | Community, Investigate |
| 4 | **Gap Finder** | Lists what is still unknown and writes targeted field questions for *this* case | `evidence_gaps` | `field_questions` | Investigate |
| 5 | **Evidence Updater** | After field answers, updates evidence statuses and finding statuses | `apply_field_answers` | `evidence`, `findings` | Investigate |
| 6 | **Policy Researcher** | Retrieves policy passages relevant to the findings, proposes interventions, explains relevance | `policy_retrieve`, `cost_calc` | `interventions` | Policy & cost |
| 7 | **Report Drafter** | Writes the rationale from case evidence only, with a reference on each sentence | `get_case_evidence` | `reports.draft` | Report |
| 8 | **Report Critic** | Checks the draft: every sentence referenced, no numbers missing from evidence, no approval language. Sends it back to the Drafter at most twice | `get_case_evidence` | reviews the draft before it is shown | Report |

**Merge-side agents (already in the UI as rules):**
- **Merge Planner:** `evalPair` and the combined capacity check.
- **Success Monitor:** success score and problems.
- **Survey Builder:** unknown data points plus the questions.

Keep these deterministic for now. They get the same `agents/*.js` shape so they can be LLM-assisted later, but they are not required for the demo.

**Order of the investigation run** (matches the 8 steps the UI shows today):

1. Analysed affected students (Access Analyst → `sql_query`)
2. Checked routes (Access Analyst → `route_calc`)
3. Checked GIS layers along the route (Access Analyst → `gis_overlay`)
4. Checked transport (Access Analyst → `transport_lookup`)
5. Analysed community feedback (Community Analyst → `feedback_search`, `classify_feedback`)
6. Identified recurring concerns (Community Analyst → `recurring_concerns`)
7. Cross-checked field observations (Community Analyst → `field_observations`)
8. Found evidence gaps (Gap Finder → `evidence_gaps`), then the Coordinator writes findings, evidence and field questions

In LLM mode the Coordinator may choose the order, but the runner must still emit one UI step per tool call, with `label`, `tool`, `input`, `output` and `summary`.

---

## 3. System prompts

Store each prompt in `src/agent/prompts/<agent>.md` and load it with Vite `?raw`. Placeholders in `{{…}}` are filled by the runner.

### 3.1 Coordinator

```
You are the Case Investigator for PathShala, a tool used by District and Block Education Officers in Himachal Pradesh to assess proposed school consolidations.

Case: {{case_id}} — {{school_a}} (would close) → {{school_b}} (would receive). District {{district}}, block {{block}}.

Your job: find evidence, identify problems, find what is missing, and ask the right field questions. You do not recommend or approve the merger; the officer decides.

Work in this order unless the evidence requires otherwise:
1. Ask the Access Analyst for affected students, routes, terrain and transport.
2. Ask the Community Analyst for feedback themes, recurring concerns and field observations.
3. Ask the Gap Finder for missing evidence and targeted field questions.
4. Combine the results into findings.

Rules:
- Use only tool outputs. Never state a number that is not in a tool output.
- Every evidence item must have a status: reported, verified, calculated or needs.
- If data is missing, say "Data unavailable".
- A finding is a potential issue until field verification or a government observation confirms it.
- Return JSON matching the Findings schema. No prose outside the JSON.
```

### 3.2 Access Analyst

```
You analyse physical access for case {{case_id}}.
Call sql_query for the habitations served by {{school_a}}, route_calc for walking and road routes to {{school_b}}, gis_overlay on the walking and road routes, and transport_lookup for school-time transport.
Report: students and habitations affected (with girls and children with disabilities), walking km and minutes for a young child, road km and minutes, hazards on each route, and transport at school times.
Walking time comes from route_calc (Tobler's hiking function × child pace); never estimate it yourself.
Transport with no timetable data is "Data unavailable", status needs.
Return JSON matching the EvidenceBundle schema.
```

### 3.3 Community Analyst

```
You analyse community feedback for case {{case_id}}.
Call feedback_search for {{school_a}}, {{school_b}} and their habitations. Classify each message into exactly one theme from this fixed list: Transport, Seasonal access, Safety, Facilities, Other. Do not invent new themes; use Other.
A message is "verified" only if it is linked to a field observation; otherwise it is "reported".
Call recurring_concerns (rule: a theme with at least 10 responses, or from at least 3 habitations) and field_observations.
Quote messages exactly; keep the Hindi original and the English translation.
Return JSON matching the EvidenceBundle schema, with theme counts and message IDs for every count.
```

### 3.4 Gap Finder

```
You find missing evidence for case {{case_id}}, given the current findings and evidence.
List each gap that would change the officer's assessment (for example bridge passability in heavy rain, number of students who use the route, public transport at school times, travel time during school hours, photo or GPS evidence).
For each gap write ONE field question specific to this case, naming the actual place (for example "Is the Baridropa–Jawal footbridge passable during heavy rain?").
Answer types: choice (give options), number, minutes, evidence (photo / GPS / note).
Maximum 6 questions. No generic survey questions.
Return JSON matching the FieldQuestions schema.
```

### 3.5 Evidence Updater

```
You update case {{case_id}} after field verification. Input: the field answers and the current evidence.
Map each answer to evidence and finding statuses:
- Crossing not passable or seasonal → Seasonal access = Verified.
- Public transport "No" → evidence E5 = verified "Public transport unavailable during school hours"; Transport = Confirmed concern.
- A student count or a measured time → new verified evidence items.
Never change a status without a field answer or observation to support it.
Return JSON matching the EvidenceUpdate schema.
```

### 3.6 Policy Researcher

```
You connect the case findings to government policy for case {{case_id}}.
Call policy_retrieve with a query built from the findings. Use only the returned chunks.
For each potential intervention:
- policy_requirement: the chunk IDs, quoted as-is (never paraphrase the quote).
- interpretation: 1–2 sentences on why it may be relevant to THIS case, referencing evidence IDs.
- cost: call cost_calc with structured inputs; copy its result. Never compute costs yourself.
If no chunk supports an intervention, do not propose it.
Always include the alternative of keeping and repairing School A when a chunk supports it (for example RTE Rule 6(3)).
Return JSON matching the Interventions schema.
```

### 3.7 Report Drafter

```
You draft the justification for case {{case_id}}. Use ONLY the evidence items, field answers, selected interventions and policy chunks provided.
Write 4–7 plain sentences, the way an Indian district education office would write: affected students and habitations; distance and travel time; recurring community concerns; field verification; the selected intervention and its policy basis; "subject to applicable eligibility and administrative approval".
Every sentence must end with its references, for example [E1, E6] or [C6].
Do not recommend approving the merger. Do not use numbers that are not in the evidence.
Return JSON matching the Draft schema.
```

### 3.8 Report Critic

```
You check a draft against the case evidence.
Fail the draft if any sentence has no reference, cites an ID that does not exist, contains a number not found in the cited evidence, uses approval language ("approved", "recommended to merge"), or omits an outstanding verification item.
Return JSON matching the Critique schema: {pass: boolean, issues: [{sentence_index, problem, fix}]}.
```

---

## 4. Tools

Implement every tool in `src/agent/tools.js` as `async (input) => output` over sql.js. Also export `toolSchemas`, an array in Gemini function-declaration format (`name`, `description`, `parameters` as JSON Schema). The same functions run in both modes: in LLM mode the proxy sends tool calls back to the browser (see section 7), or the tools are moved into the proxy on a server-side copy of SQLite.

| Tool | Input | Output | Notes |
|---|---|---|---|
| `sql_query` | `{sql: string}` | `{rows: object[]}` | **Read-only.** Reject anything that is not `SELECT`/`WITH`. Allow only the tables listed in `schema.js`. |
| `school_profile` | `{school_id}` | school row + `school_facts` + habitations | |
| `nearby_schools` | `{school_id, max_km=12}` | `[{school_id, road_km, walk_min, capacity, available, hazards, score, parts[], estimated}]` | Screening score as in the prototype: 100 − 2×road km − seats penalty − 0.1×(walk min − 30) − 5×hazards. |
| `route_calc` | `{from_id, to_id, mode: "walk" \| "road"}` | `{km, minutes, climb_m, descent_m, max_slope_pct, steep_km, profile[[km, elev]]}` | Walking: Tobler `6·e^(−3.5·|slope+0.05|)` km/h × `child_pace` (rule R13). Road: `links.road_min`. LLM mode later: Google Routes API + Elevation API. |
| `gis_overlay` | `{from_id, to_id, route: "walk" \| "road", buffer_m=150, layers[]}` | `[{feature_id, kind, name, season, detail, source_url}]` | From `geo_features`. LLM mode later: Earth Engine (JRC surface water, slope). |
| `transport_lookup` | `{habitation_ids[], windows=["08:15-09:15","14:45-15:45"]}` | `[{name, kind, departures[], at_school_time[], available}]` | "Data unavailable" when there are no departures. |
| `feedback_search` | `{school_ids[], hab_ids?, theme?, limit?}` | `[{fb_id, hab, theme, text_hi, text_en, status, verified_by, channel, received}]` | |
| `classify_feedback` | `{fb_ids[]}` | `{themes: {name: {count, verified, habitations, fb_ids[]}}}` | Mock mode uses the stored `theme` column. LLM mode sends Gemini batches of 20 with the fixed theme list and structured output. |
| `recurring_concerns` | `{themes}` | `[theme]` | Rule: ≥10 responses or ≥3 habitations; excludes Other. |
| `field_observations` | `{school_id}` | `field_obs` rows | |
| `evidence_gaps` | `{case_id}` | `[{gap, why, suggested_type}]` | Rule-based list today (see `agentPlan` in `v5_case.js`). |
| `apply_field_answers` | `{case_id, answers{Q1..Q5}}` | `{evidence_changes[], finding_changes[]}` | Port of `applyField()`. |
| `policy_retrieve` | `{query, k=5, doc_ids?}` | `[{chunk_id, doc_title, section, text, url, verbatim, score, hits[]}]` | See section 6. |
| `cost_calc` | `{intervention: "TR" \| "ES" \| "SEA" \| "RET", inputs{}}` | `{inputs[[label, value, source]], formula, cost_inr, cost_type}` | Deterministic. Uses the rules table (R6 ₹6,000, R8 classroom cost, R14 vehicle seats). **The only source of costs.** |
| `get_case_evidence` | `{case_id}` | findings + evidence + field answers + selected interventions + cited chunks | Drafter and Critic input. |

Every tool call is written to `agent_steps` (case_id, seq, label, tool, input JSON, output JSON, summary) and is visible in the UI when a step is expanded.

---

## 5. Output schemas

Put these in `src/agent/schemas/*.json` (JSON Schema draft 2020-12) and validate every agent output with Ajv.

- **Findings**
  - top level: `{findings: [{fid, title, kind: primary|secondary|context, severity: high|medium|low, summary, status, evidence: [Evidence]}], gaps: [string]}`
  - Evidence: `{eid, kind: feedback|gis|data|transport|field|policy, status: reported|verified|calculated|needs, label, detail, ref}`
- **EvidenceBundle:** `{evidence: [Evidence], metrics: {…free-form numbers from tools…}}`
- **FieldQuestions:** `{questions: [{qid, text, type: choice|number|minutes|evidence, options?: [string], gap}]}` (max 6)
- **EvidenceUpdate:** `{evidence_changes: [{eid, status, label?, detail?}], finding_changes: [{fid, status}], new_evidence: [Evidence]}`
- **Interventions:** `{interventions: [{code, title, chunk_ids: [string], interpretation, evidence_refs: [string], cost: CostCalcOutput}]}`
- **Draft:** `{sentences: [{text, refs: [string]}]}`
- **Critique:** `{pass: boolean, issues: [{sentence_index, problem, fix}]}`

The UI renders from the database tables. Agents write through small repository functions (`case/findings.js`), never with raw SQL built from model text.

---

## 6. Retrieval (RAG) setup

### 6.1 Corpora

| Corpus | Table (now) | Contents | Used by |
|---|---|---|---|
| **Policy** | `policy_docs`, `policy_chunks` | RTE Rules 2010 Rule 6 (1a, 1b, 3, 4, 7), Samagra Shiksha transport/escort norm (₹6,000 per child per year, appraised on distance and terrain), DBT option, residential schools, HP merger decision of 7 June 2025 (2 km, extended to 3 km), NEP 2020 school complexes (5–10 km), HP High Court Sandyar judgment | Policy Researcher, Drafter |
| **Community** | `citizen_feedback`, `feedback` | Citizen messages (Hindi and English) with habitation, theme and status | Community Analyst |
| **Case memory** | `findings`, `evidence`, `field_questions`, `case_log` | Everything already established in this case | Drafter, Critic, Coordinator on re-runs |
| **Precedents** | `precedents` | Real HP, UP and MP merger cases with outcomes | Policy Researcher (similar cases) |

### 6.2 Chunking and metadata

- One chunk per rule, sub-rule or norm paragraph. Never split a sub-rule across chunks.
- Metadata on each chunk: `chunk_id`, `doc_id`, `section`, `issuer`, `year`, `url`, `jurisdiction` (India / HP), `verbatim` (1 = exact source wording, 0 = close paraphrase, labelled in the UI), `keywords`.
- To add a document, write rows to `policy_docs` and `policy_chunks` (see `data/case_data.py`), then run `npm run seed`.

### 6.3 Retrieval now (mock mode)

- BM25 over `text + keywords + section`, as in `retrieve()` in `v5_case.js`. Return the top-k results with scores and matched terms, shown in the UI.
- The query is built from the finding titles plus fixed terms (`transport escort distance terrain flood bridge habitation seasonal walking`).

### 6.4 Retrieval later (LLM mode)

- Embeddings: Vertex AI text embeddings (`gemini-embedding-001`, or the current recommended model), 768 dimensions. Store vectors in a `policy_vectors` table for the demo, or in Vertex AI Vector Search / RAG Engine when deployed.
- Hybrid search: BM25 score and cosine score, combined with reciprocal rank fusion, top 5.
- Filter by jurisdiction (always include India; include HP when the case is in HP).
- Grounding rule: the Policy Researcher may only cite `chunk_id`s returned by `policy_retrieve` in the same run. The runner rejects any other ID.
- Optional: Gemini grounding with Google Search, **off by default**. Anything found this way must be shown as "web source, not in the policy corpus".

### 6.5 Retrieval tests

Add `tests/retrieval.spec.js`:
- The query from the reference case must return C3 (RTE 6(3)) and C6 (Samagra transport) in the top 3.
- The query "walking distance primary" must return C1 first.

---

## 7. Modes and configuration

`.env`:

```
VITE_AGENT_PROVIDER=simulated        # simulated | gemini
VITE_AGENT_ENDPOINT=/api/agent       # used only when provider = gemini
VITE_AGENT_STEP_DELAY_MS=420         # animation delay for simulated steps
```

**`SimulatedProvider` (default, now):** runs each agent's `simulate(ctx)` and calls the real tools, so outputs match the prototype exactly. It streams steps with the delay above.

**`GeminiProvider` (later):** implement it against this contract, and leave it stubbed with TODOs now.

**Request, browser to proxy:**

```
POST /api/agent
{
  "agent": "coordinator",
  "case_id": "C1",
  "system": "<prompt>",
  "messages": [...],
  "tools": toolSchemas,
  "response_schema": <schema>
}
```

**Responses, proxy to browser, streamed as NDJSON:**
- `{"type": "tool_call", "name": "...", "args": {...}, "call_id": "..."}`: the browser runs the tool locally on sql.js, then POSTs `{call_id, output}` back.
- `{"type": "final", "json": {...}}`: validated against the schema, then written to the DB.

**Proxy:** Cloud Run, Node or Python, using Google ADK or plain Vertex AI function calling with Gemini. It holds the API key; **never put keys in the browser**. It logs every call, and uses model temperature 0.2 for analysts and 0.4 for the Drafter.

**Fixtures:** save the simulated outputs of the reference case to `src/agent/fixtures/C1/*.json`. The LLM-mode tests run the same case and assert the same finding statuses, the same cost numbers and a critic pass.

---

## 8. Guardrails checklist

- [ ] `sql_query` is read-only and limited to allowed tables.
- [ ] Every agent output is schema-validated. A failed output is retried once, then the simulated result is used, and the fallback is logged in `case_log`.
- [ ] No number appears in a draft unless it is in the cited evidence (Critic check, plus a regex check in code).
- [ ] Policy quotes are shown exactly as stored. Paraphrased chunks are labelled "close paraphrase".
- [ ] The Approve and Submit buttons are officer-only; no agent can trigger them.
- [ ] Every agent and officer action is written to `case_log` and shown in the Case record timeline.
- [ ] Low-confidence inputs (for example voice transcripts later) are shown as "needs verification".

---

## 9. Research agents (added later)

Transport Planner, Feedback Checker and the AI suggestion run the shared loop in `src/agent/loop.js` over five RAG collections (`src/agent/rag.js`). Full description: `docs/WORKFLOW.md`, section 10. Rules that apply here as in section 1: agents only propose; tools produce every number; every sentence cites evidence ids or passages retrieved in the same run; web results are labelled "Web source, needs verification" and never change an evidence status; a failed or invalid Gemini reply falls back to the simulated step and is logged.
