# NOTES

## Demo video
`docs/demo/pathshala-demo.mp4` (about 6 minutes, captions and a Piper (offline neural TTS) voice-over) is recorded by `scripts/record-demo.mjs` (Playwright drives the built app) and converted by `scripts/make-demo.sh` (needs a full ffmpeg, for example `pip install imageio-ffmpeg`). It emphasises the Feedback step. Upload it to YouTube (unlisted or public) or Google Drive ("Anyone with the link") for the hackathon submission.

## Changes from the original prototype

- **Investigate flow.** The prototype compared one closing school with one receiving school. An investigation (`investigations`) is now
  one closing school and one or more candidate receiving schools. Each candidate is a track (a row of `cases`, id like `C1-GSH`) with its
  own findings, field answers, interventions and report. Nothing is chosen on the compare screen: the officer investigates every
  school, answers the field questions and picks interventions for each, compares the totals on the last step, and only then chooses
  one (`investigations.chosen_id`). The report is written for the chosen school.
- **Fewer steps and less clutter.** Six steps became five (Access and Community are one Evidence step; the last step is choose and report). Secondary detail sits in
  collapsible sections (`ui/kit.js` `fold`). The header has three tabs (Investigate, Merges, To do) and a More menu (Feedback,
  Rules, SQLite, Reset). Problems and Field surveys are tabs of one To do page.
- **Data audit** (see README): no field is shown without a source. Data that is not available says "Data unavailable".
- Costs are never invented. The crossing-guard and girls'-safety plan items are "Not costed" (no official norm).
- Leaflet animations are switched off for programmatic moves (a zoom animation still running when the page re-renders throws
  inside Leaflet on the removed map).
- Fonts come from Google Fonts; offline, system fonts are used.
- `sql_query` may read any table in the database; it rejects everything except a single `SELECT` or `WITH` statement.
- The grounding rule "only cite policy chunks retrieved in the same run" is enforced by the runner for the Gemini provider only.

## Known limits

- **Only the Pekhri-2 area has surveyed routes.** Other pairs get straight-line estimates (labelled), "Data unavailable" for the
  elevation profile and hazards, and a finding that says the route has not been surveyed.
- **Citizen feedback is synthetic and about one merge** (Pekhri-2 to Gushaini). It is therefore shown only for Gushaini; other
  receiving schools show "Data unavailable". The messages repeat the same sentences many times across habitations, so theme counts
  are counts of those rows.
- **A middle school (GMS Nahin) has no candidate receiver:** the rule needs another middle or senior school within 12 km, and the
  demo data has none.
- Policy item pages never show "Last updated" (`implOf()` does not select `updated_on`); left as in the prototype.
- One legacy column, `schools.anganwadi_on_site`, is unused by the UI.
- The precedent "GPS Rashkar to GPS Uchh" is spelled "Uchh" in one precedent row and "Uch" in the schools table.

## Saved data

The app saves its SQLite database in `localStorage` (`pathshala.db.v7`). When the seed schema changes, `openDb()` compares the saved
tables and columns with the seed's and discards a stale save (and deletes older keys), so an old browser copy can never cause
errors such as "no such column". Bump `STORE` in `src/db/sqlite.js` as well when you change the schema.

## Real UDISE+ data and the Merges page
- Five UDISE+ School Report Cards 2025-26 (GMS Nahin, GPS Jiyani, GPS Jana, GPS Dobhi, GPS Soyal) are parsed from `data/udise/*.pdf` (`parse_udise.py`) and override the school rows and `school_facts` (rooms by condition, girls'/boys'/CwSN toilets, ramp, handrails, water, electricity, road, enrolment by sex, CwSN, established year, cluster). `head_teacher` was dropped: the cards do not record it. NULL shows as "Not recorded".
- The To do and Field surveys tabs and pages are removed. `#/merges` is a grid of tiles, one per merge; problems and the survey form still live inside each merge page.

## Feedback step and Gemini
- New step 2 "Feedback" (per receiving school). Messages about the closing school and about the receiving school are pooled, then classified into Transportation, Safety, Terrain and weather, Social, Others, each with a subject (closing school / receiving school / the merger) and a sentiment. Stance on merging is derived by a fixed rule (good about the receiver or bad about the closing school supports; the reverse does not), never by the model.
- One category agent per class summarises the concerns; counts and stance come from the database. Summaries carry into Evidence, Investigate and the report draft (references like `K:Transportation`, accepted by the critic).
- Classification is hardcoded (a table for every demo message, keyword rules for new ones); Gemini is used only for the category agents' summaries. Gemini proxy: POST /chat with header `X-API-Key`. The key is entered on More > AI connection and kept in localStorage only; it is not in the source or the build. Without a key, rule summaries are used (labelled "rules"). A failed call falls back to rules.
- `tests/live-gemini.spec.js` runs against the real proxy only when `LLM_KEY` is set.

- Every school except Gushaini now has 5–8 synthesised messages about it (PathShala, generic wording, some about the school as the closing side, some as the receiving side); Gushaini keeps its 87. All are in the hardcoded classification table.

- Home page has a "Quick demo: guide me" button (`src/ui/demo.js`): a 12-step coach panel that highlights each input and offers "Do it for me" per step (GPS Pekhri-2 with Gushaini and Nagini).
