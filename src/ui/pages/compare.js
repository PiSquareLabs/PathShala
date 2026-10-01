import { nearby, routeHazards } from '../../case/analysis.js';
import { addOption, optionIds, removeOption, routeInfo } from '../../case/options.js';
import { q, q1 } from '../../db/sqlite.js';
import { $, $$, P, capOf, esc, facts, school } from '../helpers.js';
import { fold, scoreBar } from '../kit.js';
import { caseMapPanel } from '../map/caseMap.js';
import { render } from '../router.js';

const yn = v => (v == null ? 'Not recorded' : v ? '<span class="yes">Yes</span>' : '<span class="no">No</span>');

const ROWSRC = {"Screening score": "PathShala (derived)", "Free seats": "UDISE+ rooms × planning norm", "By road": "Google Routes API / PathShala estimate", "On foot": "Google Routes API / PathShala estimate", "RTE walking limit": "RTE Rules 2010", "Climb": "Google Elevation API", "Mapped hazards": "OpenStreetMap, JRC", "Students · teachers": "UDISE+", "Building": "UDISE+", "Facilities": "UDISE+ report card", "Citizen feedback": "PathShala (synthesised)"};
const cnt = v => (v == null ? 'Not recorded' : v);

/* One column per candidate receiving school. Every row is data that has a real source (UDISE+, Routes and
   Elevation APIs, GIS layers) or is derived from it; where there is none it says so. */
function columnData(A, id) {
  const B = school(id), rt = routeInfo(A.school_id, id), f = facts(id), cap = capOf(B), avail = Math.max(0, cap - B.enrol_total);
  const hz = rt.L ? routeHazards(rt.L) : [];
  const fb = q1('SELECT count(*) AS n FROM citizen_feedback WHERE about_id = ?', [id]).n;
  return { B, rt, f, cap, avail, hz, fb };
}

export function stepCompare(el, I) {
  const inv = I.inv_id, A = school(I.from_id), R = P(), ids = optionIds(inv), cols = ids.map(id => columnData(A, id)), fa = facts(A.school_id);
  const limit = A.level_code === 'primary' ? R.walk_limit_primary_km : R.walk_limit_upper_km;
  const many = cols.length > 1;
  const scored = nearby(A.school_id, 99), score = cols.map(x => scored.find(n => n.s.school_id === x.B.school_id)?.score ?? 0);
  // rows: [label, cell(col, i) -> html, comparable value (or null), 'low' | 'high' is better]
  const rows = [
    ['Fit', null],
    ['Screening score', (x, i) => scoreBar(score[i]), (x, i) => score[i], 'high'],
    ['Free seats', x => `<b>${x.avail}</b> <span class="${x.avail >= A.enrol_total ? 'yes' : 'no'}">${x.avail >= A.enrol_total ? '✓' : '✗'}</span><span class="sub">for ${A.enrol_total} students · ${x.B.classrooms} rooms, ${x.cap} seats</span>`, x => x.avail, 'high'],
    ['Getting there', null],
    ['By road', x => `<b>${x.rt.road_km} km</b>${x.rt.est ? '*' : ''}<span class="sub">${x.rt.road_min ? `about ${x.rt.road_min} min` : 'time not available'}</span>`, x => x.rt.road_km, 'low'],
    ['On foot', x => `<b>${x.rt.walk_km} km</b>${x.rt.est ? '*' : ''}<span class="sub">${x.rt.wp ? `about ${x.rt.wp.min} min for a young child` : `about ${x.rt.walk_min} min (estimate)`}</span>`, x => x.rt.walk_km, 'low'],
    ['RTE walking limit', x => x.rt.walk_km > limit ? `<span class="no">Over ${limit} km</span>` : `<span class="yes">Within ${limit} km</span>`, null],
    ['Climb', x => x.rt.wp ? `${x.rt.wp.climb} m up · ${x.rt.wp.descent} m down` : 'Data unavailable', null],
    ['Mapped hazards', x => x.hz.length ? x.hz.map(h => esc(h.name)).join(', ') : x.rt.L ? 'None mapped' : 'Data unavailable', x => (x.rt.L ? x.hz.length : null), 'low'],
    ['The school', null],
    ['Students · teachers', x => `${x.B.enrol_total} · ${x.B.teachers}<span class="sub">${(x.B.enrol_total / Math.max(1, x.B.teachers)).toFixed(0)} pupils per teacher</span>`, null],
    ['Building', x => esc(x.f.building || 'Not recorded'), null],
    ['Facilities', x => `Girls' toilets ${cnt(x.f.toilets_girls)}<br>Boys' toilets ${cnt(x.f.toilets_boys)}<br>Ramp ${yn(x.f.ramp)} · Handrails ${yn(x.f.handrails)}<br>Drinking water ${yn(x.f.drinking_water)} · Electricity ${yn(x.f.electricity)}<br>All-weather road ${yn(x.f.all_weather_road)}`, null],
    ['Citizen feedback', x => (x.fb ? `${x.fb} messages` : 'None recorded'), null],
  ];
  const best = (fn, dir) => {
    if (!many || !fn) return new Set();
    const v = cols.map(fn), ok = v.filter(n => n != null);
    if (ok.length < 2 || new Set(ok).size === 1) return new Set();
    const t = dir === 'low' ? Math.min(...ok) : Math.max(...ok);
    return new Set(v.map((n, i) => (n === t ? i : -1)).filter(i => i >= 0));
  };
  const others = nearby(A.school_id, 15).filter(n => !ids.includes(n.s.school_id));
  const habs = q('SELECT * FROM habitations WHERE school_id = ?', [A.school_id]);
  el.innerHTML = `<div class="cmp-top">
      <div class="card"><div class="eyebrow">Closing school</div><h2 style="font-size:24px;margin:2px 0 10px">${esc(A.name)}</h2>
        <dl class="kv2"><dt>Students</dt><dd>${A.enrol_total}${A.enrol_preprimary ? ` (${A.enrol_preprimary} pre-primary)` : ''}</dd><dt>Teachers</dt><dd>${A.teachers} · ${A.classrooms} classrooms</dd>
          <dt>Building</dt><dd>${esc(fa.building || 'Not recorded')}</dd><dt>Data</dt><dd><span class="tag ${A.source}">${A.source}</span> <span class="small muted">${esc(A.source_note || '')}</span>${fa.source_url ? ` · <a href="${esc(fa.source_url)}" target="_blank" rel="noopener">source</a>` : ''}</dd></dl>
        ${habs.length ? fold(`Habitations nearby`, `<table class="tbl"><thead><tr><th>Habitation</th><th>Height</th><th>Road</th></tr></thead><tbody>${habs.map(h => `<tr><td><b>${esc(h.name)}</b></td><td>${h.elev_m} m</td><td>${h.road_connected ? 'Connected' : '<span class="t-red">No road</span>'}</td></tr>`).join('')}</tbody></table>`, { count: habs.length }) : ''}</div>
      ${caseMapPanel()}</div>
    <div class="row"><h2 style="font-size:20px">${many ? `Compare ${cols.length} receiving schools` : 'Receiving school'}</h2>
      <div class="adder">${others.length ? `<select id="cmp-add" aria-label="Add a school to compare"><option value="">Add another school…</option>${others.slice(0, 10).map(n => `<option value="${n.s.school_id}">${esc(n.s.name)} · ${n.road} km</option>`).join('')}</select><button class="btn sm" id="cmp-add-go">Add</button>` : ''}</div></div>
    <div class="cmpwrap"><table class="cmptbl"><thead><tr><th></th>${cols.map(x => `<th><div class="oh"><b>${esc(x.B.name)}</b><span class="small muted">${esc(x.B.block)} block · <span class="tag ${x.B.source}">${x.B.source}</span></span>
        ${many ? `<div class="row"><button class="btn sm ghost" data-remove="${x.B.school_id}" aria-label="Remove ${esc(x.B.name)}">Remove</button></div>` : ''}</div></th>`).join('')}</tr></thead>
      <tbody>${rows.map(([label, cell, val, dir]) => {
        if (!cell) return `<tr class="grp"><th colspan="${cols.length + 1}">${label}</th></tr>`;
        const b = best(val, dir);
        return `<tr><th scope="row">${label}<span class="src">${ROWSRC[label] || ''}</span></th>${cols.map((x, i) => `<td class="${b.has(i) ? 'best' : ''}">${cell(x, i)}</td>`).join('')}</tr>`;
      }).join('')}</tbody></table></div>
    <p class="small muted">* straight-line estimate, route not surveyed. Green marks the best value in a row. The score is a screening aid, not a recommendation. Investigate every school, then choose one on the last step.</p>`;
  $$('[data-remove]', el).forEach(b => b.onclick = () => { removeOption(inv, b.dataset.remove); render(); });
  const add = $('#cmp-add-go', el); if (add) add.onclick = () => { const v = $('#cmp-add').value; if (v) { addOption(inv, v); render(); } };
}
