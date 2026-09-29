import { q } from '../../db/sqlite.js';
import { capOf, esc, facts } from '../helpers.js';

export function stepCompare(el, c, A, B) {
  const fa = facts(A.school_id), fb_ = facts(B.school_id), avail = Math.max(0, capOf(B) - B.enrol_total);
  const hab = q('SELECT * FROM habitations WHERE school_id = ?', [A.school_id]);
  const col = (s, f, role, extra) => `<div class="card cmpcol"><div class="eyebrow">${role}</div><h2 style="font-size:22px">${esc(s.name)}</h2>
    <div class="bignums"><div><b>${s.enrol_total}</b><span>students</span></div><div><b>${s.teachers}</b><span>teachers</span></div>${extra}</div>
    <table class="tbl"><tbody>
      <tr><td class="muted">Classrooms</td><td>${s.classrooms}</td></tr>
      <tr><td class="muted">Capacity</td><td>${capOf(s)}${f.capacity ? '' : ' (estimate)'}</td></tr>
      <tr><td class="muted">Building</td><td>${esc(f.building || 'Data unavailable')}</td></tr>
      <tr><td class="muted">Head teacher</td><td>${f.head_teacher == null ? 'Data unavailable' : f.head_teacher ? 'Yes' : 'No'}</td></tr>
      <tr><td class="muted">Girls' toilet · ramp</td><td>${f.toilets_girls == null ? 'Data unavailable' : (f.toilets_girls ? 'Yes' : 'No') + ' · ' + (f.ramp ? 'Yes' : 'No')}</td></tr>
      <tr><td class="muted">Data</td><td><span class="tag ${s.source}">${s.source}</span> <span class="small muted">${esc(s.source_note || '')}</span>${f.source_url ? ` · <a href="${esc(f.source_url)}" target="_blank" rel="noopener">source</a>` : ''}</td></tr>
    </tbody></table></div>`;
  el.innerHTML = `<div class="two">${col(A, fa, 'School A · would close', `<div><b>${hab.length || fa.habitations || '—'}</b><span>habitations served</span></div>`)}
    ${col(B, fb_, 'School B · would receive', `<div><b class="${avail >= A.enrol_total ? 't-green' : 't-red'}">${avail}</b><span>available seats</span></div>`)}</div>
    <div class="card"><h2>Habitations served by ${esc(A.name)}</h2><table class="tbl"><thead><tr><th>Habitation</th><th>Children</th><th>Girls</th><th>With a disability</th><th>Road</th><th>Height</th></tr></thead>
      <tbody>${hab.map(h => `<tr><td><b>${esc(h.name)}</b></td><td>${h.children}</td><td>${h.girls}</td><td>${h.cwsn}</td><td>${h.road_connected ? 'Connected' : '<span class="t-red">No road</span>'}</td><td>${h.elev_m} m</td></tr>`).join('') || '<tr><td colspan="6" class="muted">Data unavailable</td></tr>'}</tbody></table>
      <p class="small muted" style="margin-top:6px"><span class="tag mock">mock</span> Habitation counts are illustrative; in the full build they come from the UDISE+ habitation mapping.</p></div>`;
}
