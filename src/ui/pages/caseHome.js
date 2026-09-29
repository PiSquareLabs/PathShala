import { createCase, nearby } from '../../case/analysis.js';
import { q, q1 } from '../../db/sqlite.js';
import { $, $$, caseState, esc, facts, go, hasTable, school } from '../helpers.js';
import { buildCaseMap, drawPick } from '../map/caseMap.js';
import { render } from '../router.js';

export function renderCaseHome(app) {
  const sel = caseState.sel ? school(caseState.sel) : null;
  const cases = hasTable('cases') ? q('SELECT * FROM cases ORDER BY case_id DESC') : [];
  app.innerHTML = `<div class="home">
    <div class="mapwrap"><div id="hmap" role="img" aria-label="District map of schools"></div>
      <div class="maplegend"><b>Schools</b>
        <span class="lgc"><span class="lg"><i style="background:var(--risk)"></i>10 or fewer students</span><span class="lg"><i style="background:var(--accent)"></i>Other schools</span><span class="lg"><i class="hollow"></i>Selected</span></span>
        <span class="lgc">${['Kullu', 'Kangra', 'Bilaspur', 'All'].map(d => `<button class="btn sm ${caseState.district === d ? 'primary' : ''}" data-d="${d}">${d === 'All' ? 'All HP' : d}</button>`).join('')}</span>
      </div></div>
    <aside class="panel" id="cpanel">${sel ? schoolPanel(sel) : `
      <div><div class="eyebrow">Case map · ${caseState.district === 'All' ? 'Himachal Pradesh' : caseState.district + ' district'}</div><h1 class="ptitle">Find a school to investigate</h1>
        <p class="muted" style="margin-top:6px">Click a school on the map. PathShala lists nearby schools that could receive its students, with an initial screening score.</p></div>
      <div><div class="eyebrow">Schools to review · unsafe building or small enrolment</div><div class="rlist" style="margin-top:8px">${q("SELECT s.* FROM schools s LEFT JOIN school_facts f USING (school_id) WHERE (s.enrol_total <= 30 OR f.building LIKE 'Poor%' OR f.building LIKE 'Unsafe%') AND (? = 'All' OR s.district = ?) ORDER BY (f.building LIKE 'Poor%' OR f.building LIKE 'Unsafe%') DESC, s.enrol_total", [caseState.district, caseState.district]).slice(0, 7).map(s => `<button class="srow" data-s="${s.school_id}" style="text-align:left;cursor:pointer;font:inherit"><span class="fd" style="background:${s.enrol_total <= 10 ? 'var(--risk)' : 'var(--accent)'}"></span><span class="nm">${esc(s.name)}</span><span class="small muted">${s.enrol_total} students</span><span class="mt">${esc(s.block)} block · ${esc(facts(s.school_id).building || 'building condition unknown')}</span></button>`).join('')}</div></div>
      ${cases.length ? `<div><div class="eyebrow">Your investigations</div><div class="rlist" style="margin-top:8px">${cases.map(c => `<a class="srow" href="#/case/${c.case_id}"><span class="fd" style="background:${c.status === 'Ready for administrative review' ? 'var(--ok)' : 'var(--wait)'}"></span><span class="nm">${esc(school(c.from_id).name)} → ${esc(school(c.to_id).name)}</span><span class="small muted">${c.case_id}</span><span class="mt">${esc(c.status)}</span></a>`).join('')}</div></div>` : ''}
      <p class="small muted">Existing merges and their success scores are under <a href="#/merges">Merges</a>.</p>`}
    </aside></div>`;
  $$('.maplegend [data-d]').forEach(b => b.onclick = () => { caseState.district = b.dataset.d; caseState.sel = null; render(); });
  $$('#cpanel [data-s]').forEach(b => b.onclick = () => { caseState.sel = b.dataset.s; caseState.pick = null; render(); });
  const back = $('#cp-back'); if (back) back.onclick = () => { caseState.sel = null; render(); };
  $$('#cpanel tr[data-b]').forEach(tr => tr.onclick = () => { caseState.pick = tr.dataset.b; $$('#cpanel tr[data-b]').forEach(x => x.classList.toggle('on', x === tr)); const b = $('#cp-go'); b.disabled = false; b.textContent = `Investigate ${school(caseState.sel).name} + ${school(tr.dataset.b).name}`; drawPick(); });
  const go_ = $('#cp-go'); if (go_) go_.onclick = () => { const cid = createCase(caseState.sel, caseState.pick); go(`case/${cid}/compare`); };
  buildCaseMap();
}
export function schoolPanel(s) {
  const f = facts(s.school_id), nb = nearby(s.school_id);
  const inMerge = q1('SELECT merge_id FROM merge_groups WHERE sending_id = ? OR receiving_id = ?', [s.school_id, s.school_id]);
  return `<div class="row"><button class="btn sm ghost" id="cp-back">← All schools</button>${inMerge ? `<a class="small" href="#/m/${inMerge.merge_id}">In merge ${inMerge.merge_id} →</a>` : ''}</div>
    <div><div class="eyebrow">${esc(s.level)} · ${esc(s.block)} block · ${esc(s.district)}</div><h1 class="ptitle">${esc(s.name)}</h1>
      <div class="meta" style="margin-top:6px"><span class="tag ${s.source}">${s.source}</span><span class="small muted">${esc(s.source_note || '')}</span></div></div>
    <div class="stats"><div class="stat"><b>${s.enrol_total}</b><span>students</span></div><div class="stat"><b>${s.teachers}</b><span>teachers</span></div>
      <div class="stat"><b>${f.habitations ?? '—'}</b><span>habitations served</span></div><div class="stat"><b style="font-size:15px;line-height:1.3">${esc(f.building || 'Data unavailable')}</b><span>building</span></div></div>
    <div><div class="eyebrow">Nearby schools that could receive these students</div>
      <table class="tbl ntbl" style="margin-top:6px"><thead><tr><th>School</th><th>Distance</th><th>Students</th><th>Capacity</th><th title="Initial screening score">Screening</th></tr></thead>
      <tbody>${nb.slice(0, 6).map(x => `<tr data-b="${x.s.school_id}" class="${caseState.pick === x.s.school_id ? 'on' : ''}"><td><b>${esc(x.s.name)}</b></td><td>${x.road} km${x.est ? '<sup title="Estimated from straight line">*</sup>' : ''}</td><td>${x.s.enrol_total}</td><td>${x.avail} available</td>
        <td><span class="scr" style="--v:${x.score}" title="${esc(x.parts.map(p => `${p[0]}: ${Math.round(p[1])} (${p[2]})`).join('\n'))}">${x.score}</span></td></tr>`).join('') || '<tr><td colspan="5" class="muted">No schools of the same level within 12 km.</td></tr>'}</tbody></table>
      <p class="small muted" style="margin-top:6px">The score is an <b>initial screening score, not a merger recommendation</b>. It starts at 100 and subtracts road distance, missing seats, walking time over 30 minutes and mapped hazards (hover a score to see the parts). * estimated from straight-line distance.</p></div>
    <button class="btn primary" id="cp-go" ${caseState.pick ? '' : 'disabled'}>${caseState.pick ? `Investigate ${esc(s.name)} + ${esc(school(caseState.pick).name)}` : 'Select a school to investigate'}</button>`;
}
