"""Parse UDISE+ School Report Card text (extracted from the PDFs in this folder) into data/udise/schools.json.
Usage: python3 data/udise/parse_udise.py   (reads data/udise/*.txt)"""
import json, re, pathlib
HERE = pathlib.Path(__file__).parent

def val(t, label, after=r'\s+(.+?)(?:\s{2,}|\n|$)'):
    m = re.search(re.escape(label) + after, t)
    return m.group(1).strip() if m else None

def num(t, label):
    m = re.search(re.escape(label) + r'\s+(\d+(?:\.\d+)?)', t)
    return float(m.group(1)) if m and '.' in m.group(1) else (int(m.group(1)) if m else None)

def yes(v):
    return None if v is None or v.startswith('NA') else v.startswith('1')

def parse(path):
    t = path.read_text()
    d = {}
    d['udise_code'] = re.search(r'UDISE CODE\s+(\d+)', t).group(1)
    d['name'] = re.search(r'School Name\s+(.+?)\s*\n', t).group(1).strip()
    d['district'] = val(t, 'Educational District').title()
    d['block'] = re.search(r'Educational Block\s+([A-Z0-9\- ]+?)\s*\n', t).group(1).strip().title().replace('Kullu-2', 'Kullu-II').replace('Naggar', 'Naggar')
    d['cluster'] = val(t, 'Cluster')
    d['panchayat'] = re.search(r'LGD Panchayat\s+(\S+)', t).group(1)
    d['category'] = re.search(r'School Category\s+(.+?)\s{2,}', t).group(1).strip()
    d['classes'] = re.search(r'Lowest & Highest Class\s+([\d\-]+)', t).group(1)
    d['pre_primary_section'] = yes(re.search(r'Pre Primary\s+(\S+)', t).group(1))
    d['established'] = int(re.search(r'Year of Establishment\s+(\d+)', t).group(1))
    d['anganwadi_at_premises'] = yes(re.search(r'Anganwadi At Premises\s+(\S+)', t).group(1))
    d['building_status'] = re.search(r'Building Status\s+(\S+)', t).group(1)
    d['all_weather_road'] = yes(re.search(r'All Weather\s*\n?\s*Road\s*\n?\s*(\d-\w+)', t).group(1)) if re.search(r'All Weather\s*\n?\s*Road', t) else None
    d['ramps'] = yes(re.search(r'Availability of Ramps\s+(\S+)', t).group(1))
    d['handrails'] = yes(re.search(r'Availability of Handrails\s+(\S+)', t).group(1)) if 'Availability of Handrails' in t else None
    m = re.search(r'Total \(Excluding CWSN\)\s+(\d+)\s+(\d+)', t); d['toilets_boys'], d['toilets_girls'] = int(m.group(1)), int(m.group(2))
    m = re.search(r'\nFunctional\s+(\d+)\s+(\d+)', t); d['toilets_boys_func'], d['toilets_girls_func'] = int(m.group(1)), int(m.group(2))
    m = re.search(r'Func\. CWSN Friendly\s+(\d+)\s+(\d+)', t); d['toilets_cwsn_friendly'] = int(m.group(1)) + int(m.group(2))
    d['classrooms'] = num(t, 'Total Class Rooms')
    d['rooms_good'] = num(t, 'In Good Condition'); d['rooms_minor'] = num(t, 'Needs Minor Repair'); d['rooms_major'] = num(t, 'Needs Major Repair')
    m = re.search(r'Drinking Water\s*\n?Available\s*\n?\s*(\d-\w+)', t) or re.search(r'Available\s+(\d-\w+)', t)
    d['drinking_water'] = yes(m.group(1)) if m else None
    d['electricity'] = yes(re.search(r'Electricity Availability\s+(\S+)', t).group(1))
    d['library'] = yes(re.search(r'Library Availability\s+(\S+)', t).group(1))
    d['playground'] = yes(re.search(r'Playground Available\s+(\S+)', t).group(1))
    d['internet'] = yes(re.search(r'Internet\s+(\S+)', t).group(1))
    m = re.search(r'Transport\s+(\d+)\s+(\d+)', t); d['transport_pri'], d['transport_upr'] = (int(m.group(1)), int(m.group(2))) if m else (None, None)
    m = re.search(r'Grants Receipt\s+([\d.]+)\s+Grants Expenditure\s+([\d.]+)', t); d['grant_receipt'], d['grant_spent'] = (float(m.group(1)), float(m.group(2))) if m else (None, None)
    m = re.search(r'Regular\s+(\d+)\s+Male\s+(\d+)', t); d['teachers_regular'] = int(m.group(1))
    m = re.search(r'Male\s+\d+\s*\n.*?Female\s+(\d+)', t, re.S)
    d['teachers'] = int(re.search(r'Total\s+(\d+)\s*\n\s*(?:11-|6-H)', t).group(1)) if re.search(r'Total\s+(\d+)\s*\n\s*(?:11-|6-H)', t) else None
    # enrolment by class: the "Total ... G.Total" rows of the social-category table
    blk = t.split('Enrolment (By Social Category)')[1].split('--- page')[0]
    rows = re.findall(r'\nTotal\s+((?:\d+\s+){28}\d+)', blk)
    g = re.findall(r'\nG\.Total\s+((?:\d+\s+){14}\d+)', blk)
    tot = [int(x) for x in rows[0].split()]
    classes = ['Pre-Pri', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII']
    d['by_class'] = {c: {'boys': tot[2 * i], 'girls': tot[2 * i + 1]} for i, c in enumerate(classes)}
    d['boys'], d['girls'], d['enrol_total'] = tot[26], tot[27], tot[28]
    d['enrol_preprimary'] = d['by_class']['Pre-Pri']['boys'] + d['by_class']['Pre-Pri']['girls']
    d['enrol_primary'] = sum(d['by_class'][c]['boys'] + d['by_class'][c]['girls'] for c in classes[1:6])
    d['enrol_upper_primary'] = sum(d['by_class'][c]['boys'] + d['by_class'][c]['girls'] for c in classes[6:9])
    m = re.search(r'\nCWSN\s+((?:\d+\s+){28}\d+)', t); d['cwsn'] = int(m.group(1).split()[-1]) if m else 0
    m = re.search(r'\nBPL\s+((?:\d+\s+){28}\d+)', t); d['bpl'] = int(m.group(1).split()[-1]) if m else 0
    d['year'] = '2025-26'
    return d

if __name__ == '__main__':
    out = {p.stem: parse(p) for p in sorted(HERE.glob('*.txt'))}
    (HERE / 'schools.json').write_text(json.dumps(out, indent=2, ensure_ascii=False) + '\n')
    for k, v in out.items():
        print(k, v['udise_code'], v['block'], v['category'], v['classes'], '| enrol', v['enrol_total'], f"(pre {v['enrol_preprimary']}, pri {v['enrol_primary']}, upr {v['enrol_upper_primary']}, boys {v['boys']}, girls {v['girls']})", '| teachers', v['teachers'], '| rooms', v['classrooms'], v['rooms_good'], v['rooms_minor'], v['rooms_major'], '| toilets g', v['toilets_girls_func'], 'ramps', v['ramps'], 'road', v['all_weather_road'], 'water', v['drinking_water'], 'transport', v['transport_pri'], v['transport_upr'], 'grant', v['grant_receipt'])
