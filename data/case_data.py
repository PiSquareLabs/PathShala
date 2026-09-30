"""Investigation-case data: Tirthan valley, Banjar block, Kullu.

Real anchors (source='real'):
- GPS Pekhri-1, GPS Pekhri-2, GMS Nahin exist; Pekhri-2 building is in poor condition and GMS Nahin
  (21 students) runs under tin sheds (The Tribune, 2 Sep 2026).
- The Baridropa-Jawal footbridge over the Tirthan (Kandi Dhar panchayat) was damaged in the 2023 floods;
  villagers rebuilt it a third time after the 13 Aug 2025 flood (The Tribune, 2025).
- Policy text: RTE Rules 2010 Rule 6; Samagra Shiksha programmatic and financial norms; HP merger decision
  (7 June 2025); NEP 2020 school complexes; HP High Court, Sandyar (2026).
Everything else (enrolment, coordinates, routes, elevations, bus times, feedback) is mock and labelled.
"""
import json
import math
import random

TRIB_SCHOOLS = "https://www.tribuneindia.com/news/himachal/unsafe-schools-of-tirthan-valley/"
TRIB_BRIDGE = "https://www.tribuneindia.com/news/himachal/villagers-join-hands-to-set-up-wooden-bridge-over-tirthan-river-for-third-time/amp"


def build(cur):
    cur.executescript("""
    CREATE TABLE school_facts (school_id TEXT PRIMARY KEY, building TEXT,
      head_teacher INTEGER, toilets_girls INTEGER, ramp INTEGER, source TEXT, source_note TEXT, source_url TEXT);
    CREATE TABLE habitations (hab_id TEXT PRIMARY KEY, name TEXT, school_id TEXT, lat REAL, lng REAL, elev_m INTEGER,
      road_connected INTEGER, source TEXT);
    CREATE TABLE links (from_id TEXT, to_id TEXT, road_km REAL, road_min INTEGER, walk_km REAL, climb_m INTEGER, descent_m INTEGER,
      route_walk TEXT, route_road TEXT, source TEXT, note TEXT, PRIMARY KEY (from_id, to_id));
    CREATE TABLE geo_features (feature_id TEXT PRIMARY KEY, kind TEXT, name TEXT, geometry TEXT, season TEXT, detail TEXT,
      status TEXT, source TEXT, source_url TEXT);
    CREATE TABLE citizen_feedback (fb_id INTEGER PRIMARY KEY, school_id TEXT, about_id TEXT, hab_id TEXT, theme TEXT, text_hi TEXT, text_en TEXT,
      channel TEXT, received TEXT, sender_role TEXT, status TEXT, verified_by TEXT, source TEXT);
    CREATE TABLE field_obs (obs_id TEXT PRIMARY KEY, feature_id TEXT, school_id TEXT, kind TEXT, text TEXT, observed_by TEXT,
      observed_on TEXT, status TEXT, source TEXT, source_url TEXT);
    CREATE TABLE policy_docs (doc_id TEXT PRIMARY KEY, title TEXT, issuer TEXT, year TEXT, url TEXT, source TEXT);
    CREATE TABLE policy_chunks (chunk_id TEXT PRIMARY KEY, doc_id TEXT, section TEXT, text TEXT, keywords TEXT, verbatim INTEGER);
    """)

    # ---------- schools: Tirthan valley, Banjar block ----------
    S = [
        # id, name, lat, lng, total, primary, pre, teachers, rooms, source, note
        ("PK2", "GPS Pekhri-2", 31.6420, 77.4330, 27, 27, 0, 2, 3, "real", "School real (The Tribune, Sep 2026: building in poor condition); numbers mock"),
        ("GSH", "GPS Gushaini", 31.6168, 77.4552, 143, 131, 12, 8, 6, "mock", "Village real; school data mock"),
        ("NGN", "GPS Nagini", 31.6290, 77.4050, 86, 80, 6, 5, 4, "mock", "Village real; school data mock"),
        ("BNJ", "GPS Banjar", 31.6365, 77.3445, 54, 54, 0, 3, 3, "mock", "Town real; school data mock"),
        ("NHN", "GMS Nahin", 31.6532, 77.4415, 21, 0, 0, 3, 3, "real", "21 students, building unsafe, classes under tin sheds (The Tribune, Sep 2026)"),
        ("JBH", "GPS Jibhi", 31.5870, 77.3580, 38, 38, 0, 2, 4, "mock", "Village real; school data mock"),
        ("BTH", "GPS Bathad", 31.5935, 77.4930, 9, 9, 0, 1, 2, "mock", "Village real; school data mock"),
    ]
    for (sid, name, lat, lng, tot, pri, pre, t, rooms, src, note) in S:
        lc = "middle" if sid == "NHN" else "primary"
        cur.execute("INSERT INTO schools VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                    (sid, None, name, "Middle (6 to 8)" if lc == "middle" else "Primary (1 to 5)", lc, "Kullu", "Banjar",
                     name.split(" ", 1)[1], lat, lng, "Approximate location", tot, pri, pre, t, rooms, 0, src, note))
    facts = [
        ("PK2", "Poor — needs demolition and replacement", 0, 0, 0, "real", "Building condition: The Tribune, 2 Sep 2026", TRIB_SCHOOLS),
        ("GSH", "Good", 1, 1, 1, "mock", "", ""),
        ("NGN", "Good", 1, 1, 0, "mock", "", ""),
        ("BNJ", "Fair", 1, 1, 1, "mock", "", ""),
        ("NHN", "Unsafe — classes under tin sheds", 1, 0, 0, "real", "The Tribune, 2 Sep 2026", TRIB_SCHOOLS),
        ("JBH", "Good", 1, 1, 0, "mock", "", ""),
        ("BTH", "Fair", 0, 0, 0, "mock", "", ""),
    ]
    cur.executemany("INSERT INTO school_facts VALUES (?,?,?,?,?,?,?,?)", facts)

    # ---------- habitations near Pekhri-2 and neighbours (names, location, height, road link) ----------
    H = [
        ("H1", "Pekhri", "PK2", 31.6428, 77.4318, 1725, 1),
        ("H2", "Jawal", "PK2", 31.6352, 77.4395, 1560, 0),
        ("H3", "Baridropa", "PK2", 31.6318, 77.4432, 1500, 1),
        ("H4", "Kandi Dhar", "PK2", 31.6470, 77.4388, 1840, 0),
        ("H5", "Gushaini", "GSH", 31.6168, 77.4552, 1590, 1),
        ("H6", "Nagini", "NGN", 31.6290, 77.4050, 1480, 1),
    ]
    cur.executemany("INSERT INTO habitations VALUES (?,?,?,?,?,?,?,?)", [h + ("mock",) for h in H])

    # ---------- geography (approximate, mock geometry; bridge and floods real) ----------
    river = [[31.600, 77.525], [31.607, 77.500], [31.614, 77.472], [31.618, 77.455], [31.624, 77.445], [31.629, 77.438],
             [31.631, 77.425], [31.629, 77.405], [31.632, 77.380], [31.636, 77.352], [31.648, 77.318], [31.672, 77.280], [31.700, 77.245], [31.722, 77.214]]
    road = [[31.722, 77.212], [31.700, 77.242], [31.672, 77.277], [31.647, 77.316], [31.6355, 77.346], [31.631, 77.378], [31.6275, 77.404],
            [31.6295, 77.424], [31.6275, 77.437], [31.6215, 77.447], [31.6165, 77.4545], [31.611, 77.470], [31.603, 77.497]]
    jalori = [[31.6355, 77.346], [31.620, 77.352], [31.600, 77.356], [31.587, 77.358], [31.560, 77.365], [31.535, 77.372]]
    link_rd = [[31.6420, 77.4330], [31.6395, 77.4350], [31.6360, 77.4368], [31.6320, 77.4330], [31.6295, 77.4240]]
    geo = [
        ("RIV", "river", "Tirthan river", json.dumps(river), "", "Flash floods in Jul–Aug 2023 and Aug 2025", "known", "mock", ""),
        ("RD1", "road", "Banjar–Gushaini road", json.dumps(road), "", "Single-lane hill road; landslide blockages in monsoon", "known", "mock", ""),
        ("RD2", "road", "Banjar–Jibhi–Jalori road (NH-305)", json.dumps(jalori), "", "", "known", "mock", ""),
        ("RD3", "road", "Pekhri link road", json.dumps(link_rd), "", "Kutcha link road to the valley road", "known", "mock", ""),
        ("BR1", "bridge", "Baridropa–Jawal footbridge", json.dumps([31.6300, 77.4402]), "Monsoon (Jul–Sep)",
         "Pedestrian bridge damaged in 2023 floods; temporary wooden bridges washed away, including on 13 Aug 2025; villagers rebuilt it a third time",
         "seasonal", "real", TRIB_BRIDGE),
        ("SL1", "steep", "Steep path below Kandi Dhar", json.dumps([[31.6410, 77.4345], [31.6368, 77.4380]]), "", "Gradient above 15% for about 600 m", "calculated", "mock", ""),
        ("LS1", "landslide", "Landslide-prone stretch near Jawal", json.dumps([[31.6275, 77.4370], [31.6245, 77.4420]]), "Monsoon", "Road blocked several days in past monsoons", "reported", "mock", ""),
    ]
    cur.executemany("INSERT INTO geo_features VALUES (?,?,?,?,?,?,?,?,?)", geo)

    # ---------- links (school to school), routes with elevation ----------
    def seg_km(a, b):
        R = 6371
        la1, lo1, la2, lo2 = map(math.radians, (a[0], a[1], b[0], b[1]))
        h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
        return 2 * R * math.asin(math.sqrt(h))

    def length(pts):
        return sum(seg_km(pts[i], pts[i + 1]) for i in range(len(pts) - 1))

    walk_AB = [[31.6420, 77.4330, 1720], [31.6410, 77.4345, 1690], [31.6368, 77.4380, 1570], [31.6352, 77.4395, 1535],
               [31.6325, 77.4400, 1505], [31.6300, 77.4402, 1482], [31.6280, 77.4430, 1490], [31.6255, 77.4460, 1515],
               [31.6225, 77.4490, 1545], [31.6195, 77.4520, 1570], [31.6168, 77.4552, 1590]]
    road_AB = [[31.6420, 77.4330], [31.6395, 77.4350], [31.6360, 77.4368], [31.6320, 77.4330], [31.6295, 77.4240],
               [31.6295, 77.4240], [31.6275, 77.4370], [31.6215, 77.4470], [31.6168, 77.4552]]
    walk_AC = [[31.6420, 77.4330, 1720], [31.6395, 77.4350, 1650], [31.6320, 77.4330, 1540], [31.6295, 77.4240, 1500], [31.6280, 77.4150, 1490], [31.6290, 77.4050, 1480]]
    road_AC = [[31.6420, 77.4330], [31.6395, 77.4350], [31.6360, 77.4368], [31.6320, 77.4330], [31.6295, 77.4240], [31.6275, 77.4100], [31.6290, 77.4050]]
    walk_AD = [[31.6420, 77.4330, 1720], [31.6320, 77.4330, 1540], [31.6295, 77.4240, 1500], [31.6290, 77.4050, 1480], [31.6310, 77.3800, 1420], [31.6365, 77.3445, 1360]]
    road_AD = road_AC + [[31.6310, 77.3800], [31.6365, 77.3445]]

    def climb(p):
        up = sum(max(0, p[i + 1][2] - p[i][2]) for i in range(len(p) - 1))
        dn = sum(max(0, p[i][2] - p[i + 1][2]) for i in range(len(p) - 1))
        return up, dn

    links = []
    for a, b, w, r, note in [("PK2", "GSH", walk_AB, road_AB, "Footpath via the Baridropa–Jawal footbridge; road via the Pekhri link road"),
                             ("PK2", "NGN", walk_AC, road_AC, "Footpath down to the valley road"),
                             ("PK2", "BNJ", walk_AD, road_AD, "Valley road to Banjar")]:
        up, dn = climb(w)
        rk = round(length(r) * 1.18, 1)  # hairpins not captured by the simplified line
        wk = round(length([p[:2] for p in w]) * 1.12, 1)
        links.append((a, b, rk, round(rk / 20 * 60), wk, up, dn, json.dumps(w), json.dumps(r), "mock", note))
    # scale to the stated case distances (road 3.8 / 6.1 / 9.4 km)
    target = {"GSH": (3.8, 4.6), "NGN": (6.1, 5.7), "BNJ": (9.4, 9.9)}
    links = [(a, b, target[b][0], round(target[b][0] / 12 * 60), target[b][1], up, dn, w, r, s, n) for (a, b, _, _, _, up, dn, w, r, s, n) in links]
    cur.executemany("INSERT INTO links VALUES (?,?,?,?,?,?,?,?,?,?,?)", links)

    # ---------- field observation ----------
    obs = [
        ("F1", "BR1", "PK2", "bridge", "Footbridge at Baridropa–Jawal washed away on 13 Aug 2025; villagers rebuilt a wooden bridge. Not safe in heavy rain.",
         "JE, PWD Banjar (reported in The Tribune)", "2025-08-20", "verified", "real", TRIB_BRIDGE),
        ("F2", "", "PK2", "building", "Pekhri-2 school building in poor condition; needs demolition and replacement.",
         "Reported by vice-pradhan (The Tribune)", "2026-09-02", "verified", "real", TRIB_SCHOOLS),
    ]
    cur.executemany("INSERT INTO field_obs VALUES (?,?,?,?,?,?,?,?,?,?)", obs)

    # ---------- citizen feedback (mock, 87 messages) ----------
    T = {
        "Transport": [
            ("हमारे गाँव से स्कूल समय पर कोई नियमित बस नहीं है।", "There is no regular bus from our village at school time."),
            ("बच्चे अभी मुख्य सड़क तक पैदल जाते हैं।", "Children currently walk to the main road."),
            ("गुशैनी के लिए बस सुबह 7 बजे जाती है, स्कूल 9 बजे लगता है।", "The bus to Gushaini leaves at 7 am; school starts at 9."),
            ("अगर गाड़ी मिले तो हम बच्चों को गुशैनी भेज देंगे।", "If a vehicle is provided we will send the children to Gushaini."),
            ("छोटे बच्चों के साथ कौन जाएगा? हम खेत में काम करते हैं।", "Who will go with the small children? We work in the fields."),
            ("टैक्सी का किराया रोज़ नहीं दे सकते।", "We cannot pay taxi fare every day."),
            ("लिंक रोड कच्ची है, गाड़ी ऊपर तक नहीं आती।", "The link road is kutcha; vehicles do not come up to the village."),
        ],
        "Seasonal access": [
            ("भारी बारिश में रास्ता बहुत मुश्किल हो जाता है।", "During heavy rain the route becomes difficult."),
            ("तीर्थन का पुल हर बरसात में बह जाता है।", "The Tirthan footbridge washes away every monsoon."),
            ("2025 में पुल टूटने के बाद गाँव वालों ने खुद लकड़ी का पुल बनाया।", "After the bridge broke in 2025 the villagers built a wooden one themselves."),
            ("बरसात में सड़क पर पत्थर गिरते हैं, कई दिन बंद रहती है।", "In the rains stones fall on the road; it stays closed for days."),
            ("सर्दियों में सुबह रास्ते पर पाला जम जाता है।", "In winter mornings the path freezes."),
        ],
        "Safety": [
            ("नदी पार करते समय बच्चों को डर लगता है।", "Children are afraid while crossing the river."),
            ("रास्ता जंगल से होकर जाता है, जंगली जानवर दिखते हैं।", "The path goes through forest; wild animals are seen."),
            ("कंडीधार के नीचे बहुत खड़ी चढ़ाई है।", "There is a very steep climb below Kandi Dhar."),
            ("लड़कियों को अकेले इतनी दूर भेजना ठीक नहीं।", "It is not right to send girls alone so far."),
        ],
        "Facilities": [
            ("गुशैनी स्कूल में अच्छे कमरे और शौचालय हैं।", "Gushaini school has good rooms and toilets."),
            ("पेखड़ी-2 की इमारत गिरने वाली है।", "The Pekhri-2 building is about to collapse."),
            ("वहाँ ज़्यादा अध्यापक हैं, पढ़ाई अच्छी होगी।", "There are more teachers there; studies will be better."),
        ],
        "Other": [
            ("पंचायत से कोई सलाह नहीं ली गई।", "The panchayat was not consulted."),
            ("मिड-डे मील का क्या होगा?", "What will happen to the mid-day meal?"),
            ("हमारे गाँव का स्कूल हमारी पहचान है।", "Our village school is our identity."),
            ("आंगनवाड़ी भी यहीं है, वह बंद नहीं होनी चाहिए।", "The anganwadi is here too; it should not close."),
        ],
    }
    counts = {"Transport": 31, "Seasonal access": 19, "Safety": 14, "Facilities": 7, "Other": 16}
    hab_w = {"Transport": ["H1", "H1", "H4", "H4", "H2", "H3"], "Seasonal access": ["H2", "H3", "H3", "H1"], "Safety": ["H1", "H4", "H2", "H3"],
             "Facilities": ["H1", "H2", "H5"], "Other": ["H1", "H2", "H3", "H4"]}
    roles = ["Parent", "Parent", "Parent", "Mother", "Grandparent", "Ward member", "Anganwadi worker", "SMC member", "Teacher"]
    chans = ["WhatsApp voice", "WhatsApp voice", "Gram sabha", "Phone call", "Grievance portal", "Field visit"]
    rnd = random.Random(7)
    rows = []
    for theme, n in counts.items():
        for i in range(n):
            hi, en = T[theme][i % len(T[theme])]
            hab = rnd.choice(hab_w[theme])
            status, by = "reported", ""
            if theme == "Seasonal access" and i % len(T[theme]) in (1, 2) and i < 8:
                status, by = "verified", "Field observation F1"
            if theme == "Facilities" and i % 3 == 1:
                status, by = "verified", "Field observation F2"
            d = f"2026-{rnd.choice(['07', '08', '09'])}-{rnd.randint(1, 28):02d}"
            rows.append(("PK2" if hab != "H5" else "GSH", "GSH", hab, theme, hi, en, rnd.choice(chans), d, rnd.choice(roles), status, by, "mock"))
    cur.executemany("INSERT INTO citizen_feedback (school_id, about_id, hab_id, theme, text_hi, text_en, channel, received, sender_role, status, verified_by, source) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)", rows)

    # ---------- policy corpus (real sources) ----------
    RTE = "https://indiankanoon.org/doc/42884596/"
    SS = "https://samagrashiksha.in/download/AWP&B/Annexure-I.pdf"
    HP25 = "https://thenewshimachal.com/2025/06/103-zero-admission-schools-in-himachal-to-be-closed-443-others-merged/"
    NEP = "https://prsindia.org/policy/report-summaries/national-education-policy-2020"
    HC = "https://www.livelaw.in/high-court/himachal-pradesh-high-court/hp-high-court-upholds-merger-government-middle-school-551937"
    docs = [
        ("RTE10", "The Right of Children to Free and Compulsory Education Rules, 2010", "Ministry of Education, Government of India", "2010", RTE, "real"),
        ("SSN", "Samagra Shiksha — Programmatic and Financial Norms", "Ministry of Education, Government of India", "2018–", SS, "real"),
        ("HP25", "HP decision on merger and closure of low-enrolment schools", "Education Department, Government of Himachal Pradesh (as reported)", "2025", HP25, "real"),
        ("NEP20", "National Education Policy 2020 (PRS summary)", "Government of India", "2020", NEP, "real"),
        ("HCS26", "HP High Court, GMS Sandyar merger (CWP 14564 of 2026)", "High Court of Himachal Pradesh (as reported)", "2026", HC, "real"),
    ]
    cur.executemany("INSERT INTO policy_docs VALUES (?,?,?,?,?,?)", docs)
    chunks = [
        ("C1", "RTE10", "Rule 6(1)(a)", "In respect of children in classes from I to V, a school shall be established within a walking distance of one km of the neighbourhood.", "walking distance one km primary neighbourhood access", 1),
        ("C2", "RTE10", "Rule 6(1)(b)", "In respect of children in classes from VI to VIII, a school shall be established within a walking distance of three km of the neighbourhood.", "walking distance three km upper primary middle", 1),
        ("C3", "RTE10", "Rule 6(3)", "In places with difficult terrain, risk of landslides, floods, lack of roads and in general, danger for young children in the approach from their homes to the school, the appropriate Government or the local authority shall locate the school in such a manner as to avoid such dangers, by reducing the area or limits specified.", "difficult terrain landslide flood roads danger young children route bridge river seasonal", 0),
        ("C4", "RTE10", "Rule 6(4)", "For children from small hamlets, where no school exists within the area or limits of neighbourhood, the appropriate Government or the local authority shall make adequate arrangements, such as free transportation and residential facilities, for providing elementary education.", "small hamlets habitation free transportation transport residential arrangements distance", 0),
        ("C5", "RTE10", "Rule 6(7)", "In respect of children with disabilities, the appropriate Government or the local authority shall endeavour to make appropriate and safe transportation arrangements.", "disabilities cwsn safe transportation transport", 0),
        ("C6", "SSN", "Transport / escort facility", "Provision for transport / escort facility up to secondary level for children in remote habitations with sparse population, where opening of schools is unviable or where Gross Access Ratio is low. Transport facility may be provided up to an average cost @ Rs. 6000 per child per annum up to Class X. This would be appraised based on actual cost to be incurred as per the distance, the terrain and the type of transport facility.", "transport escort facility remote habitation sparse cost 6000 per child per annum terrain distance vehicle", 1),
        ("C7", "SSN", "Transport / escort facility — DBT", "The option of cash transfer will be allowed in the form of DBT to Aadhaar-linked bank accounts, linked to the actual attendance.", "cash transfer dbt attendance transport allowance", 1),
        ("C8", "SSN", "Residential schools / hostels", "Support for reaching out to children in sparsely populated, or hilly and densely forested areas with difficult geographical terrain and border areas where opening of new primary or upper primary school may not be viable.", "residential hostel hilly terrain sparse forested", 0),
        ("C9", "HP25", "Merger criteria, primary", "Primary schools with fewer than five students are to be merged within a 2 km radius; where no other school exists within that range, the merger distance is extended to 3 km. (Announced 7 June 2025; 103 zero-enrolment schools closed, 443 low-enrolment schools merged.)", "merger radius 2 km 3 km primary enrolment five", 0),
        ("C10", "NEP20", "School complexes", "Schools are to be grouped into school complexes: one secondary school with other schools and anganwadis within a 5–10 km radius, to share teachers and resources.", "school complex cluster 5 10 km radius sharing resources", 0),
        ("C11", "HCS26", "Judgment on distance", "The High Court upheld the merger of GMS Sandyar into GSSS Chhat, noting 1.5 km by road and about 500 m on foot, and indicated it would intervene where distance made access difficult.", "court distance access merger upheld walking", 0),
    ]
    cur.executemany("INSERT INTO policy_chunks VALUES (?,?,?,?,?,?)", chunks)
    cur.execute("INSERT INTO rules VALUES (?,?,?,?,?,?,?,?)", ("R13", "Child walking pace", "Walking speed of a Class 1 child relative to an adult (Tobler's hiking function).", "child_pace", 0.75, "× adult", "PathShala planning assumption", ""))
