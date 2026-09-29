import { q, q1, run } from '../db/sqlite.js';
import { successHealth } from '../engine/merges.js';

export const $ = (s, el = document) => el.querySelector(s);
export const $$ = (s, el = document) => [...el.querySelectorAll(s)];
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
export const today = () => new Date().toISOString().slice(0, 10);
export const nowTime = () => new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
export const MONTHS = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const P = () => { const o = {}; q('SELECT param_name, param_value FROM rules').forEach(r => o[r.param_name] = r.param_value); return o; };
export const school = id => q1('SELECT * FROM schools WHERE school_id = ?', [id]);
export const place = s => (s.village || s.name).split(',')[0];
export const inr = n => {
  n = Math.round(n || 0);
  if (!n) return 'No cost';
  if (n >= 100000) { const l = n / 100000; return '₹' + (Number.isInteger(l) ? l : l.toFixed(2).replace(/0$/, '')) + ' lakh'; }
  return '₹' + n.toLocaleString('en-IN');
};
export const monthsText = list => list.map(m => MONTHS[m]).join(', ');
export function haversine(a, b) {
  const R = 6371, toR = x => x * Math.PI / 180;
  const dLat = toR(b.lat - a.lat), dLng = toR(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toR(a.lat)) * Math.cos(toR(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
export function groups() {
  return q(`SELECT g.*, s.name AS s_name, r.name AS r_name FROM merge_groups g JOIN schools s ON s.school_id = g.sending_id JOIN schools r ON r.school_id = g.receiving_id ORDER BY g.group_id`);
}
export const hasTable = t => !!q1("SELECT 1 AS x FROM sqlite_master WHERE type='table' AND name = ?", [t]);
export const facts = id => q1('SELECT * FROM school_facts WHERE school_id = ?', [id]) || {};
export const capOf = s => facts(s.school_id).capacity ?? s.classrooms * 40;
export const linkOf = (a, b) => q1('SELECT * FROM links WHERE from_id = ? AND to_id = ?', [a, b]) || q1('SELECT * FROM links WHERE from_id = ? AND to_id = ?', [b, a]);
export const nowTs = () => new Date().toISOString().replace('T', ' ').slice(0, 19);
export const logCase = (cid, actor, action, detail = '') => run('INSERT INTO case_log VALUES (?,?,?,?,?)', [cid, nowTs(), actor, action, detail]);
export const segKm = (a, b) => haversine({ lat: a[0], lng: a[1] }, { lat: b[0], lng: b[1] });

/* Tool: walking time from the elevation profile (Tobler's hiking function, scaled to a young child). */
export const sleep = ms => new Promise(r => setTimeout(r, ms));
export const STEPS = [['compare', 'Compare'], ['access', 'Access'], ['community', 'Community'], ['investigate', 'Investigate'], ['policy', 'Policy & cost'], ['report', 'Report']];
export const EV_LBL = { reported: 'Reported', verified: 'Verified', calculated: 'Calculated', needs: 'Needs verification' };
export const evChip = s => `<span class="evs ${s}">${EV_LBL[s] || s}</span>`;
export const caseState = { sel: null, district: 'Kullu', theme: null, layers: { river: true, road: true, route: true, habs: true, hazards: true } };
export const state = { inboxGroup: 'all', qFilter: 'open', sqlText: '', sqlResult: null, lastRun: nowTime(), draft: null, probFilter: 'all', plan: null };
export const route = () => location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
export const go = path => { location.hash = '#/' + path; };
export const HC = { green: 'var(--ok)', amber: 'var(--warn)', red: 'var(--risk)', pending: 'var(--wait)' };
export const colour = h => css({ green: '--ok', amber: '--warn', red: '--risk', pending: '--wait' }[h] || '--muted');
export const STATUS_CLS = { Merged: 's-green', Stayed: 's-red', Proposed: 's-pending' };
export const short = n => n.replace('Girls PM Shri ', 'Girls ');
export const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
export const mergeOf = gid => q1('SELECT merge_id FROM merge_groups WHERE group_id = ?', [gid])?.merge_id;
export const mergesAll = () => q(`SELECT m.*, r.name AS r_name, r.district, r.block, r.enrol_total AS r_enrol, r.classrooms AS r_rooms FROM merge_summary m JOIN schools r ON r.school_id = m.receiving_id ORDER BY m.merge_id`);
export const mergeRow = mid => mergesAll().find(m => m.merge_id === mid);
export const pairsOf = mid => q(`SELECT g.*, s.name AS s_name, s.enrol_total AS s_enrol, a.verdict, a.health, a.reason, a.moving, a.walk_km, a.stay_local, a.open_questions, a.one_time_inr, a.yearly_inr, a.conditions
  FROM merge_groups g JOIN schools s ON s.school_id = g.sending_id JOIN analysis a USING (group_id) WHERE g.merge_id = ? ORDER BY g.group_id`, [mid]);
export const mHealth = m => m.status === 'Merged' && m.success != null ? successHealth(m.success) : m.health;
export const mLine = m => m.status === 'Merged' && m.success != null ? `Success ${m.success}% · ${m.success_label}` : m.verdict;
export const implOf = gid => { const o = {}; q('SELECT code, status, note FROM implementation WHERE group_id = ?', [gid]).forEach(x => o[x.code] = x); return o; };
export const stChip = s => `<span class="stchip ${s === 'done' ? 'done' : s === 'in progress' ? 'prog' : 'none'}">${esc(s || 'not started')}</span>`;
export function tone(rows) {
  const pos = rows.filter(f => f.sentiment === 'positive').length, neg = rows.filter(f => f.sentiment === 'negative').length;
  return { pos, neg, n: rows.length, col: neg > pos ? css('--risk') : pos > 0 ? css('--ok') : css('--faint'), word: neg > pos ? 'mostly negative' : pos > 0 ? 'mostly positive' : 'no clear signal' };
}
export const crumbs = parts => `<div class="crumbs">${parts.map(([l, h], i) => (h ? `<a href="${h}">${esc(l)}</a>` : `<span>${esc(l)}</span>`) + (i < parts.length - 1 ? '<span>/</span>' : '')).join('')}</div>`;
export const mCrumbs = (m, ...rest) => crumbs([['Merges', '#/merges'], [short(m.r_name), rest.length ? '#/m/' + m.merge_id : null], ...rest]);
