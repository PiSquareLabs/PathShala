import { feedbackHtml } from '../components.js';
import { esc, mCrumbs, pairsOf, short } from '../helpers.js';

export function renderMergeFeedback(pg, m) {
  const ps = pairsOf(m.merge_id);
  pg.innerHTML = `${mCrumbs(m, ['Feedback'])}<section class="ph"><div class="eyebrow">Merge into ${esc(m.r_name)}</div><h1>Feedback</h1></section>
    ${ps.map(g => `${ps.length > 1 ? `<h2 style="font-size:18px;margin-top:6px">${esc(g.s_name)} → ${esc(short(m.r_name))}</h2>` : ''}${feedbackHtml(g.group_id)}`).join('')}`;
}

/* ---------- field survey form ---------- */
