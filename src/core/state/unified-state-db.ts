import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const DDL = `
CREATE TABLE IF NOT EXISTS workspace_module_state (
  module_id TEXT PRIMARY KEY,
  state_schema_version INTEGER NOT NULL,
  state_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`;

export type ModuleStateRow = {
  moduleId: string;
  stateSchemaVersion: number;
  state: Record<string, unknown>;
  updatedAt: string;
};

type UnifiedStateDbOptions = {
  exportSnapshotRelativePath?: string;
};

export class UnifiedStateDb {
  private db: Database.Database | null = null;
  readonly dbPath: string;
  readonly exportSnapshotPath: string | null;

  constructor(workspacePath: string, databaseRelativePath: string, options?: UnifiedStateDbOptions) {
    this.dbPath = path.resolve(workspacePath, databaseRelativePath);
    this.exportSnapshotPath = options?.exportSnapshotRelativePath
      ? path.resolve(workspacePath, options.exportSnapshotRelativePath)
      : null;
  }

  private ensureDb(): Database.Database {
    if (this.db) return this.db;
    fs.mkdirSync(path.dirname(this.dbPath), { recursive: true });
    this.db = new Database(this.dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.exec(DDL);
    return this.db;
  }

  getModuleState(moduleId: string): ModuleStateRow | null {
    const db = this.ensureDb();
    const row = db
      .prepare(
        "SELECT module_id, state_schema_version, state_json, updated_at FROM workspace_module_state WHERE module_id = ?"
      )
      .get(moduleId) as
      | { module_id: string; state_schema_version: number; state_json: string; updated_at: string }
      | undefined;
    if (!row) return null;
    return {
      moduleId: row.module_id,
      stateSchemaVersion: row.state_schema_version,
      state: JSON.parse(row.state_json) as Record<string, unknown>,
      updatedAt: row.updated_at
    };
  }

  setModuleState(moduleId: string, stateSchemaVersion: number, state: Record<string, unknown>): void {
    const db = this.ensureDb();
    const updatedAt = new Date().toISOString();
    db.prepare(
      `INSERT INTO workspace_module_state (module_id, state_schema_version, state_json, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(module_id) DO UPDATE SET
         state_schema_version=excluded.state_schema_version,
         state_json=excluded.state_json,
         updated_at=excluded.updated_at`
    ).run(moduleId, stateSchemaVersion, JSON.stringify(state), updatedAt);
    this.maybeExportSnapshot();
  }

  listModuleStates(): ModuleStateRow[] {
    const db = this.ensureDb();
    const rows = db
      .prepare(
        "SELECT module_id, state_schema_version, state_json, updated_at FROM workspace_module_state ORDER BY module_id ASC"
      )
      .all() as Array<{
      module_id: string;
      state_schema_version: number;
      state_json: string;
      updated_at: string;
    }>;
    return rows.map((row) => ({
      moduleId: row.module_id,
      stateSchemaVersion: row.state_schema_version,
      state: JSON.parse(row.state_json) as Record<string, unknown>,
      updatedAt: row.updated_at
    }));
  }

  private maybeExportSnapshot(): void {
    if (!this.exportSnapshotPath) return;
    const snapshot = {
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      dbPath: this.dbPath,
      modules: this.listModuleStates()
    };
    fs.mkdirSync(path.dirname(this.exportSnapshotPath), { recursive: true });
    fs.writeFileSync(this.exportSnapshotPath, JSON.stringify(snapshot, null, 2) + "\n", "utf8");
  }
}
