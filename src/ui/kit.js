/* Small building blocks used by every page, so pages stay short and consistent. */
import { esc } from './helpers.js';

/* Collapsible detail: the default way to keep secondary information out of the way. */
export const folds = {};                       // open/closed state by id, kept across re-renders
if (typeof document !== 'undefined') document.addEventListener('toggle', e => { if (e.target.matches?.('details.fold[id]')) folds[e.target.id] = e.target.open; }, true);

export const fold = (title, body, { open, count = null, cls = '', id = null } = {}) =>
  `<details class="fold ${cls}"${id ? ` id="${id}"` : ''}${(open ?? (id && folds[id])) ? ' open' : ''}><summary>${title}${count != null ? ` <span class="cnt">${count}</span>` : ''}</summary><div class="fold-b">${body}</div></details>`;

export const tile = (label, value, sub = '', cls = '') =>
  `<div class="tile ${cls}"><span class="tl">${label}</span><b>${value}</b>${sub ? `<span class="ts">${sub}</span>` : ''}</div>`;

export const pill = (text, cls = 's-pending') => `<span class="pill ${cls}">${esc(text)}</span>`;

/* Tab bar for pages that share a topic (to-do: problems and surveys). items: [[label, href, active, count?]] */
export const tabs = items => `<nav class="tabs">${items.map(([l, h, on, n]) => `<a href="${h}" aria-current="${on ? 'page' : 'false'}">${esc(l)}${n != null ? ` <span class="cnt">${n}</span>` : ''}</a>`).join('')}</nav>`;

export const pageHead = (eyebrow, title, sub = '') =>
  `<section class="ph">${eyebrow ? `<div class="eyebrow">${eyebrow}</div>` : ''}<h1>${title}</h1>${sub ? `<div class="sub">${sub}</div>` : ''}</section>`;

/* Score 0..100 as a bar with the number. */
export const scoreBar = v => `<span class="scorebar" title="Screening score ${v} of 100"><i style="width:${Math.max(0, Math.min(100, v))}%"></i><b>${v}</b></span>`;

export const empty = text => `<p class="empty">${esc(text)}</p>`;
