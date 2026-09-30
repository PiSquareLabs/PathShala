/* A live "thinking" timeline for the AI's background work: what it is doing in plain words, why, and what it found.
   One feed per investigation, kept in memory; any number of views (the working card, the dock) can show it. */
import { esc } from './helpers.js';

const feeds = new Map(), views = new Set(); let seq = 0;
const feed = inv => { if (!feeds.has(inv)) feeds.set(inv, []); return feeds.get(inv); };
const ping = () => views.forEach(v => v());
export const feedPing = ping;
export function feedPush(inv, item) { const it = { id: ++seq, state: 'done', ...item }; feed(inv).push(it); if (feed(inv).length > 80) feed(inv).shift(); ping(); return it.id; }
export function feedSet(inv, id, patch) { const it = feed(inv).find(x => x.id === id); if (it) { Object.assign(it, patch); ping(); } }
export const feedItems = inv => feed(inv).slice();
export function feedHtml(items, { max = 14 } = {}) {
  const shown = items.slice(-max);
  return `<ol class="think" aria-live="polite">${shown.map(x => x.level === 'stage'
    ? `<li class="tstage"><span class="tdot"></span><b>${esc(x.text)}</b></li>`
    : `<li class="tstep ${x.state}"><span class="tdot"></span><div><span class="ttx">${esc(x.text)}${x.state === 'run' ? '…' : ''}</span>${x.why ? `<div class="twhy">${esc(x.why)}</div>` : ''}${x.state === 'done' && x.summary ? `<div class="tres">${esc(x.summary)}</div>` : ''}</div></li>`).join('')}</ol>`;
}
/* Show a feed in an element and keep it live. Only the latest mount of each element stays subscribed. */
export function mountFeed(el, inv, opts) {
  const draw = () => { if (!el.isConnected) { views.delete(draw); return; } el.innerHTML = feedHtml(feed(inv), opts); el.scrollTop = el.scrollHeight; };
  views.add(draw); draw(); return () => views.delete(draw);
}
/* The newest thing the AI is doing, for one-line displays. */
export const feedNow = inv => { const f = feed(inv), run = f.filter(x => x.state === 'run').at(-1) || f.at(-1); return run ? run.text : ''; };
export const onFeed = fn => { views.add(fn); return () => views.delete(fn); };
