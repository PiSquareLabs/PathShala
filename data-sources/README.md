# PathShala: Fetched Data Sources

Snapshot of publicly-fetchable data from `pathshala_data_sources.md`, pulled 29 September 2026.
Raw pages are saved as-fetched (HTML/PDF/CSV/JSON) so they can be re-parsed later; this README
is the index and the record of what could and couldn't be retrieved automatically.

## Status

| # | Data | Doc status | Fetch result |
|---|---|---|---|
| 1 | School list, enrolment, teachers, facilities (UDISE+ KYS) | 🟡 | ❌ Landing page saved (`school-merge-data/udise_kys.html`); the actual lookup is a JS app gated behind interactive search — no automated per-school extraction. Needs manual lookup as the source doc says. |
| 2 | School coordinates | 🟡 | ✅ Got both demo schools from the Datameet UDISE export (see below). India Data Portal CKAN resource returned HTTP 500 (server-side, not a block). |
| 3 | Named merge pairs (HP merger list) | ✅ | ✅ `school-merge-data/hp_merger_list.pdf` (2 MB, 20 pages) — downloaded fine despite the source doc's note that the portal blocks automation. `school-merge-data/hp_dse_announcements.html` also saved. |
| 4 | Merge criteria | ✅ | ✅ `school-merge-data/tribune_merge_criteria.html` |
| 5 | Walking route, distance, time (Google Maps Routes API) | 🟡 | ❌ Needs a Google Maps API key, which this session doesn't have. `routes-geography/google_routes_docs.html` (API docs only) saved for reference. |
| 6 | Elevation and slope | ✅ | ❌ Google Elevation API needs a key. Copernicus DEM needs Earth Engine auth. `routes-geography/ee_copernicus_dem.html` and `routes-geography/google_elevation_docs.html` (catalog/docs pages only) saved. |
| 7 | Water crossings (JRC Global Surface Water) | ✅ | ❌ Actual raster/vector data requires Earth Engine access. `routes-geography/jrc_surface_water.html` (download-page description only) saved. |
| 8 | Snow cover (MODIS) | ✅ | ❌ Same — Earth Engine auth required. `routes-geography/ee_snow.html` saved. |
| 9 | Rainfall history (CHIRPS) | ✅ | ❌ Same. `routes-geography/ee_chirps.html` saved. |
| 10 | Weather forecast (Google Maps Weather API) | ✅ | ❌ Needs API key. `routes-geography/google_weather_docs.html` (docs only) saved. |
| 11 | Landslide susceptibility (GSI Bhukosh) | ✅ | ❌ `bhukosh.gsi.gov.in` refused the connection (TLS reset) on every attempt — likely blocks non-browser clients. `bhusanket.gsi.gov.in` (incident reports) fetched fine: `routes-geography/gsi_bhusanket.html`. |
| 12 | Where homes are (Google Open Buildings v3) | ✅ | ❌ Bulk footprint data is served via Earth Engine / GCS bucket, not a plain download. `routes-geography/google_open_buildings.html` (site) saved. |
| 13 | Footpaths, bridges (OpenStreetMap/Overpass) | 🟡 | ❌ Both `overpass-api.de` and `overpass.kumi.systems` reset the connection on the actual query API (likely not on the egress allowlist), even though `overpass-turbo.eu` itself loaded fine. `routes-geography/overpass_turbo.html` saved; the query is in the section below if you want to run it yourself once that host is allowed. |
| 14 | Central RTE rules (Indian Kanoon) | ✅ | ✅ `policy-budget/indiankanoon_rte_rules.html` |
| 15 | HP RTE rules | 🟡 | 🟡 `school-merge-data/hp_dse_home.html` saved (portal home) — same ambiguity the source doc flags (2011 Rules vs a 2026 "HP Rules, 2025" notice); didn't find a page that resolves which is current. |
| 16 | Transport/escort norm and unit cost (Samagra Shiksha) | ✅ | ✅ `policy-budget/samagra_shiksha_financial_norms.pdf` (33 pages) |
| 17 | HP PAB minutes 2025-26 | ✅ | ❌ The URL in the source doc (`dsel.education.gov.in/sites/default/files/pab/hp2526.pdf`) now 404s — the site's been rebuilt as a client-rendered Next.js app and the direct PDF link has moved. Couldn't locate the new path without a browser session. |
| 18–19 | Precedents (in-state and other-state) | ✅ | ✅ All 7 case articles fetched into `precedents/` |
| 20–24 | Synthesised data (feedback, voice notes, attendance, child counts, budget balance) | 🧪 | Not fetched — these are meant to be generated/simulated per the source doc, not pulled from a live source. |
| 25 | Child-level enrolment records | ❌ | Not available (private government data), as the source doc states. |

## School coordinates found (item 2)

From the Datameet UDISE export (`school-merge-data/datameet_udise_himachal_pradesh.csv`, filtered to Himachal Pradesh, 17,991 rows):

| School | UDISE code | Village | Longitude | Latitude |
|---|---|---|---|---|
| GPS RASHKAR | 2040304201 | MANIKARAN | 77.373333 | 32.016667 |
| GPS UCH (= GPS Uchh) | 2040304111 | BARSHAINY | 77.395556 | 32.005278 |

Straight-line distance is ~2.3 km — consistent with the "within 2 km" merge criterion in `tribune_merge_criteria.html`.

## Folder layout

```
data-sources/
├── school-merge-data/   UDISE+, HP merger list/announcements, merge criteria & scale, coordinates CSV
├── routes-geography/    Earth Engine catalog pages, JRC/GSI/OSM landing pages, Google Maps API docs
├── policy-budget/       RTE Rules text, Samagra Shiksha financial norms PDF
└── precedents/          7 case-law/news articles (RAG corpus)
```

## What's still missing and why

Three real blockers, not just "didn't try":

1. **API keys** — Google Maps Routes, Elevation, and Weather APIs, plus Google Earth Engine (DEM, JRC water, MODIS snow, CHIRPS, Open Buildings) all require credentials this session doesn't have. Only their documentation/catalog pages could be saved.
2. **Hosts that reset the connection** — `bhukosh.gsi.gov.in` and the Overpass API hosts (`overpass-api.de`, `overpass.kumi.systems`) refused every attempt (TLS reset mid-handshake), unlike other government/public sites that worked fine. Possibly not on the environment's egress allowlist, or blocking non-browser clients specifically.
3. **Moved/stale URLs** — the HP PAB minutes PDF link in the source doc 404s; the site migrated to a client-rendered app and the new path wasn't findable without loading it in a real browser.

If you widen network access further or can supply Maps/Earth Engine API keys, I can go back and fill in items 5–10, 12, and 17.

### Overpass query to retry for item 13 (footpaths/bridges near Kullu-I)

```
[out:json][timeout:60];
(
  way["highway"~"path|footway|track"](31.90,77.05,31.98,77.15);
  way["bridge"](31.90,77.05,31.98,77.15);
  node["bridge"](31.90,77.05,31.98,77.15);
);
out geom;
```
POST to `https://overpass-api.de/api/interpreter`.
