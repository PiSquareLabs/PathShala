import { nearby } from '../../case/analysis.js';
import { createCase } from '../../case/options.js';
import { q, q1 } from '../../db/sqlite.js';
import { $, $$, caseState, esc, facts, go, hasTable, school } from '../helpers.js';
import { scoreBar } from '../kit.js';
import { buildCaseMap, drawPicks } from '../map/caseMap.js';
import { startDemo } from '../demo.js';
import { render } from '../router.js';

const SEND_BADGE = s => (s.enrol_total <= 10 ? 'var(--risk)' : 'var(--accent)');

/* Investigate home: pick ONE sending school, then tick SEVERAL receiving schools to compare side by side. */
export function renderCaseHome(app) {
  const sel = caseState.sel ? school(caseState.sel) : null;
  const cases = hasTable('investigations') ? q('SELECT * FROM investigations ORDER BY CAST(substr(inv_id, 2) AS INTEGER) DESC') : [];
  app.innerHTML = `<div class="home">
    <div class="mapwrap"><div id="hmap" role="img" aria-label="District map of schools"></div>
      <div class="maplegend">
        <span class="lgc"><span class="lg"><i style="background:var(--risk)"></i>10 or fewer students</span><span class="lg"><i style="background:var(--accent)"></i>Other schools</span></span>
        <span class="lgc">${['Kullu', 'Kangra', 'Bilaspur', 'All'].map(d => `<button class="btn sm ${caseState.district === d ? 'primary' : ''}" data-d="${d}">${d === 'All' ? 'All HP' : d}</button>`).join('')}</span>
      </div></div>
    <aside class="panel" id="cpanel">${sel ? senderPanel(sel) : startPanel(cases)}</aside></div>`;
  $$('.maplegend [data-d]').forEach(b => b.onclick = () => { caseState.district = b.dataset.d; caseState.sel = null; caseState.picks = new Set(); render(); });
  $$('#cpanel [data-s]').forEach(b => b.onclick = () => { caseState.sel = b.dataset.s; caseState.picks = new Set(); render(); });
  const back = $('#cp-back'); if (back) back.onclick = () => { caseState.sel = null; caseState.picks = new Set(); render(); };
  const sync = () => {
    $$('#cpanel .pickrow').forEach(r => r.classList.toggle('on', caseState.picks.has(r.dataset.b)));
    const n = caseState.picks.size, b = $('#cp-go');
    if (b) { b.disabled = !n; b.textContent = n ? `Compare ${n} school${n > 1 ? 's' : ''}` : 'Tick schools to compare'; }
    drawPicks();
  };
  $$('#cpanel .pickrow input').forEach(i => i.onchange = () => { const id = i.closest('.pickrow').dataset.b; i.checked ? caseState.picks.add(id) : caseState.picks.delete(id); sync(); });
  const top = $('#cp-top'); if (top) top.onclick = () => {
    nearby(caseState.sel).slice(0, 3).forEach(x => caseState.picks.add(x.s.school_id));
    $$('#cpanel .pickrow input').forEach(i => { i.checked = caseState.picks.has(i.closest('.pickrow').dataset.b); }); sync();
  };
  const go_ = $('#cp-go'); if (go_) go_.onclick = () => { const cid = createCase(caseState.sel, [...caseState.picks]); go(`case/${cid}/compare`); };
  const dm = $('#demo-start'); if (dm) dm.onclick = startDemo;
  buildCaseMap();
  if (sel) sync();
}

function startPanel(cases) {
  const list = q("SELECT s.* FROM schools s LEFT JOIN school_facts f USING (school_id) WHERE (s.enrol_total <= 30 OR f.building LIKE 'Poor%' OR f.building LIKE 'Unsafe%') AND (? = 'All' OR s.district = ?) ORDER BY (f.building LIKE 'Poor%' OR f.building LIKE 'Unsafe%') DESC, s.enrol_total", [caseState.district, caseState.district]).slice(0, 7);
  return `<div><div class="eyebrow">${caseState.district === 'All' ? 'Himachal Pradesh' : caseState.district + ' district'}</div><h1 class="ptitle">Which school might close?</h1>
      <button class="btn primary" id="demo-start" style="margin-top:8px">▶ Quick demo: guide me</button>
      <p class="lead" style="margin-top:6px">Click a school on the map, or start with one that needs review.</p></div>
    <div class="rlist">${list.map(s => `<button class="srow" data-s="${s.school_id}" style="text-align:left;cursor:pointer;font:inherit"><span class="fd" style="background:${SEND_BADGE(s)}"></span><span class="nm">${esc(s.name)}</span><span class="small muted">${s.enrol_total} students</span><span class="mt">${esc(s.block)} block · ${esc(facts(s.school_id).building || 'building condition not recorded')}</span></button>`).join('')}</div>
    ${cases.length ? `<div><div class="eyebrow">Continue</div><div class="rlist" style="margin-top:8px">${cases.map(c => `<a class="srow" href="#/case/${c.inv_id}"><span class="fd" style="background:${c.status === 'Ready for administrative review' ? 'var(--ok)' : 'var(--wait)'}"></span><span class="nm">${esc(school(c.from_id).name)}</span><span class="small muted">${c.inv_id}</span><span class="mt">${esc(c.status)}</span></a>`).join('')}</div></div>` : ''}`;
}

function senderPanel(s) {
  const f = facts(s.school_id), nb = nearby(s.school_id);
  const inMerge = q1('SELECT merge_id FROM merge_groups WHERE sending_id = ? OR receiving_id = ?', [s.school_id, s.school_id]);
  return `<div class="row"><button class="btn sm ghost" id="cp-back">← All schools</button>${inMerge ? `<a class="small" href="#/m/${inMerge.merge_id}">In merge ${inMerge.merge_id} →</a>` : ''}</div>
    <div class="sendcard"><div class="eyebrow">Closing school</div><h1>${esc(s.name)}</h1>
      <span class="small muted">${esc(s.block)} block · ${s.enrol_total} students · ${s.teachers} teachers · ${s.classrooms} classrooms</span>
      <span class="small muted">Building: ${esc(f.building || 'not recorded')}</span></div>
    <div><div class="row"><div class="eyebrow">Compare receiving schools</div>${nb.length > 1 ? '<button class="linkbtn" id="cp-top">Pick the best 3</button>' : ''}</div>
      <div class="pick" style="margin-top:8px">${nb.slice(0, 8).map(x => `<label class="pickrow" data-b="${x.s.school_id}"><input type="checkbox" aria-label="Compare ${esc(x.s.name)}" ${caseState.picks.has(x.s.school_id) ? 'checked' : ''}>
        <span class="nm">${esc(x.s.name)}</span><span class="mt">${x.road} km${x.est ? '*' : ''} by road · ${x.avail} free seats</span>
        <span title="${esc(x.parts.map(p => `${p[0]}: ${Math.round(p[1])} (${p[2]})`).join('\n'))}">${scoreBar(x.score)}</span></label>`).join('') || '<p class="empty">No school of the same level within 12 km.</p>'}</div>
      <p class="small muted" style="margin-top:8px">Score is a screening aid, not a recommendation. * straight-line estimate.</p></div>
    <button class="btn primary" id="cp-go" disabled>Tick schools to compare</button>`;
}
