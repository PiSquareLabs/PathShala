# PathShala: Data Sources

Demo state: **Himachal Pradesh**. Demo merge group: **GPS Rashkar → GPS Uchh (Kullu-I block, Kullu)**.
Last verified: 29 September 2026.

**Status key:** ✅ Real and verified · 🟡 Real but partial or manual · 🧪 Synthesised for demo · ❌ Not available

---

## 1. Summary

| # | Data | Status | Source | Used in step |
|---|---|---|---|---|
| 1 | School list, enrolment, teachers, facilities | 🟡 | UDISE+ Know Your School | Pull group data, Verify |
| 2 | School coordinates | 🟡 | India Data Portal, Datameet | Pull group data |
| 3 | Named merge pairs | ✅ | HP Directorate of School Education merger list | Pull group data |
| 4 | Merge criteria | ✅ | The Tribune (HP proposal, June 2025) | Rules and costs |
| 5 | Walking route, distance, time | 🟡 | Google Maps Routes API | Pull group data |
| 6 | Elevation and slope | ✅ | Google Elevation API, Copernicus DEM | Pull group data, Verify |
| 7 | Water crossings (seasonal/permanent) | ✅ | JRC Global Surface Water (Earth Engine) | Verify |
| 8 | Snow cover | ✅ | MODIS MOD10A1 / MOD10A2 (Earth Engine) | Verify |
| 9 | Rainfall history | ✅ | CHIRPS (Earth Engine) | Verify |
| 10 | Weather forecast | ✅ | Google Maps Weather API | Verify, alerts |
| 11 | Landslide susceptibility | ✅ | GSI National Landslide Susceptibility Mapping (Bhukosh) | Verify |
| 12 | Where homes are | ✅ | Google Open Buildings v3 | Pull group data |
| 13 | Footpaths, bridges | 🟡 | OpenStreetMap (Overpass) | Pull group data |
| 14 | Central RTE rules | ✅ | RTE Rules 2010 (Indian Kanoon) | Rules and costs |
| 15 | HP RTE rules | 🟡 | HP Directorate of School Education | Rules and costs |
| 16 | Transport/escort norm and unit cost | ✅ | Samagra Shiksha financial norms | Rules and costs |
| 17 | HP budget approvals 2025-26 | ✅ | Samagra Shiksha PAB minutes, HP | Rules and costs |
| 18 | In-state precedents | ✅ | The Tribune, LiveLaw, City Air News | Rules and costs (RAG) |
| 19 | Other-state precedents | ✅ | Scroll, Careers360, The Federal, The Wire | Rules and costs (RAG) |
| 20 | Citizen feedback | 🧪 | Synthesised from real complaint patterns | Cluster feedback |
| 21 | Voice notes (Hindi) | 🧪 | Recorded or generated | Intake |
| 22 | Attendance before/after merge | 🧪 | Synthesised | Verify |
| 23 | Children aged 3–6 per village | 🧪 | Estimated from village population | Candidate P7 |
| 24 | District budget balance | 🧪 | Synthesised | Rules and costs |
| 25 | Child-level enrolment records | ❌ | Private government data | Not used |

---

## 2. School and merge data

### 2.1 UDISE+ Know Your School
- **Link:** https://kys.udiseplus.gov.in/
- **Gives:** School name, UDISE code, enrolment, teachers, classrooms, toilets, facilities.
- **Status:** 🟡 Public, no login. The site blocks automated access, so look up the demo schools by hand.
- **To do:** Look up GPS Rashkar and GPS Uchh (enrolment, teachers, coordinates).

### 2.2 School coordinates
- **India Data Portal – UDISE basic details:** https://ckandev.indiadataportal.com/dataset/udise/resource/457fddf1-982f-4c85-855d-5095578accc1
- **Datameet UDISE schools:** https://github.com/datameet/udise_schools
- **Gives:** Latitude and longitude per school.
- **Status:** 🟡 Coverage is incomplete (about 85% in one scrape). Fall back to geocoding.

### 2.3 HP merger list (named pairs)
- **Link:** https://himachal.nic.in/ControlsAsync/ViewFTPFile?qs=KI3gZ53zz1ylOlQcY2NRmzoRtmqn7450kUoVBxUxsXZGs0eSbGtHGOM4y9rbds9psBQ1m71Yu7gqvQdtrRySzCdSpVnEosLB
- **Other merger PDFs:** https://himachal.nic.in/dse/Content/AllAnnouncements
- **Gives:** District, block, sending school → receiving school.
- **Sample row:** Kullu · Kullu-I · GPS Rashkar → GPS Uchh
- **Status:** ✅ The site blocks automated download; open it in a browser.

### 2.4 Merge criteria
- **Link:** https://www.tribuneindia.com/news/himachal/100-schools-to-be-shut-400-merged-in-himachal-proposal-forwarded
- **Gives:**
  - Primary schools with ≤5 students → nearest school with >5 students within 2 km.
  - Middle schools with 1–10 students → nearest middle/high/senior secondary school with >10 students.
  - Zero-enrolment schools → de-notified.
- **Status:** ✅ Fetched and read.

### 2.5 Merge scale
- **Link:** https://www.cityairnews.com/content/merger-of-boys-girls-schools-cancelled-at-four-locations-in-himachal-following-protests
- **Gives:** 532 schools merged and 774 closed (2023 to Jan 2026). Four boys'/girls' mergers cancelled after protests.

---

## 3. Route and geography data

### 3.1 Google Maps Routes API
- **Docs:** https://developers.google.com/maps/documentation/routes
- **Gives:** Distance, duration, polyline, legs, steps, travel advisory.
- **Caveat:** Walking mode is in beta and may miss footpaths, and apps must show users a warning. Hill routes need field confirmation.
- **Status:** 🟡 Needs an API key; not yet run for the demo route.

### 3.2 Elevation / DEM
- **Google Elevation API:** https://developers.google.com/maps/documentation/elevation
- **Copernicus DEM GLO-30 (Earth Engine):** https://developers.google.com/earth-engine/datasets/catalog/COPERNICUS_DEM_GLO30
- **Gives:** 30 m elevation, used for slope-adjusted walking time.

### 3.3 JRC Global Surface Water
- **Link:** https://global-surface-water.appspot.com/download
- **Gives:** Where and how often surface water occurs (1984 onward), seasonality. Used to find stream crossings.

### 3.4 MODIS snow cover
- **Link:** https://developers.google.com/earth-engine/datasets/tags/snow
- **Gives:** Daily and 8-day snow cover at 500 m. Used for the winter hazard.

### 3.5 CHIRPS rainfall
- **Link:** https://developers.google.com/earth-engine/datasets/catalog/UCSB-CHG_CHIRPS_DAILY
- **Gives:** Rainfall history at 0.05°, used to identify dangerous monsoon months.

### 3.6 Google Maps Weather API
- **Link:** https://developers.google.com/maps/documentation/weather/current-conditions
- **Gives:** Current conditions, 10-day hourly/daily forecast, precipitation type and amount, 24-hour history.
- **Use:** Rain or snow alerts on a route before the school day.

### 3.7 GSI landslide susceptibility
- **Bhukosh portal:** https://bhukosh.gsi.gov.in/
- **Incident reports (Bhusanket):** https://bhusanket.gsi.gov.in/
- **Gives:** High/moderate/low susceptibility at 1:50,000 scale, plus a landslide inventory.
- **Sample:** GSI report on July–August 2023 landslides in Kullu, Banjar, Manali and Anni subdivisions.
- **Caveat:** 1:50,000 scale is good for flagging zones, not exact paths.

### 3.8 Google Open Buildings v3
- **Link:** https://sites.research.google/gr/open-buildings/
- **Gives:** Building footprints (India covered), area, confidence. Used to locate homes in each village.

### 3.9 OpenStreetMap
- **Link:** https://overpass-turbo.eu/
- **Gives:** Footpaths, streams, bridges, roads.
- **Status:** 🟡 Coverage in Parvati Valley not yet checked.

---

## 4. Policy and budget data

### 4.1 Central RTE Rules, Rule 6
- **Link:** https://indiankanoon.org/doc/42884596/
- **Rules used:**
  - Neighbourhood school within 1 km (Classes 1–5) and 3 km (Classes 6–8).
  - In difficult terrain, the distance limit must be reduced.
  - Small hamlets with no school in reach → free transport or residential facilities.

### 4.2 HP RTE Rules
- **Link:** https://himachal.nic.in/dse
- **Status:** 🟡 The DSE site lists the HP Rules, 2011, and a 2026 notice refers to "HP Rules, 2025". Confirm which version is current before citing.

### 4.3 Samagra Shiksha financial norms
- **Link:** https://samagrashiksha.in/(X(1)S(e3s00g555ql1brin32grcm45))/download/AWP&B/norms.pdf
- **Gives:** Transport/escort up to an average of ₹6,000 per child per year, can be paid by DBT based on attendance.

### 4.4 HP PAB minutes 2025-26
- **Link:** https://dsel.education.gov.in/sites/default/files/pab/hp2526.pdf
- **Key figures:**
  - Transport/escort: 2,591 children in remote habitations × ₹6,000 = ₹155.46 lakh. Conditions: habitation more than 1 km / 3 km away, DBT linked to attendance, at least 10% attendance improvement expected.
  - 1,340 habitations (4.48%) without access to a primary school.
  - 3,153 primary schools with fewer than 15 students (2023-24).
  - Single-teacher schools: 3,265 → 3,462.
  - Total approved: ₹88,617.41 lakh (including spillover).
- **Status:** ✅ Fetched and read.

---

## 5. Precedents (RAG corpus)

| Case | Outcome | Link |
|---|---|---|
| GPS Rashkar → GPS Uchh (Kullu, HP) | High Court stayed it; route unsafe in rain and winter (Sept 2024) | https://www.tribuneindia.com/news/himachal/himachal-pradesh-high-court-stays-notification-on-merger-of-schools |
| GMS Sandyar → GSSS Chhat (Bilaspur, HP) | High Court upheld it; no distance grievance (2026) | https://www.livelaw.in/high-court/himachal-pradesh-high-court/hp-high-court-upholds-merger-government-middle-school-551937 |
| Dharamsala girls' school merger (HP) | Student and parent protests (Mar 2026) | https://www.tribuneindia.com/news/himachal/students-parents-oppose-merger-of-girls-boys-schools-in-dharamsala/ |
| Rajasthan mergers | Some reversed where children stopped coming (streams, highways) | https://scroll.in/article/835687/cramped-classrooms-long-commutes-dropouts-the-impact-of-rajasthans-school-mergers |
| Odisha rationalisation | High Court quashed order; unsafe walks through forest and streams | https://news.careers360.com/odisha-schools-closed-niti-aayog-bjp-congress-villages-rte-education-covid-19 |
| Andhra Pradesh GO 117 | Scrapped in Jan 2025 after families shifted to private schools | https://thefederal.com/category/states/south/andhra-pradesh/jagans-education-reforms-axed-teachers-happy-but-fear-new-problems-167312 |
| Uttar Pradesh pairing (2025) | Protests; pairings beyond 1 km reversed | https://m.thewire.in/article/education/up-school-merger-sparks-protests-across-state-opposition-parties-unions-demand-rollback |

---

## 6. Synthesised data (label as simulated in the demo)

| Data | How to generate |
|---|---|
| Citizen feedback (~100 messages) | Based on real complaint types: distance, safety, water crossings, snow, overcrowding, cost, communication |
| Voice notes (5–10, Hindi) | Record or generate from the feedback text |
| Attendance before/after merge | Simple weekly series per village; drop on hazard months for the red group |
| Children aged 3–6 per village | Estimate from village population |
| District budget balance | Plausible balance against the real ₹155.46 lakh HP transport allocation |

---

## 7. Data behind each candidate policy

| Candidate | Data sources |
|---|---|
| P1 Merge as planned | UDISE+, HP merge criteria, Routes API |
| P2 Merge + transport/escort | Routes API, RTE Rule 6, Samagra norms, HP PAB |
| P3 Merge + seasonal plan | JRC water, MODIS snow, CHIRPS, Weather API, Rashkar case |
| P4 Keep and strengthen | GSI landslide map, DEM slope, field answers |
| P5 Partial merge | Routes per village, Open Buildings |
| P6 Fix receiving school first | UDISE+ facilities and teachers, HP PAB gaps |
| P7 Close and redeploy | UDISE+ zero enrolment, anganwadi estimate |
| P8 Reverse / reopen | Attendance, feedback, precedents |

---

## 8. Data behind each feedback question

| Question | Triggered by |
|---|---|
| How long is the walk from [village] to [school]? | Routes API + DEM |
| Is there a stream or river? A bridge? | JRC surface water |
| Which months is the path blocked by snow or rain? | MODIS snow, CHIRPS |
| Has the path had landslides? | GSI susceptibility map |
| Would you use a vehicle or escort? | Candidate P2 |
| Any children who can't make this walk? | UDISE+ CwSN and age counts |
| Does the receiving school have enough rooms and teachers? | UDISE+ facilities |
| How many children start Class 1 in the next 2 years? | Anganwadi estimate |
| Have any children stopped going since the merger? | Attendance drop |
| Is the merger better, same or worse for your child? | All merged groups |

---

## 9. Manual steps before the demo

1. Look up GPS Rashkar and GPS Uchh on UDISE+ Know Your School (enrolment, teachers, coordinates).
2. Run the Routes API walking route once with the API key.
3. Export DEM, JRC water and MODIS snow for Kullu-I block from Earth Engine.
4. Confirm the current HP RTE Rules version.
5. Download the GSI susceptibility layer for Kullu from Bhukosh.
