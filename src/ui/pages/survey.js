import { q, q1, run } from '../../db/sqlite.js';
import { classify } from '../../engine/classify.js';
import { IMPL } from '../../engine/merges.js';
import { HAZARD_ANSWER, commit } from '../../engine/rules.js';
import { $, $$, esc, go, implOf, mCrumbs, pairsOf, place, plural, school, state, today } from '../helpers.js';
import { toast } from '../toast.js';

export function renderSurvey(pg, m) {
  const ps = pairsOf(m.merge_id);
  const unk = q('SELECT * FROM unknowns WHERE merge_id = ?', [m.merge_id]);
  const done = q('SELECT * FROM surveys WHERE merge_id = ? ORDER BY survey_id DESC', [m.merge_id]);
  pg.innerHTML = `${mCrumbs(m, ['Field survey'])}
    <section class="ph"><div class="eyebrow">For the block education officer or cluster coordinator</div><h1>Field survey form</h1>
      <div class="sub">Visit ${ps.map(g => esc(place(school(g.sending_id)))).join(', ')} and ${esc(m.r_name)}. Fill what you can; blank fields stay open. Submitting saves to SQLite and re-runs the plan.</div></section>
    <section class="card"><div class="g2"><label class="f">Surveyed by<input type="text" id="sv-agent" value="${esc(state.agent || 'BEO Kullu-II')}"></label><label class="f">Visit date<input type="text" id="sv-date" value="${today()}"></label></div></section>
    ${ps.map(g => {
      const s = school(g.sending_id);
      const u = unk.filter(x => x.group_id === g.group_id);
      const qs = q('SELECT qn.*, a.choice, a.note FROM questions qn LEFT JOIN answers a USING (group_id, kind) WHERE qn.group_id = ? ORDER BY a.choice IS NOT NULL, qn.critical DESC', [g.group_id]);
      const items = g.status !== 'Proposed' ? q("SELECT * FROM plan_items WHERE group_id = ? AND kind != 'rejected' AND code != 'proceed' ORDER BY seq", [g.group_id]) : [];
      const im = implOf(g.group_id);
      return `<section class="card svsec" data-g="${g.group_id}">
        <h2>At ${esc(s.name)} <small>${esc(s.village)} → ${esc(m.r_name)}</small></h2>
        <div><div class="eyebrow">1 · Data to check on the ground</div>
          ${u.length ? u.map(x => `<div class="fld"><span>${esc(x.label)}</span><span class="in"><input type="number" step="any" data-f="${x.field}" aria-label="${esc(x.label)}"><span>${esc(x.unit)}</span></span><span class="cur">${x.current ? 'Current value: ' + esc(x.current) + ' (not verified)' : 'Not known'}</span></div>`).join('') : '<p class="muted small" style="margin-top:6px">Nothing unknown here.</p>'}</div>
        <div><div class="eyebrow">2 · Ask the community</div>
          ${qs.map(x => `<div class="sq" data-k="${x.kind}" data-orig="${esc(x.choice || '')}"><span class="role small muted">To: ${esc(x.role)}${x.critical && !x.choice ? ' · <span class="st crit">Key</span>' : ''}</span><span class="en">${esc(x.text_en)}</span><span class="hi" lang="hi">${esc(x.text_hi)}</span>
            <div class="opts">${JSON.parse(x.options).map(([v, l]) => `<button type="button" data-v="${v}" aria-pressed="${x.choice === v}">${esc(l)}</button>`).join('')}</div>
            <input type="text" class="qnote" placeholder="What they said (optional)" value="${esc(x.note || '')}"></div>`).join('') || '<p class="muted small">No questions.</p>'}</div>
        ${items.length ? `<div><div class="eyebrow">3 · Are the policies delivered?</div>${items.map(it => `<div class="polrow"><span>${esc(it.title)}</span><select data-c="${it.code}" data-orig="${esc(im[it.code]?.status || 'not started')}" aria-label="Status of ${esc(it.title)}">${IMPL.map(x => `<option ${x === (im[it.code]?.status || 'not started') ? 'selected' : ''}>${x}</option>`).join('')}</select></div>`).join('')}</div>` : ''}
        <div><div class="eyebrow">${items.length ? 4 : 3} · Interview notes</div>
          <div class="g2" style="margin-top:6px"><label class="f">Who you spoke to<input type="text" class="nrole" value="Parent"></label><span></span></div>
          <textarea class="nt" rows="2" placeholder="Write what people said, in Hindi or English. Each note becomes a feedback message." style="margin-top:8px"></textarea></div>
      </section>`; }).join('')}
    <div class="row"><span class="small muted">${done.length ? `${plural(done.length, 'field')} already filled on earlier visits.` : 'No earlier visits.'}</span><button class="btn primary" id="sv-go">Submit survey and re-run the plan</button></div>`;
  $$('.sq', pg).forEach(sq => $$('.opts button', sq).forEach(b => b.onclick = () => { const on = b.getAttribute('aria-pressed') === 'true'; $$('.opts button', sq).forEach(x => x.setAttribute('aria-pressed', 'false')); b.setAttribute('aria-pressed', on ? 'false' : 'true'); }));
  $('#sv-go').onclick = () => {
    const agent = $('#sv-agent').value.trim() || 'Field officer', date = $('#sv-date').value.trim() || today();
    state.agent = agent;
    let n = 0;
    commit('Field survey saved', () => {
      $$('.svsec', pg).forEach(sec => {
        const gid = sec.dataset.g, g = q1('SELECT * FROM merge_groups WHERE group_id = ?', [gid]);
        $$('input[data-f]', sec).forEach(inp => {
          const v = inp.value.trim(); if (v === '') return; const f = inp.dataset.f, num = +v; n++;
          const note = `Field survey ${date} by ${agent}`;
          if (f === 'walk_min') run("UPDATE routes SET walk_min = ?, source = 'survey', source_note = ? WHERE group_id = ?", [Math.round(num), note, gid]);
          if (f === 'walk_km') run("UPDATE routes SET walk_km = ?, source = 'survey', source_note = ? WHERE group_id = ?", [num, note, gid]);
          if (f === 'climb_m') run('UPDATE routes SET climb_m = ? WHERE group_id = ?', [Math.round(num), gid]);
          if (f === 'road_km') run('UPDATE routes SET road_km = ? WHERE group_id = ?', [num, gid]);
          if (f === 'classrooms') run("UPDATE schools SET classrooms = ?, source_note = source_note || ' · rooms verified by survey' WHERE school_id = ?", [Math.round(num), g.receiving_id]);
          if (f === 'teachers') run("UPDATE schools SET teachers = ?, source_note = source_note || ' · teachers verified by survey' WHERE school_id = ?", [Math.round(num), g.receiving_id]);
          if (f === 'attendance') { const mo = date.slice(0, 7); run('DELETE FROM attendance WHERE group_id = ? AND month = ?', [gid, mo]); run('INSERT INTO attendance VALUES (?,?,?,?,?)', [gid, mo, g.receiving_id, num, 'survey']); }
          run('INSERT INTO surveys (merge_id, group_id, field, value, agent, done_on) VALUES (?,?,?,?,?,?)', [m.merge_id, gid, f, v, agent, date]);
        });
        $$('.sq', sec).forEach(sq => {
          const on = $('.opts button[aria-pressed="true"]', sq), note = $('.qnote', sq).value.trim(), kind = sq.dataset.k;
          if (!on || (on.dataset.v === sq.dataset.orig && !note)) return;
          n++;
          run('INSERT OR REPLACE INTO answers VALUES (?,?,?,?,?,?)', [gid, kind, on.dataset.v, note, date, 'survey']);
          if (kind === 'hazard') {
            run("DELETE FROM hazards WHERE group_id = ? AND data_source = 'Community answer'", [gid]);
            const h = HAZARD_ANSWER[on.dataset.v]; if (h) run('INSERT INTO hazards (group_id, kind, label, months, month_list, severity, data_source, source) VALUES (?,?,?,?,?,?,?,?)', [gid, on.dataset.v, h[0], h[1], h[2], h[3], 'Community answer', 'survey']);
          }
        });
        $$('select[data-c]', sec).forEach(sel => { if (sel.value !== sel.dataset.orig) { n++; run('INSERT OR REPLACE INTO implementation VALUES (?,?,?,?,?,?)', [gid, sel.dataset.c, sel.value, `Field survey by ${agent}`, date, 'survey']); } });
        const t = $('.nt', sec).value.trim();
        if (t) { n++; const c = classify(t); run(`INSERT INTO feedback (group_id, received, channel, language, sender_role, text_original, text_en, issue, severity, sentiment, verification, verified_by, source, based_on) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [gid, date, 'Field survey', c.lang, $('.nrole', sec).value || 'Villager', t, c.lang === 'en' ? t : null, c.issue, c.severity, c.sentiment, 'verified', agent, 'survey', 'Field survey']); }
      });
    });
    if (!n) toast('Nothing filled in', ['Enter at least one value, answer or note.']);
  };
}
