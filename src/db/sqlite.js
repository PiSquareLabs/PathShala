import seedSql from './seed.sql?raw';
import initSqlJs from 'sql.js';
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url';
import { CASE_DDL, ENGINE_DDL, MERGE_DDL } from './schema.js';

export const STORE = 'pathshala.db.v5';
export let SQL, db;
export const q = (sql, p = []) => { const st = db.prepare(sql); st.bind(p); const out = []; while (st.step()) out.push(st.getAsObject()); st.free(); return out; };
export const q1 = (sql, p = []) => q(sql, p)[0];
export const run = (sql, p = []) => db.run(sql, p);
export function b64(u8) { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); }
export function unb64(s) { const bin = atob(s), u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i); return u8; }
export let persisted = false;
export function save() { try { localStorage.setItem(STORE, b64(db.export())); persisted = true; } catch (e) { persisted = false; } }
export function freshDb() { const d = new SQL.Database(); d.exec(seedSql); d.exec(ENGINE_DDL + MERGE_DDL + CASE_DDL); return d; }
export function openDb() {
  let saved = null;
  try { saved = localStorage.getItem(STORE); } catch (e) {}
  if (saved) { try { const d = new SQL.Database(unb64(saved)); d.exec(ENGINE_DDL + MERGE_DDL + CASE_DDL); d.exec('SELECT count(*) FROM merge_groups'); persisted = true; return d; } catch (e) {} }
  return freshDb();
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
