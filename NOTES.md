# NOTES

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
