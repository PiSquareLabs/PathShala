"""Build the raw input tables for the PathShala demo.

Only inputs live here: schools, merges, routes, hazards, feedback, attendance,
rules (with editable parameters), precedents, budget and community answers.
The browser app computes rule checks, merge plans, questions and verdicts
from these tables with SQLite (sql.js).

source='real' rows come from UDISE+, merge orders, court orders, RTE rules and
Samagra Shiksha/PAB documents. source='mock' rows are modelled on reported cases.
"""
import math
import sqlite3
from pathlib import Path

HERE = Path(__file__).parent
DB = HERE / "pathshala_demo.db"
SEED = HERE / "seed.sql"
if DB.exists():
    DB.unlink()
con = sqlite3.connect(DB)
cur = con.cursor()

cur.executescript("""
CREATE TABLE schools (
  school_id TEXT PRIMARY KEY, udise_code TEXT, name TEXT, level TEXT, level_code TEXT,
  district TEXT, block TEXT, village TEXT, lat REAL, lng REAL, loc_note TEXT,
  enrol_total INTEGER, enrol_primary INTEGER, enrol_preprimary INTEGER,
  teachers INTEGER, classrooms INTEGER, anganwadi_on_site INTEGER,
  source TEXT, source_note TEXT);
CREATE TABLE merge_groups (
  group_id TEXT PRIMARY KEY, sending_id TEXT, receiving_id TEXT, district TEXT, block TEXT,
  status TEXT, status_detail TEXT, order_date TEXT, source TEXT, source_url TEXT, created_by TEXT,
  merge_id TEXT);
CREATE TABLE routes (
  group_id TEXT PRIMARY KEY, straight_km REAL, walk_km REAL, walk_min INTEGER,
  climb_m INTEGER, road_km REAL, source TEXT, source_note TEXT);
CREATE TABLE hazards (
  hazard_id INTEGER PRIMARY KEY, group_id TEXT, kind TEXT, label TEXT, months TEXT,
  month_list TEXT, severity TEXT, data_source TEXT, source TEXT);
CREATE TABLE rules (
  rule_id TEXT PRIMARY KEY, name TEXT, statement TEXT, param_name TEXT,
  param_value REAL, unit TEXT, reference TEXT, url TEXT);
CREATE TABLE feedback (
  feedback_id INTEGER PRIMARY KEY, group_id TEXT, received TEXT, channel TEXT, language TEXT,
  sender_role TEXT, text_original TEXT, text_en TEXT, issue TEXT, severity TEXT,
  sentiment TEXT, verification TEXT, verified_by TEXT, source TEXT, based_on TEXT);
CREATE TABLE attendance (group_id TEXT, month TEXT, school_id TEXT, pct REAL, source TEXT);
CREATE TABLE answers (
  group_id TEXT, kind TEXT, choice TEXT, note TEXT, answered_on TEXT, source TEXT,
  PRIMARY KEY (group_id, kind));
CREATE TABLE precedents (
  precedent_id INTEGER PRIMARY KEY, case_name TEXT, state TEXT, year TEXT,
  pattern TEXT, outcome TEXT, url TEXT);
CREATE TABLE budget (item TEXT, district TEXT, amount_inr INTEGER, note TEXT, source TEXT);
CREATE TABLE implementation (group_id TEXT, code TEXT, status TEXT, note TEXT, updated_on TEXT, source TEXT,
  PRIMARY KEY (group_id, code));
CREATE TABLE surveys (survey_id INTEGER PRIMARY KEY, merge_id TEXT, group_id TEXT, field TEXT, value TEXT,
  agent TEXT, done_on TEXT);
""")

schools = [
    ("RSK", "02040304201", "GPS Rashkar", "Primary (pre-primary to 5)", "primary", "Kullu", "Kullu-I",
     "Rashkar, Chhalal panchayat", 32.016667, 77.373333, "Datameet coordinates",
     16, 9, 7, 1, 5, 1, "real", "UDISE+ 2025-26 report card"),
    ("UCH", "02040304111", "GPS Uch", "Primary (1 to 5)", "primary", "Kullu", "Kullu-I",
     "Uch, Barshaini", 32.005278, 77.395556, "Datameet coordinates",
     34, 34, 0, 2, 4, 0, "mock", "Coordinates real; numbers mock"),
    ("SDY", None, "GMS Sandyar", "Middle (6 to 8)", "middle", "Bilaspur", "Ghumarwin",
     "Sandyar", 31.4520, 76.6900, "Approximate location",
     7, 0, 0, 2, 3, 0, "mock", "School and merger real (LiveLaw); numbers mock"),
    ("CHT", None, "GSSS Chhat", "Senior secondary (6 to 12)", "senior", "Bilaspur", "Ghumarwin",
     "Chhat", 31.4556, 76.6934, "Approximate location",
     186, 0, 0, 14, 12, 0, "mock", "School real (LiveLaw); numbers mock"),
    ("NPB", None, "GSSS (Boys) Nurpur", "Senior secondary (6 to 12)", "senior", "Kangra", "Nurpur",
     "Nurpur, near the fort", 32.2998, 75.8872, "Approximate location",
     212, 0, 0, 13, 10, 0, "mock", "School and merger real (The Tribune); numbers mock"),
    ("NPG", None, "Girls PM Shri GSSS Nurpur", "Senior secondary (6 to 12)", "senior", "Kangra", "Nurpur",
     "Nurpur, ward 9", 32.2966, 75.8806, "Approximate location",
     418, 0, 0, 22, 12, 0, "mock", "School and merger real (The Tribune); numbers mock"),
    ("JYN", None, "GPS Jiyani", "Primary (1 to 5)", "primary", "Kullu", "Kullu-II",
     "Jiyani", 31.9255, 77.1540, "Approximate location",
     4, 4, 0, 1, 2, 0, "mock", "Pair on HP merger list; numbers mock"),
    ("BUA", None, "GPS Buai", "Primary (1 to 5)", "primary", "Kullu", "Kullu-II",
     "Buai", 31.9168, 77.1668, "Approximate location",
     41, 41, 0, 3, 5, 0, "mock", "Pair on HP merger list; numbers mock"),
    ("PHL", None, "GPS Phalyani", "Primary (1 to 5)", "primary", "Kullu", "Kullu-II",
     "Phalyani", 31.9050, 77.1300, "Approximate location",
     5, 3, 2, 1, 2, 1, "mock", "Pair on HP merger list; numbers mock"),
    ("BHM", None, "GPS Bhumteer", "Primary (1 to 5)", "primary", "Kullu", "Kullu-II",
     "Bhumteer", 31.8975, 77.1418, "Approximate location",
     28, 28, 0, 2, 4, 0, "mock", "Pair on HP merger list; numbers mock"),
    ("KST", None, "GPS Kasta", "Primary (1 to 5)", "primary", "Kullu", "Naggar",
     "Kasta", 32.1120, 77.1620, "Approximate location",
     5, 5, 0, 1, 2, 0, "mock", "Pair on HP merger list; numbers mock"),
    ("KKR", None, "GPS Kukari", "Primary (1 to 5)", "primary", "Kullu", "Naggar",
     "Kukari", 32.1040, 77.1750, "Approximate location",
     36, 36, 0, 2, 3, 0, "mock", "Pair on HP merger list; numbers mock"),
    ("NER", None, "GPS Neri", "Primary (1 to 5)", "primary", "Kullu", "Kullu-II",
     "Neri", 31.8905, 77.1530, "Approximate location",
     6, 4, 2, 1, 2, 0, "mock", "Mock school near Bhumteer"),
    ("DOB", None, "GPS Dobhi", "Primary (1 to 5)", "primary", "Kullu", "Naggar",
     "Dobhi", 32.1090, 77.1690, "Approximate location",
     4, 4, 0, 1, 2, 0, "mock", "Mock school near Kukari"),
    ("SOY", None, "GPS Soyal", "Primary (1 to 5)", "primary", "Kullu", "Naggar",
     "Soyal", 32.0990, 77.1810, "Approximate location",
     3, 2, 1, 1, 2, 1, "mock", "Mock school near Kukari"),
    ("JNA", None, "GPS Jana", "Primary (1 to 5)", "primary", "Kullu", "Naggar",
     "Jana", 32.1420, 77.1250, "Approximate location",
     4, 4, 0, 1, 2, 0, "mock", "Mock school up the valley from Kukari"),
]
cur.executemany("INSERT INTO schools VALUES (%s)" % ",".join("?" * 19), schools)
pos = {s[0]: (s[8], s[9]) for s in schools}


def km(a, b):
    la1, lo1, la2, lo2 = map(math.radians, (pos[a][0], pos[a][1], pos[b][0], pos[b][1]))
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return round(2 * 6371 * math.asin(math.sqrt(h)), 2)


groups = [
    ("G1", "RSK", "UCH", "Kullu", "Kullu-I", "Stayed",
     "High Court interim stay, Sept 2024: route unsafe for small children in rain and winter",
     "2024-08-17", "real", "https://www.tribuneindia.com/news/himachal/himachal-pradesh-high-court-stays-notification-on-merger-of-schools", "seed", "M1"),
    ("G2", "SDY", "CHT", "Bilaspur", "Ghumarwin", "Merged",
     "Notification 10 June 2026; upheld by High Court (CWP 14564 of 2026)",
     "2026-06-10", "real", "https://www.livelaw.in/high-court/himachal-pradesh-high-court/hp-high-court-upholds-merger-government-middle-school-551937", "seed", "M2"),
    ("G3", "NPB", "NPG", "Kangra", "Nurpur", "Merged",
     "Notification 18 Feb 2026; challenged in High Court (CWP 4056)",
     "2026-02-18", "real", "https://www.tribuneindia.com/news/himachal/after-merger-with-girls-school-government-boys-school-building-in-nurpur-locked/", "seed", "M3"),
    ("G4", "JYN", "BUA", "Kullu", "Kullu-II", "Proposed",
     "On the HP merger list; community questions sent",
     None, "mock", "https://himachal.nic.in/dse/Content/AllAnnouncements", "seed", "M4"),
    ("G5", "PHL", "BHM", "Kullu", "Kullu-II", "Proposed", "Two schools into Bhumteer; community questions sent",
     None, "mock", "", "seed", "M5"),
    ("G6", "NER", "BHM", "Kullu", "Kullu-II", "Proposed", "Two schools into Bhumteer; community questions sent",
     None, "mock", "", "seed", "M5"),
]
cur.executemany("INSERT INTO merge_groups VALUES (?,?,?,?,?,?,?,?,?,?,?,?)", groups)

routes = [
    ("G1", km("RSK", "UCH"), 3.6, 80, 240, 7.8, "mock", "Straight line from real coordinates; walk, climb and road mock"),
    ("G2", km("SDY", "CHT"), 0.5, 8, 20, 1.5, "real", "High Court: 1.5 km by road, 500 m on foot"),
    ("G3", km("NPB", "NPG"), 0.8, 12, 15, 1.1, "mock", "Town route, mock"),
    ("G4", km("JYN", "BUA"), 1.6, 28, 60, 2.2, "mock", "Mock; crosses NH-3"),
    ("G5", km("PHL", "BHM"), 2.1, 40, 110, 3.4, "mock", "Mock; footpath crosses a nallah"),
    ("G6", km("NER", "BHM"), 0.9, 15, 30, 1.2, "mock", "Mock; village path"),
]
cur.executemany("INSERT INTO routes VALUES (?,?,?,?,?,?,?,?)", routes)

hazards = [
    ("G1", "water", "Seasonal stream crossing, no bridge", "Jul to Aug", "7,8", "high", "JRC Global Surface Water", "mock"),
    ("G1", "snow", "Snow and ice on footpath", "Dec to Feb", "12,1,2", "high", "MODIS snow cover", "mock"),
    ("G1", "landslide", "Moderate landslide zone on one stretch", "Monsoon", "7,8,9", "medium", "GSI susceptibility map", "mock"),
    ("G1", "court", "Court found route unsafe for small children", "Rain and winter", "", "high", "HP High Court order, Sept 2024", "real"),
    ("G4", "road", "Crosses the Kullu to Manali highway (NH-3)", "All year", "", "high", "Google Maps route", "mock"),
    ("G5", "water", "Nallah crossing floods after heavy rain", "Jul to Aug", "7,8", "medium", "JRC Global Surface Water", "mock"),
]
cur.executemany("INSERT INTO hazards (group_id, kind, label, months, month_list, severity, data_source, source) VALUES (?,?,?,?,?,?,?,?)", hazards)

T = "https://www.tribuneindia.com/news/himachal/100-schools-to-be-shut-400-merged-in-himachal-proposal-forwarded"
RTE = "https://indiankanoon.org/doc/42884596/"
PAB = "https://dsel.education.gov.in/sites/default/files/pab/hp2526.pdf"
rules = [
    ("R1", "Primary merge limit", "Primary schools at or below this enrolment can merge.", "primary_merge_max", 5, "students", "HP proposal, June 2025", T),
    ("R2", "Merge radius", "The receiving school must be within this straight-line distance.", "merge_radius_km", 2, "km", "HP proposal, June 2025", T),
    ("R3", "Middle merge limit", "Middle schools at or below this enrolment can merge.", "middle_merge_max", 10, "students", "HP proposal, June 2025", T),
    ("R4", "Walk limit, Classes 1 to 5", "A school within this walking distance.", "walk_limit_primary_km", 1, "km", "RTE Rules 2010, Rule 6(1)", RTE),
    ("R5", "Walk limit, Classes 6 to 8", "A school within this walking distance.", "walk_limit_upper_km", 3, "km", "RTE Rules 2010, Rule 6(1)", RTE),
    ("R6", "Transport or escort", "Per child per year for children beyond the limit or on unsafe routes.", "transport_per_child", 6000, "Rs", "RTE Rule 6(4); Samagra Shiksha; HP PAB 2025-26", PAB),
    ("R7", "Students per classroom", "Planning maximum after a merge.", "max_per_classroom", 40, "students", "PathShala planning threshold", ""),
    ("R8", "Classroom cost", "Cost of one additional classroom.", "classroom_cost", 900000, "Rs", "HP PAB 2025-26: 20 rooms for Rs 180 lakh", PAB),
    ("R9", "Pupils per teacher", "Maximum pupils per teacher.", "max_ptr", 30, "students", "RTE Act Schedule", RTE),
    ("R12", "Attendance drop alert", "Drop in attendance, in percentage points, that triggers home visits.", "attendance_drop_pts", 5, "points", "PathShala planning threshold", ""),
]
cur.executemany("INSERT INTO rules VALUES (?,?,?,?,?,?,?,?)", rules)

fb = [
    ("G1", "2026-07-08", "WhatsApp voice", "hi", "Parent", "बरसात में नाला उफान पर होता है, हमारे छोटे बच्चे उच स्कूल तक अकेले नहीं जा सकते।",
     "In the rains the stream floods. Our small children can't go to Uch school alone.", "Route safety", "high", "negative", "verified", "Court order; water layer", "mock", "HP High Court finding"),
    ("G1", "2026-01-21", "WhatsApp voice", "hi", "Parent", "जनवरी-फरवरी में रास्ते पर बर्फ जम जाती है, बहुत फिसलन रहती है।",
     "In January and February the path freezes over and gets very slippery.", "Route safety", "high", "negative", "verified", "Snow layer", "mock", "HP High Court finding"),
    ("G1", "2026-07-15", "WhatsApp voice", "hi", "Parent", "रास्ते में एक जगह पिछले साल भूस्खलन हुआ था।",
     "There was a landslide at one spot on the path last year.", "Route safety", "high", "negative", "partly verified", "GSI moderate zone", "mock", "GSI Kullu report, 2023"),
    ("G1", "2026-08-02", "WhatsApp text", "en", "Rashkar teacher", "We have 9 children in Classes 1 to 5 and 7 in pre-primary aged 3 to 5.",
     "We have 9 children in Classes 1 to 5 and 7 in pre-primary aged 3 to 5.", "Young children", "medium", "neutral", "verified", "UDISE+ 2025-26", "mock", "UDISE+ card"),
    ("G1", "2026-08-02", "WhatsApp voice", "hi", "Anganwadi worker", "आंगनवाड़ी स्कूल परिसर में ही है। 3 से 5 साल के बच्चे यहीं रहें तो अच्छा है।",
     "The anganwadi is on the school premises. It's better if the 3 to 5 year olds stay here.", "Young children", "medium", "neutral", "verified", "UDISE+: anganwadi on site", "mock", "UDISE+ card"),
    ("G1", "2026-08-10", "Letter", "hi", "Village pradhan", "अगर गाड़ी की सुविधा मिले तो गांव मर्जर के लिए तैयार है।",
     "If a vehicle is provided, the village is ready for the merger.", "Transport", "medium", "positive", "unverified", "", "mock", "UP reports"),
    ("G1", "2026-08-12", "WhatsApp text", "en", "Uch teacher", "We have 4 rooms. We can take 9 more children if one more teacher comes.",
     "We have 4 rooms. We can take 9 more children if one more teacher comes.", "Capacity", "medium", "positive", "unverified", "", "mock", ""),
    ("G1", "2026-08-14", "WhatsApp voice", "hi", "Parent", "उच में अध्यापक ज्यादा हैं, पढ़ाई अच्छी होगी।",
     "Uch has more teachers, so studies will be better.", "Quality", "low", "positive", "unverified", "", "mock", "The Tribune"),
    ("G2", "2026-06-14", "Letter", "hi", "School committee", "संडयार स्कूल को उसके स्टाफ के साथ अलग संस्थान के रूप में जारी रखा जाए।",
     "Keep Sandyar running as a separate school with its own staff.", "School identity", "medium", "negative", "verified", "High Court petition", "mock", "LiveLaw"),
    ("G2", "2026-06-12", "Field visit", "hi", "Villager, Ghandalvin", "पंचायत से पूछे बिना फैसला लिया गया।",
     "The decision was taken without asking the panchayat.", "Consultation", "medium", "negative", "verified", "Memorandum to SDM", "mock", "Amar Ujala, June 2026"),
    ("G2", "2026-07-20", "WhatsApp voice", "hi", "Parent", "छत स्कूल पैदल दस मिनट है, बच्चे आराम से जाते हैं।",
     "Chhat is a ten-minute walk. The children go easily.", "Route safety", "low", "positive", "verified", "Court: 500 m on foot", "mock", "LiveLaw"),
    ("G2", "2026-07-22", "WhatsApp voice", "hi", "Parent", "छत में साइंस लैब और ज्यादा अध्यापक हैं।",
     "Chhat has a science lab and more teachers.", "Quality", "low", "positive", "unverified", "", "mock", ""),
    ("G2", "2026-08-05", "WhatsApp text", "en", "Chhat principal", "We absorbed 7 students and 2 teachers. No space problem.",
     "We absorbed 7 students and 2 teachers. No space problem.", "Capacity", "low", "positive", "verified", "Rooms vs enrolment", "mock", ""),
    ("G3", "2026-03-20", "WhatsApp voice", "hi", "Parent", "नया स्कूल भीड़भाड़ वाला है, कमरे कम हैं और खेल का मैदान नहीं है।",
     "The new school is congested. There aren't enough rooms and no playground.", "Capacity", "high", "negative", "verified", "Rooms vs enrolment", "mock", "The Tribune"),
    ("G3", "2026-04-02", "WhatsApp text", "hi", "Student", "एक कमरे में 55 बच्चे बैठते हैं।",
     "55 students sit in one room.", "Capacity", "high", "negative", "verified", "Enrolment / rooms", "mock", ""),
    ("G3", "2026-04-09", "WhatsApp text", "en", "Teacher", "Two sections are running in the verandah.",
     "Two sections are running in the verandah.", "Capacity", "high", "negative", "unverified", "", "mock", ""),
    ("G3", "2026-03-05", "WhatsApp voice", "hi", "Mother of a girl student", "बेटियां गर्ल्स स्कूल में सुरक्षित महसूस करती थीं।",
     "Our daughters felt safe in the girls' school.", "Girls' safety", "medium", "negative", "unverified", "", "mock", "The Tribune"),
    ("G3", "2026-03-11", "Letter", "en", "School committee president", "Retain at least one HP Board school in Nurpur so education stays affordable.",
     "Retain at least one HP Board school in Nurpur so education stays affordable.", "Board and cost", "medium", "negative", "verified", "High Court petition", "mock", "The Tribune"),
    ("G3", "2026-02-25", "Field visit", "en", "Municipal councillor", "The decision was taken without consulting parents.",
     "The decision was taken without consulting parents.", "Consultation", "medium", "negative", "verified", "News report", "mock", "The Tribune"),
    ("G3", "2026-05-18", "WhatsApp voice", "hi", "Parent", "सीबीएसई और स्मार्ट क्लास अच्छी हैं।",
     "The CBSE curriculum and smart classes are good.", "Quality", "low", "positive", "unverified", "", "mock", ""),
    ("G4", "2026-09-10", "WhatsApp voice", "hi", "Parent", "बच्चों को हाईवे पार करना पड़ेगा, बहुत गाड़ियां चलती हैं।",
     "The children will have to cross the highway. There is a lot of traffic.", "Route safety", "high", "negative", "partly verified", "Route crosses NH-3", "mock", "UP Kodaila report"),
    ("G4", "2026-09-12", "WhatsApp text", "en", "Jiyani teacher", "Only 4 students are left at Jiyani this year.",
     "Only 4 students are left at Jiyani this year.", "Enrolment", "low", "neutral", "verified", "UDISE+", "mock", ""),
    ("G4", "2026-09-15", "WhatsApp voice", "hi", "Parent", "बुआई पास है, लेकिन छोटे बच्चों को सड़क कौन पार कराएगा?",
     "Buai is close, but who will take the little ones across the road?", "Transport", "medium", "neutral", "unverified", "", "mock", ""),
    ("G5", "2026-09-18", "WhatsApp voice", "hi", "Parent", "फल्याणी से भूमतीर का रास्ता बारिश में नाले से होकर जाता है, डर लगता है।",
     "The path from Phalyani to Bhumteer goes through the nallah in the rains. We are scared.", "Route safety", "high", "negative", "unverified", "", "mock", ""),
    ("G5", "2026-09-19", "Field visit", "hi", "Anganwadi worker", "फल्याणी की आंगनवाड़ी में दो छोटे बच्चे हैं, वे यहीं रहें।",
     "Two small children are at the Phalyani anganwadi. They should stay here.", "Young children", "medium", "neutral", "verified", "UDISE+", "mock", ""),
    ("G6", "2026-09-18", "WhatsApp voice", "hi", "Parent", "नेरी से भूमतीर पास है, बच्चे आसानी से पैदल जा सकते हैं।",
     "Bhumteer is close to Neri. The children can walk there easily.", "Route safety", "low", "positive", "unverified", "", "mock", ""),
    ("G6", "2026-09-20", "WhatsApp text", "en", "Bhumteer teacher", "We have 4 rooms for 28 children. 11 more will fit if we get one more teacher.",
     "We have 4 rooms for 28 children. 11 more will fit if we get one more teacher.", "Capacity", "medium", "positive", "unverified", "", "mock", ""),
]
cur.executemany("INSERT INTO feedback (group_id, received, channel, language, sender_role, text_original, text_en, issue, severity, sentiment, verification, verified_by, source, based_on) VALUES (%s)" % ",".join("?" * 14), fb)

months = ["2025-10", "2025-11", "2025-12", "2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09"]
att = {
    "G1": ("RSK", [90, 88, 80, 72, 75, 89, 91, 90, 87, 79, 77, 86]),
    "G2": ("CHT", [91, 90, 89, 88, 89, 91, 92, 91, 92, 93, 92, 93]),
    "G3": ("NPG", [89, 90, 88, 87, 86, 82, 80, 79, 78, 76, 77, 78]),
    "G4": ("JYN", [93, 92, 90, 88, 89, 92, 93, 92, 91, 90, 89, 91]),
    "G5": ("PHL", [90, 89, 86, 84, 85, 90, 91, 90, 88, 78, 76, 88]),
    "G6": ("NER", [92, 91, 90, 89, 90, 92, 92, 91, 92, 91, 90, 92]),
}
for gid, (sid, vals) in att.items():
    for m, v in zip(months, vals):
        cur.execute("INSERT INTO attendance VALUES (?,?,?,?,?)", (gid, m, sid, v, "mock"))

answers = [
    ("G1", "vehicle", "yes", "7 of 9 families said yes. 2 also want an escort.", "2026-08-20", "mock"),
    ("G1", "months", "both", "July to August for the stream, January to February for snow.", "2026-08-21", "mock"),
    ("G1", "capacity", "teacher", "One room is free. We need one more teacher.", "2026-08-21", "mock"),
    ("G1", "young", "yes", "Keep them with the anganwadi.", "2026-08-22", "mock"),
    ("G2", "satisfaction", "better", "12 better, 3 same, 1 worse.", "2026-08-30", "mock"),
    ("G2", "committee", "reuse", "Use the Sandyar building for the anganwadi.", "2026-08-30", "mock"),
    ("G3", "capacity", "no", "12 rooms, up to 55 students per room.", "2026-04-15", "mock"),
    ("G3", "dropout", "few", "6 moved to private schools.", "2026-05-02", "mock"),
]
cur.executemany("INSERT INTO answers VALUES (?,?,?,?,?,?)", answers)

prec = [
    ("GPS Rashkar to GPS Uchh", "Himachal Pradesh", "2024", "water", "High Court stayed the merger: route unsafe in rain and winter",
     "https://www.tribuneindia.com/news/himachal/himachal-pradesh-high-court-stays-notification-on-merger-of-schools"),
    ("GMS Sandyar to GSSS Chhat", "Himachal Pradesh", "2026", "short", "High Court upheld the merger: 500 m on foot",
     "https://www.livelaw.in/high-court/himachal-pradesh-high-court/hp-high-court-upholds-merger-government-middle-school-551937"),
    ("Nurpur Boys to Nurpur Girls", "Himachal Pradesh", "2026", "capacity", "Challenged in High Court over congestion",
     "https://www.tribuneindia.com/news/himachal/after-merger-with-girls-school-government-boys-school-building-in-nurpur-locked/"),
    ("Ghurehta, Sitapur", "Uttar Pradesh", "2025", "water", "Flooded road; children stayed home; court ordered status quo",
     "https://www.inkl.com/news/waiting-for-our-school-to-reopen-kids-pay-the-price-of-up-s-school-merger-policy"),
    ("Kodaila to Bhiswa, Maharajganj", "Uttar Pradesh", "2026", "road", "Children crossing NH-730; village protest",
     "https://hindi.dynamitenews.com/uttar-pradesh/maharajganj-news-kodaila-village-news-primary-school-merger-school-merger-protest-school-nahi-to-vote-nahi-villagers-protest-education-news"),
    ("Supeli to Bahoriband", "Madhya Pradesh", "2026", "landslide", "7 km forest route; student protests",
     "https://indiatomorrow.net/2026/08/20/children-protest-school-mergers-across-mp-over-longer-travel-distances/"),
    ("Jawali girls' school merger", "Himachal Pradesh", "2026", "girls", "Mothers opposed co-ed conversion",
     "https://www.tribuneindia.com/news/himachal/merger-of-schools-in-jawali-locals-wary-of-sending-girls-to-co-ed-institution/"),
]
cur.executemany("INSERT INTO precedents (case_name, state, year, pattern, outcome, url) VALUES (?,?,?,?,?,?)", prec)

budget = [
    ("Transport and escort approved 2025-26", "All HP", 15546000, "2,591 children x Rs 6,000", "real"),
    ("Transport balance", "Kullu", 1140000, "Remaining this year", "mock"),
    ("Transport balance", "Bilaspur", 620000, "Remaining this year", "mock"),
    ("Classroom balance", "Kangra", 5400000, "Remaining this year", "mock"),
]
cur.executemany("INSERT INTO budget VALUES (?,?,?,?,?)", budget)
impl = [
    ("G1", "transport", "not started", "Waiting for the High Court stay to be lifted", "2026-08-25", "mock"),
    ("G2", "committee", "done", "Sandyar building handed to the anganwadi", "2026-08-30", "mock"),
    ("G3", "rooms", "in progress", "4 rooms sanctioned; construction started", "2026-07-10", "mock"),
    ("G3", "girls", "not started", "", "2026-07-10", "mock"),
    ("G3", "visits", "done", "Teachers visited 14 families", "2026-06-01", "mock"),
    ("G3", "committee", "not started", "", "2026-07-10", "mock"),
]
cur.executemany("INSERT INTO implementation VALUES (?,?,?,?,?,?)", impl)
import case_data
case_data.build(cur)
con.commit()

SEED.write_text("\n".join(l for l in con.iterdump() if l not in ("BEGIN TRANSACTION;", "COMMIT;")), encoding="utf-8")
print("tables:", [r[0] for r in con.execute("select name from sqlite_master where type='table'")])
print("seed bytes:", SEED.stat().st_size)
con.close()
