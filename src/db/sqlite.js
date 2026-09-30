import seedSql from './seed.sql?raw';
import initSqlJs from 'sql.js';
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url';
import { CASE_DDL, ENGINE_DDL, MERGE_DDL } from './schema.js';

// Bump when the seed schema changes. openDb() also compares the saved schema with the seed's, so a stale save is never loaded.
export const STORE = 'pathshala.db.v6';
const OLD_STORES = ['pathshala.db.v5', 'pathshala.db.v2'];
export let SQL, db;
export const q = (sql, p = []) => { const st = db.prepare(sql); st.bind(p); const out = []; while (st.step()) out.push(st.getAsObject()); st.free(); return out; };
export const q1 = (sql, p = []) => q(sql, p)[0];
export const run = (sql, p = []) => db.run(sql, p);
export function b64(u8) { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); }
export function unb64(s) { const bin = atob(s), u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i); return u8; }
export let persisted = false;
export function save() { try { localStorage.setItem(STORE, b64(db.export())); persisted = true; } catch (e) { persisted = false; } }
export function freshDb() { const d = new SQL.Database(); d.exec(seedSql); d.exec(ENGINE_DDL + MERGE_DDL + CASE_DDL); return d; }
const columns = d => { const out = {}; d.exec("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")[0]?.values.forEach(([t]) => { out[t] = d.exec(`PRAGMA table_info("${t}")`)[0].values.map(c => c[1]).join(','); }); return out; };
/* A saved database is usable only if every table of the seed exists with the same columns. */
function sameSchema(saved, fresh) {
  const a = columns(saved), b = columns(fresh);
  return Object.keys(b).every(t => a[t] === b[t]);
}
export function openDb() {
  let saved = null;
  try { OLD_STORES.forEach(k => localStorage.removeItem(k)); saved = localStorage.getItem(STORE); } catch (e) {}
  const fresh = freshDb();
  if (saved) {
    try {
      const d = new SQL.Database(unb64(saved));
      d.exec(ENGINE_DDL + MERGE_DDL + CASE_DDL); d.exec('SELECT count(*) FROM merge_groups');
      if (sameSchema(d, fresh)) { fresh.close(); persisted = true; return d; }
      d.close();
    } catch (e) { /* unreadable save: start again from the seed */ }
    try { localStorage.removeItem(STORE); } catch (e) {}
  }
  return fresh;
}
export async function bootSql() {
  let engine = 'WebAssembly';
  try {
    if (typeof WebAssembly !== 'object') throw new Error('no WebAssembly');
    SQL = await initSqlJs({ locateFile: () => wasmUrl });
  } catch (e) {
    engine = 'asm.js';
    const asm = await import('sql.js/dist/sql-asm.js');
    SQL = await (asm.default || asm)();
  }
  return engine;
}

export function setDb(d) { db = d; }
