export const ENGINE_DDL = `
CREATE TABLE IF NOT EXISTS checks (group_id TEXT, seq INTEGER, rule_id TEXT, name TEXT, status TEXT, value TEXT, detail TEXT);
CREATE TABLE IF NOT EXISTS plan_items (group_id TEXT, seq INTEGER, kind TEXT, code TEXT, title TEXT, detail TEXT, cost_inr INTEGER, cost_type TEXT, funding TEXT, evidence TEXT);
CREATE TABLE IF NOT EXISTS questions (group_id TEXT, kind TEXT, role TEXT, text_en TEXT, text_hi TEXT, why TEXT, options TEXT, critical INTEGER, PRIMARY KEY (group_id, kind));
CREATE TABLE IF NOT EXISTS analysis (group_id TEXT PRIMARY KEY, verdict TEXT, health TEXT, reason TEXT, one_time_inr INTEGER, yearly_inr INTEGER, conditions INTEGER, open_questions INTEGER, run_at TEXT, moving INTEGER, after_total INTEGER, walk_km REAL, stay_local INTEGER);`;
export const MERGE_DDL = `
CREATE TABLE IF NOT EXISTS surveys (survey_id INTEGER PRIMARY KEY, merge_id TEXT, group_id TEXT, field TEXT, value TEXT, agent TEXT, done_on TEXT);
CREATE TABLE IF NOT EXISTS implementation (group_id TEXT, code TEXT, status TEXT, note TEXT, updated_on TEXT, source TEXT, PRIMARY KEY (group_id, code));
CREATE TABLE IF NOT EXISTS merge_summary (merge_id TEXT PRIMARY KEY, receiving_id TEXT, status TEXT, senders INTEGER, verdict TEXT, health TEXT, reason TEXT,
  moving INTEGER, after_total INTEGER, one_time_inr INTEGER, yearly_inr INTEGER, conditions INTEGER, open_questions INTEGER,
  success INTEGER, success_label TEXT, success_parts TEXT, problems INTEGER, unknowns INTEGER, run_at TEXT);
CREATE TABLE IF NOT EXISTS problems (merge_id TEXT, group_id TEXT, seq INTEGER, severity TEXT, title TEXT, detail TEXT, kind TEXT, link TEXT);
CREATE TABLE IF NOT EXISTS unknowns (merge_id TEXT, group_id TEXT, field TEXT, label TEXT, unit TEXT, current TEXT, target TEXT);`;
export const CASE_DDL = `
CREATE TABLE IF NOT EXISTS cases (case_id TEXT PRIMARY KEY, from_id TEXT, to_id TEXT, status TEXT, created_on TEXT, submitted_on TEXT, officer TEXT);
CREATE TABLE IF NOT EXISTS case_log (case_id TEXT, ts TEXT, actor TEXT, action TEXT, detail TEXT);
CREATE TABLE IF NOT EXISTS agent_steps (case_id TEXT, seq INTEGER, label TEXT, tool TEXT, input TEXT, output TEXT, summary TEXT);
CREATE TABLE IF NOT EXISTS findings (case_id TEXT, fid TEXT, title TEXT, kind TEXT, severity TEXT, summary TEXT, status TEXT, removed INTEGER DEFAULT 0, PRIMARY KEY (case_id, fid));
CREATE TABLE IF NOT EXISTS evidence (case_id TEXT, eid TEXT, fid TEXT, kind TEXT, status TEXT, label TEXT, detail TEXT, ref TEXT, officer_verified INTEGER DEFAULT 0, PRIMARY KEY (case_id, eid));
CREATE TABLE IF NOT EXISTS field_questions (case_id TEXT, qid TEXT, seq INTEGER, text TEXT, type TEXT, options TEXT, gap TEXT, answer TEXT, note TEXT, answered_on TEXT, PRIMARY KEY (case_id, qid));
CREATE TABLE IF NOT EXISTS interventions (case_id TEXT, code TEXT, title TEXT, chunk_ids TEXT, why TEXT, inputs TEXT, formula TEXT, cost_inr INTEGER, cost_type TEXT, selected INTEGER DEFAULT 0, PRIMARY KEY (case_id, code));
CREATE TABLE IF NOT EXISTS reports (case_id TEXT PRIMARY KEY, draft TEXT, edited INTEGER DEFAULT 0, comments TEXT, approved INTEGER DEFAULT 0, updated_on TEXT);`;
