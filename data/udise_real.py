"""Real UDISE+ School Report Card data (2025-26) for the schools whose cards were downloaded (data/udise/*.pdf).
Parsed by data/udise/parse_udise.py into data/udise/schools.json."""
import json
import pathlib

_FILE = pathlib.Path(__file__).parent / "udise" / "schools.json"
BY_NAME = {v["name"].upper(): v for v in json.loads(_FILE.read_text()).values()} if _FILE.exists() else {}
NOTE = "UDISE+ School Report Card 2025-26 (generated 30-09-2026)"
URL = "https://kys.udiseplus.gov.in"

LEVEL = {"Primary": ("Primary (1 to 5)", "primary"), "Upper Primary only": ("Middle (6 to 8)", "middle")}


def get(name):
    return BY_NAME.get(name.upper())


def override_school(t):
    """t is a `schools` row tuple; returns it with the real UDISE+ values when a report card exists."""
    r = get(t[2])
    if not r:
        return t
    level, code = LEVEL.get(r["category"], (t[3], t[4]))
    return (t[0], r["udise_code"], t[2], level, code, t[5], r["block"], t[7], t[8], t[9], t[10],
            r["enrol_total"], r["enrol_primary"] + r["enrol_upper_primary"], r["enrol_preprimary"], r["teachers"], r["classrooms"],
            1 if r["anganwadi_at_premises"] else 0, "real", NOTE)


def building_text(r):
    n = r["classrooms"]
    if not (r["rooms_good"] or r["rooms_minor"] or r["rooms_major"]):
        return "Classroom condition not recorded"
    return f"{r['rooms_good']} of {n} classrooms in good condition, {r['rooms_minor']} need minor repair, {r['rooms_major']} major repair"


def facts_row(sid, r, building=None, source_note=None):
    """school_facts row (see case_data.py) from a report card."""
    yn = lambda v: None if v is None else int(bool(v))
    return (sid, building or building_text(r), r["rooms_good"], r["rooms_minor"], r["rooms_major"], r["toilets_girls_func"], r["toilets_boys_func"],
            r["toilets_cwsn_friendly"], yn(r["ramps"]), yn(r["handrails"]), yn(r["drinking_water"]), yn(r["electricity"]), yn(r["all_weather_road"]),
            r["girls"], r["boys"], r["cwsn"], (r["transport_pri"] or 0) + (r["transport_upr"] or 0), r["established"], r["cluster"],
            "real", source_note or NOTE, URL)
