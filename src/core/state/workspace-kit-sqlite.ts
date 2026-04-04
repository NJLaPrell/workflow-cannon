import Database from "better-sqlite3";
import { seedFeatureRegistryIfEmpty } from "./feature-registry-migration.js";

type SqliteDatabase = InstanceType<typeof Database>;

/** Bump and add a migration step in `migrateKitSqliteSchema` when DDL changes. Exposed for doctor / list-module-states. */
export const KIT_SQLITE_USER_VERSION = 7;

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

function migrateV2ToV3(db: SqliteDatabase): void {
  const cols = columnNames(db, "workspace_planning_state");
  if (!cols.has("planning_generation")) {
    db.exec(
      "ALTER TABLE workspace_planning_state ADD COLUMN planning_generation INTEGER NOT NULL DEFAULT 0"
    );
  }
}

function migrateV3ToV4(db: SqliteDatabase): void {
  if (!tableExists(db, TASK_ENGINE_TASKS_TABLE)) {
    return;
  }
  const cols = columnNames(db, TASK_ENGINE_TASKS_TABLE);
  if (cols.has("features_json")) {
    return;
  }
  db.exec("ALTER TABLE task_engine_tasks ADD COLUMN features_json TEXT NOT NULL DEFAULT '[]'");
}

function migrateV4ToV5(db: SqliteDatabase): void {
  if (!tableExists(db, TASK_ENGINE_TASKS_TABLE)) {
    return;
  }
  seedFeatureRegistryIfEmpty(db, TASK_ENGINE_TASKS_TABLE);
}

/** Subagent registry v1: definitions, sessions, message log (Phase 57). */
const SUBAGENT_DDL = `
CREATE TABLE IF NOT EXISTS kit_subagent_definitions (
  id TEXT PRIMARY KEY NOT NULL,
  display_name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  allowed_commands_json TEXT NOT NULL DEFAULT '[]',
  retired INTEGER NOT NULL DEFAULT 0,
  metadata_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_kit_subagent_definitions_retired ON kit_subagent_definitions(retired);
CREATE TABLE IF NOT EXISTS kit_subagent_sessions (
  id TEXT PRIMARY KEY NOT NULL,
  definition_id TEXT NOT NULL,
  execution_task_id TEXT,
  status TEXT NOT NULL,
  host_hint TEXT,
  metadata_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (definition_id) REFERENCES kit_subagent_definitions(id)
);
CREATE INDEX IF NOT EXISTS idx_kit_subagent_sessions_def ON kit_subagent_sessions(definition_id);
CREATE INDEX IF NOT EXISTS idx_kit_subagent_sessions_task ON kit_subagent_sessions(execution_task_id);
CREATE TABLE IF NOT EXISTS kit_subagent_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  direction TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (session_id) REFERENCES kit_subagent_sessions(id)
);
CREATE INDEX IF NOT EXISTS idx_kit_subagent_messages_session ON kit_subagent_messages(session_id);
`;

function migrateV5ToV6(db: SqliteDatabase): void {
  db.exec(SUBAGENT_DDL);
}

/** Supervisor/worker assignment rows (Phase 58 team execution v1). */
const TEAM_ASSIGNMENT_DDL = `
CREATE TABLE IF NOT EXISTS kit_team_assignments (
  id TEXT PRIMARY KEY NOT NULL,
  execution_task_id TEXT NOT NULL,
  supervisor_id TEXT NOT NULL,
  worker_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('assigned','submitted','blocked','reconciled','cancelled')),
  handoff_json TEXT,
  reconcile_checkpoint_json TEXT,
  block_reason TEXT,
  metadata_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_kit_team_assignments_task ON kit_team_assignments(execution_task_id);
CREATE INDEX IF NOT EXISTS idx_kit_team_assignments_status ON kit_team_assignments(status);
CREATE INDEX IF NOT EXISTS idx_kit_team_assignments_supervisor ON kit_team_assignments(supervisor_id);
CREATE INDEX IF NOT EXISTS idx_kit_team_assignments_worker ON kit_team_assignments(worker_id);
`;

function migrateV6ToV7(db: SqliteDatabase): void {
  db.exec(TEAM_ASSIGNMENT_DDL);
}

/**
 * Shared SQLite setup for workspace-kit.db: pragmas, centralized user_version migrations.
 * Call after `new Database(path)` for every open (read/write).
 */
export function prepareKitSqliteDatabase(db: SqliteDatabase): void {
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 10000");
  db.pragma("journal_mode = WAL");
  migrateKitSqliteSchema(db);
}

function migrateKitSqliteSchema(db: SqliteDatabase): void {
  const readUv = (): number => {
    const raw = db.pragma("user_version", { simple: true });
    return typeof raw === "number" ? raw : Number(raw);
  };
  let current = readUv();
  if (current < 1) {
    db.exec(BASELINE_DDL);
    db.pragma("user_version = 1");
    current = 1;
  }
  if (current < 2) {
    migrateV1ToV2(db);
    db.pragma("user_version = 2");
    current = 2;
  }
  if (current < 3) {
    migrateV2ToV3(db);
    db.pragma("user_version = 3");
    current = 3;
  }
  if (current < 4) {
    migrateV3ToV4(db);
    db.pragma("user_version = 4");
    current = 4;
  }
  if (current < 5) {
    migrateV4ToV5(db);
    db.pragma("user_version = 5");
    current = 5;
  }
  if (current < 6) {
    migrateV5ToV6(db);
    db.pragma("user_version = 6");
    current = 6;
  }
  if (current < 7) {
    migrateV6ToV7(db);
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
