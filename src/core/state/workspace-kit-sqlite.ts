import Database from "better-sqlite3";

type SqliteDatabase = InstanceType<typeof Database>;

/** Bump and add a migration step in `migrateKitSqliteSchema` when DDL changes. Exposed for doctor / list-module-states. */
export const KIT_SQLITE_USER_VERSION = 1;

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
  const current = typeof raw === "number" ? raw : Number(raw);
  if (current < 1) {
    db.exec(BASELINE_DDL);
    db.pragma(`user_version = ${KIT_SQLITE_USER_VERSION}`);
  }
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
