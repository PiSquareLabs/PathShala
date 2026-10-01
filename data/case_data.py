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
    CREATE TABLE school_facts (school_id TEXT PRIMARY KEY, building TEXT, rooms_good INTEGER, rooms_minor INTEGER, rooms_major INTEGER,
      toilets_girls INTEGER, toilets_boys INTEGER, cwsn_toilets INTEGER, ramp INTEGER, handrails INTEGER, drinking_water INTEGER,
      electricity INTEGER, all_weather_road INTEGER, enrol_girls INTEGER, enrol_boys INTEGER, cwsn INTEGER, transport_students INTEGER,
      established INTEGER, cluster TEXT, source TEXT, source_note TEXT, source_url TEXT);
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
    import udise_real
    for (sid, name, lat, lng, tot, pri, pre, t, rooms, src, note) in S:
        lc = "middle" if sid == "NHN" else "primary"
        row = (sid, None, name, "Middle (6 to 8)" if lc == "middle" else "Primary (1 to 5)", lc, "Kullu", "Banjar",
               name.split(" ", 1)[1], lat, lng, "Approximate location", tot, pri, pre, t, rooms, 0, src, note)
        cur.execute("INSERT INTO schools VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", udise_real.override_school(row))
    import udise_real
    # Tirthan valley demo schools: building condition from The Tribune (real for Pekhri-2 and Nahin); the other facts are mock and
    # left empty where no value exists. Nahin also has a UDISE+ report card (real).
    N = None
    facts = [
        ("PK2", "Poor — needs demolition and replacement", N, N, N, 0, N, N, 0, N, N, N, N, N, N, N, N, N, N, "real", "Building condition: The Tribune, 2 Sep 2026", TRIB_SCHOOLS),
        ("GSH", "Good", N, N, N, 1, N, N, 1, N, N, N, N, N, N, N, N, N, N, "mock", "", ""),
        ("NGN", "Good", N, N, N, 1, N, N, 0, N, N, N, N, N, N, N, N, N, N, "mock", "", ""),
        ("BNJ", "Fair", N, N, N, 1, N, N, 1, N, N, N, N, N, N, N, N, N, N, "mock", "", ""),
        udise_real.facts_row("NHN", udise_real.get("GMS Nahin"), "Unsafe — classes under tin sheds", "Building: The Tribune, 2 Sep 2026 · other facts: " + udise_real.NOTE),
        ("JBH", "Good", N, N, N, 1, N, N, 0, N, N, N, N, N, N, N, N, N, N, "mock", "", ""),
        ("BTH", "Fair", N, N, N, 0, N, N, 0, N, N, N, N, N, N, N, N, N, N, "mock", "", ""),
    ] + [udise_real.facts_row(sid, udise_real.get(nm)) for sid, nm in [("JYN", "GPS Jiyani"), ("DOB", "GPS Dobhi"), ("SOY", "GPS Soyal"), ("JNA", "GPS Jana")]]
    cur.executemany("INSERT INTO school_facts VALUES (%s)" % ",".join("?" * 22) + "", facts)

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

    # ---------- feedback about every other school (synthesised by PathShala; generic wording, one set per school) ----------
    # (theme, hindi, english). Each sentence is also in the hardcoded classification table in src/agent/feedbackAgents.js.
    AS_RECEIVER = [
        ("Facilities", "स्कूल में पर्याप्त कमरे हैं और इमारत अच्छी है।", "The school has enough classrooms and a good building."),
        ("Facilities", "अध्यापक नियमित आते हैं और बच्चे अच्छा सीखते हैं।", "The teachers come regularly and children learn well."),
        ("Transport", "स्कूल दूर है, छोटे बच्चों के लिए पैदल रास्ता लंबा है।", "The school is far and the walk is long for small children."),
        ("Transport", "स्कूल के समय इस स्कूल तक कोई बस नहीं जाती।", "There is no bus to this school at school time."),
        ("Seasonal access", "बरसात में स्कूल का रास्ता ढलान वाला और फिसलन भरा हो जाता है।", "The path to the school is steep and slippery in the rains."),
        ("Facilities", "स्कूल में रैंप और लड़कियों के लिए साफ शौचालय हैं।", "The school has a ramp and clean toilets for girls."),
        ("Safety", "बच्चे समूह में सुरक्षित स्कूल पहुँच जाते हैं।", "Children reach the school safely in a group."),
    ]
    AS_SENDER = [
        ("Safety", "इमारत की मरम्मत ज़रूरी है, बरसात में छत टपकती है।", "The school building needs repair; the roof leaks in the rains."),
        ("Facilities", "स्कूल में बहुत कम बच्चे बचे हैं।", "Very few children are left in the school."),
        ("Other", "यहाँ के अध्यापक हर बच्चे को नाम से जानते हैं।", "The teachers here know every child by name."),
    ]
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


    # ---------- terrain around each school (synthesised by PathShala, so field questions differ by school) ----------
    cur.execute("""CREATE TABLE school_terrain (school_id TEXT PRIMARY KEY, terrain TEXT, elev_m INTEGER, slope_pct INTEGER,
      crossing_kind TEXT, crossing_name TEXT, monsoon_hazard TEXT, monsoon_note TEXT, snow_months TEXT, road_type TEXT, wildlife TEXT,
      source TEXT, note TEXT)""")
    T = [
        # id, terrain, elev, slope %, crossing kind, crossing name, monsoon hazard, note, snow months, road, wildlife
        ("PK2", "Steep hill slope above the Tirthan valley", 1725, 22, "bridge", "Baridropa–Jawal footbridge", "landslide", "Road blocked several days near Jawal", "Dec–Feb", "kutcha link road", "monkeys"),
        ("GSH", "Valley floor beside the Tirthan river", 1590, 6, "", "", "flash flood", "Tirthan rises quickly after cloudbursts", "", "metalled road", ""),
        ("NGN", "Gentle terrace on the valley road", 1480, 8, "", "", "", "", "", "metalled road", ""),
        ("BNJ", "Town on a river terrace", 1360, 4, "bridge", "Banjar town bridge over the Tirthan", "", "", "", "metalled road", ""),
        ("NHN", "Ridge top, exposed to wind and snow", 1780, 18, "", "", "landslide", "Loose slope below the school path", "Dec–Mar", "kutcha link road", "leopard"),
        ("JBH", "Forested mid-slope", 1900, 16, "ford", "Jibhi nallah", "flash flood", "Nallah floods within an hour of heavy rain", "Jan–Feb", "metalled road", "bears"),
        ("BTH", "Remote side valley", 1730, 24, "ford", "Bathad khad", "landslide", "Path cut by slides most Julys", "Dec–Feb", "footpath only", "bears"),
        ("RSK", "High spur above the Parvati valley", 2050, 26, "bridge", "Rashkar rope footbridge", "landslide", "Slides across the Chhalal path", "Nov–Mar", "kutcha link road", "bears"),
        ("UCH", "Terraced fields on a steep slope", 1780, 20, "", "", "landslide", "Rockfall on the Barshaini road", "Dec–Feb", "metalled road", "monkeys"),
        ("SDY", "Low rolling hills", 720, 7, "ford", "Sandyar seasonal stream", "flash flood", "Stream runs high in July and August", "", "kutcha link road", "wild boar"),
        ("CHT", "Small town on flat ground", 650, 3, "", "", "", "", "", "metalled road", ""),
        ("NPB", "Flat plain by the fort", 420, 2, "", "", "", "", "", "metalled road", ""),
        ("NPG", "Flat plain in town", 415, 2, "", "", "", "", "", "metalled road", ""),
        ("JYN", "Steep slope above the Beas", 1760, 25, "bridge", "Jiyani wooden bridge", "landslide", "Slope failures after long rain", "Dec–Feb", "footpath only", "bears"),
        ("BUA", "Village on a broad shelf", 1700, 10, "", "", "", "", "Jan–Feb", "metalled road", ""),
        ("PHL", "Narrow ridge with drops on both sides", 1800, 21, "", "", "landslide", "Edge of the path erodes in rain", "Dec–Feb", "footpath only", ""),
        ("BHM", "Gentle slope near the road", 1660, 9, "ford", "Bhumteer nallah", "flash flood", "Ankle to knee deep in the monsoon", "", "metalled road", "monkeys"),
        ("KST", "High steep hamlet", 2150, 27, "", "", "landslide", "Rockfall from the cliff above the path", "Nov–Mar", "footpath only", "bears"),
        ("KKR", "Mid-slope village", 1980, 13, "bridge", "Kukari plank bridge", "", "", "Dec–Feb", "kutcha link road", ""),
        ("NER", "Wooded hillside", 1690, 15, "", "", "", "", "Jan–Feb", "kutcha link road", "leopard"),
        ("DOB", "Orchard slope above the Dobhi khad", 2000, 14, "ford", "Dobhi khad", "flash flood", "The khad fills within an hour of heavy rain", "Dec–Feb", "metalled road", "leopard"),
        ("SOY", "Broad shelf above the valley road", 2060, 9, "", "", "landslide", "Rockfall on the last 300 m below the school", "Dec–Feb", "metalled road", ""),
        ("JNA", "Large village on a gentle shelf", 2200, 8, "", "", "", "", "Dec–Mar", "metalled road", ""),
    ]
    cur.executemany("INSERT INTO school_terrain VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
                    [t + ("mock", "Synthesised by PathShala for the demo; not a survey") for t in T])

    # ---------- habitations for every school without any (synthesised; road link follows the terrain record) ----------
    rnd = random.Random(7)
    have = {r[0] for r in cur.execute("SELECT DISTINCT school_id FROM habitations")}
    nxt = 1 + max(int(r[0][1:]) for r in cur.execute("SELECT hab_id FROM habitations"))
    SUF = ["", " Dhar", " Khad", " Nala", " Bazaar"]
    for sid, name, lat, lng, enrol in cur.execute("SELECT school_id, name, lat, lng, enrol_total FROM schools").fetchall():
        if sid in have:
            continue
        road, elev = next((t[9], t[2]) for t in T if t[0] == sid)
        village = name.replace("GPS ", "").replace("GMS ", "").replace("GSSS ", "").replace("Girls PM Shri ", "").replace("(Boys) ", "")
        n = 2 if enrol < 30 else 3
        for i in range(n):
            connected = 1 if road == "metalled road" and i != 1 else (1 if road == "kutcha link road" and i == 0 else 0)
            cur.execute("INSERT INTO habitations VALUES (?,?,?,?,?,?,?,?)",
                        ("H%d" % nxt, (village + SUF[i]).strip(), sid, round(lat + rnd.uniform(-0.004, 0.004), 4), round(lng + rnd.uniform(-0.004, 0.004), 4),
                         elev + rnd.choice([-40, 0, 60, 120]) * (1 if i else 0), connected, "mock"))
            nxt += 1

    # ---------- feedback about every other school (synthesised by PathShala). Each school's messages follow its own terrain, so they differ. ----------
    # (theme, hindi, english); every English sentence is also in the hardcoded classification table in src/agent/feedbackAgents.js.
    TERRAIN_FB = {
        "ford": ("Seasonal access", "बरसात में रास्ते का नाला चढ़ जाता है और बच्चे उसे पार नहीं कर पाते।", "In the rains the stream on the way rises and children cannot cross it."),
        "bridge": ("Safety", "रास्ते के पुल पर छोटे बच्चों को अकेले भेजने में डर लगता है।", "We are afraid to send small children alone over the bridge on the way."),
        "landslide": ("Seasonal access", "बरसात में रास्ते पर पत्थर गिरते हैं और कई दिन रास्ता बंद रहता है।", "In the rains stones fall on the path and the way is blocked for days."),
        "flood": ("Safety", "रास्ते का नाला अचानक भर जाता है, स्कूल के समय खतरनाक होता है।", "The stream on the way fills suddenly and it is dangerous at school time."),
        "snow": ("Seasonal access", "सर्दियों में बर्फ़ और पाला रास्ते को बच्चों के लिए असुरक्षित बना देते हैं।", "Snow and ice make the path unsafe for children in winter."),
        "steep": ("Seasonal access", "रास्ता बहुत खड़ी चढ़ाई वाला है, छोटे बच्चे थक जाते हैं।", "The path is very steep and small children get tired."),
        "wild": ("Safety", "रास्ते में जंगली जानवर दिखते हैं और बच्चे डरते हैं।", "Wild animals are seen on the path and children are afraid."),
        "kutcha": ("Transport", "हमारे गाँव तक गाड़ी नहीं आती, सड़क कच्ची है।", "Vehicles do not come to our village; the road is kutcha."),
        "pucca": ("Transport", "सड़क पक्की है और बच्चे गाड़ी से आसानी से स्कूल पहुँच जाते हैं।", "The road is metalled and children reach school easily by vehicle."),
        "flat": ("Seasonal access", "रास्ता समतल है और बरसात में भी सुरक्षित रहता है।", "The path is flat and safe even in the rains."),
    }
    cur.execute("SELECT school_id FROM schools ORDER BY school_id")
    extra = []
    trow = {t[0]: t for t in T}
    for (sid,) in cur.fetchall():
        if sid == "GSH":
            continue                                       # Gushaini already has the 87 messages above
        r2 = random.Random("fb" + sid)
        t = trow[sid]                                      # id, terrain, elev, slope, crossing kind, name, monsoon, note, snow, road, wildlife
        keys = []
        if t[4] == "ford": keys.append("ford")
        if t[4] == "bridge": keys.append("bridge")
        if t[6] == "landslide": keys.append("landslide")
        if t[6] == "flash flood": keys.append("flood")
        if t[8]: keys.append("snow")
        if t[3] >= 18: keys.append("steep")
        if t[10]: keys.append("wild")
        if "kutcha" in t[9] or "footpath" in t[9]: keys.append("kutcha")
        if not keys or (t[3] < 10 and t[9] == "metalled road" and len(keys) < 2): keys += ["pucca", "flat"] if t[3] < 10 else ["pucca"]
        if t[9] == "metalled road" and t[3] < 12 and not t[4]:   # an easy approach: gentle ground, a metalled road and no river to cross
            keys += [k for k in ("pucca", "flat") if k not in keys]
        pool = [(tt, hi, en) for tt, hi, en in AS_RECEIVER[:2] + AS_RECEIVER[5:]] + AS_SENDER
        msgs = []
        for k in keys[:5]:
            msgs += [TERRAIN_FB[k]] * r2.randint(1, 2)      # a problem raised again and again looks different from one raised once
        msgs += r2.sample(pool, r2.randint(4, 5))
        for tt, hi, en in msgs:
            extra.append((sid, sid, None, tt, hi, en, r2.choice(chans), f"2026-{r2.choice(['07', '08', '09'])}-{r2.randint(1, 28):02d}", r2.choice(roles), "reported", "", "mock"))
    cur.executemany("INSERT INTO citizen_feedback (school_id, about_id, hab_id, theme, text_hi, text_en, channel, received, sender_role, status, verified_by, source) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)", extra)
