import Database from "better-sqlite3";

type SqliteDatabase = InstanceType<typeof Database>;

/** Bump and add a migration step in `migrateKitSqliteSchema` when DDL changes. Exposed for doctor / list-module-states. */
export const KIT_SQLITE_USER_VERSION = 2;

export const TASK_ENGINE_TASKS_TABLE = "task_engine_tasks";

/**
 * Baseline DDL for the unified planning DB (task document row + module state). Idempotent via IF NOT EXISTS.
 * Legacy rows may add columns to workspace_planning_state outside this baseline (detected at runtime).
 */
const BASELINE_DDL = `
CREATE TABLE IF NOT EXISTS workspace_planning_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  task_store_json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS workspace_module_state (
  module_id TEXT PRIMARY KEY,
  state_schema_version INTEGER NOT NULL,
  state_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`;

const TASK_ENGINE_TASKS_DDL = `
CREATE TABLE IF NOT EXISTS task_engine_tasks (
  id TEXT PRIMARY KEY NOT NULL,
  status TEXT NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived INTEGER NOT NULL DEFAULT 0,
  archived_at TEXT,
  priority TEXT,
  phase TEXT,
  phase_key TEXT,
  ownership TEXT,
  approach TEXT,
  depends_on_json TEXT NOT NULL DEFAULT '[]',
  unblocks_json TEXT NOT NULL DEFAULT '[]',
  technical_scope_json TEXT,
  acceptance_criteria_json TEXT,
  summary TEXT,
  description TEXT,
  risk TEXT,
  queue_namespace TEXT,
  evidence_key TEXT,
  evidence_kind TEXT,
  metadata_json TEXT
);
CREATE INDEX IF NOT EXISTS idx_task_engine_tasks_status ON task_engine_tasks(status);
CREATE INDEX IF NOT EXISTS idx_task_engine_tasks_type_status ON task_engine_tasks(type, status);
CREATE INDEX IF NOT EXISTS idx_task_engine_tasks_phase_key ON task_engine_tasks(phase_key);
CREATE INDEX IF NOT EXISTS idx_task_engine_tasks_queue_ns_status ON task_engine_tasks(queue_namespace, status);
`;

function tableExists(db: SqliteDatabase, name: string): boolean {
  const row = db
    .prepare("SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(name) as { ok: number } | undefined;
  return Boolean(row);
}

function columnNames(db: SqliteDatabase, table: string): Set<string> {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  return new Set(rows.map((r) => r.name));
}

function migrateV1ToV2(db: SqliteDatabase): void {
  db.exec(TASK_ENGINE_TASKS_DDL);
  const cols = columnNames(db, "workspace_planning_state");
  if (!cols.has("transition_log_json")) {
    db.exec(
      "ALTER TABLE workspace_planning_state ADD COLUMN transition_log_json TEXT NOT NULL DEFAULT '[]'"
    );
  }
  if (!cols.has("mutation_log_json")) {
    db.exec(
      "ALTER TABLE workspace_planning_state ADD COLUMN mutation_log_json TEXT NOT NULL DEFAULT '[]'"
    );
  }
  if (!cols.has("relational_tasks")) {
    db.exec("ALTER TABLE workspace_planning_state ADD COLUMN relational_tasks INTEGER NOT NULL DEFAULT 0");
  }
}

/**
 * Shared SQLite setup for workspace-kit.db: pragmas, centralized user_version migrations.
 * Call after `new Database(path)` for every open (read/write).
 */
export function prepareKitSqliteDatabase(db: SqliteDatabase): void {
  db.pragma("busy_timeout = 10000");
  db.pragma("journal_mode = WAL");
  migrateKitSqliteSchema(db);
}

function migrateKitSqliteSchema(db: SqliteDatabase): void {
  const raw = db.pragma("user_version", { simple: true });
  let current = typeof raw === "number" ? raw : Number(raw);
  if (current < 1) {
    db.exec(BASELINE_DDL);
    current = 1;
    db.pragma("user_version = 1");
  }
  if (current < 2) {
    migrateV1ToV2(db);
    db.pragma(`user_version = ${KIT_SQLITE_USER_VERSION}`);
  }
}

/** True when relational task rows + envelope columns are present (post v2 migration open). */
export function kitSqliteHasRelationalTaskDdl(db: SqliteDatabase): boolean {
  return tableExists(db, TASK_ENGINE_TASKS_TABLE) && columnNames(db, "workspace_planning_state").has("relational_tasks");
}

/** Read-only pragma user_version for diagnostics (doctor summary, list-module-states). */
export function readKitSqliteUserVersion(dbAbsPath: string): number {
  const db = new Database(dbAbsPath, { readonly: true });
  try {
    const raw = db.pragma("user_version", { simple: true });
    return typeof raw === "number" ? raw : Number(raw);
  } finally {
    db.close();
  }
}
