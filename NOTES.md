# NOTES: things in the prototype that look like bugs

The rule for this rebuild was "keep the behaviour, note it, do not improve the UI". These were all kept as they are.
Each one is a one-line fix if you decide to change it.

## Bugs in the prototype (kept)

1. **Merges map shows "undefined problems to address".** `renderHome` reads `q("SELECT count(*) …").n`, but `q()` returns an
   array. It should be `q1(...)`. It is visible in `reference/screenshots/11_merges_map.png`. (`src/ui/pages/home.js`)
2. **Policy item page never shows "Last updated".** `implOf()` selects `code, status, note` only, so `im.updated_on` is always
   undefined and the line in `renderItem` is dead code. (`src/ui/helpers.js`)
3. **"Schools to review" order.** The acceptance criteria say GPS Pekhri-2 comes first, but the prototype (and its screenshot
   `01_case_map.png`) lists GMS Nahin first (both buildings are flagged; ties sort by enrolment, 21 < 27). The tests check that
   Pekhri-2 is in the list and that the nearby scores are 77, 60, 56, 46, 36. (`src/ui/pages/caseHome.js`)
4. **A case for a school pair with no `links` row breaks.** The walking profile is null and the report, draft and findings code
   dereference it. The investigation now stops with an "Investigation failed" toast instead of hanging on "Investigating…",
   and the case pages show an error card; the underlying gap is unchanged. The seed only has links for the demo pairs.
5. **Interventions hard-code the transport rate.** The prototype used the literal 6000; the rebuild reads rule R6
   (`transport_per_child`, also 6000), so the numbers are identical today and now follow the Rules tab.

## Data observations (seed content was not changed)

- `citizen_feedback` repeats the same Hindi and English message text many times across habitations (for example rows 3, 10, 17
  and 24). The theme counts the reference case depends on (Transport 31, Seasonal access 19, …) are counts of these rows.
  Real messages will not repeat like this.
- All habitation counts, citizen feedback, transport timetables and field answers are labelled `mock` in the UI; school and
  merge rows marked `real` come from UDISE+, HP merger orders and news reports (see `docs/data_sources.md`).
- The precedent "GPS Rashkar to GPS Uchh" is spelled "Uchh" in one precedent row and "Uch" in the schools table.

## Deliberate differences from the prototype

- Leaflet animations are switched off for programmatic moves and zoom (`src/ui/map/baseMap.js`). Otherwise a zoom animation
  that is still running when the page re-renders throws inside Leaflet on the removed map.
- Fonts come from Google Fonts. Offline, the fallback system fonts are used, so line heights differ by a few pixels from the
  reference screenshots.
- `sql_query` may read any table in the database (all are listed in the SQLite tab) rather than a separate allow-list file;
  it rejects everything except a single `SELECT` or `WITH` statement.
- The grounding rule "only cite policy chunks retrieved in the same run" is enforced by the runner for the Gemini provider
  only. The simulated Policy Researcher cites fixed chunk ids (C1 to C7), exactly as the prototype did.
