import type Database from "better-sqlite3";

export const KIT_TASK_STATE_PROJECTION_META_TABLE = "kit_task_state_projection_meta";

/** Row schema version for JSON/API surfaces (distinct from kit SQLite user_version). */
export const TASK_STATE_PROJECTION_META_SCHEMA_VERSION = 1 as const;

export const TASK_STATE_PROJECTION_SYNC_STATUSES = [
  "empty",
  "fresh",
  "stale",
  "rebuilding",
  "corrupt"
] as const;

export type TaskStateProjectionSyncStatus = (typeof TASK_STATE_PROJECTION_SYNC_STATUSES)[number];

/** Canonical event-log backend the local SQLite cache is projecting from. */
export const TASK_STATE_PROJECTION_BACKENDS = ["git-event-log", "sqlite-relational"] as const;

export type TaskStateProjectionBackend = (typeof TASK_STATE_PROJECTION_BACKENDS)[number];

export type TaskStateProjectionMeta = {
  schemaVersion: typeof TASK_STATE_PROJECTION_META_SCHEMA_VERSION;
  backend: TaskStateProjectionBackend;
  appliedSequence: number;
  sourceCommit: string | null;
  projectionSchemaVersion: number;
  syncStatus: TaskStateProjectionSyncStatus;
  updatedAt: string;
};

const SYNC_STATUS_SET = new Set<string>(TASK_STATE_PROJECTION_SYNC_STATUSES);
const BACKEND_SET = new Set<string>(TASK_STATE_PROJECTION_BACKENDS);

function tableExists(db: Database.Database, name: string): boolean {
  const row = db
    .prepare("SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(name) as { ok: number } | undefined;
  return Boolean(row);
}

export function taskStateProjectionMetaTableAvailable(db: Database.Database): boolean {
  return tableExists(db, KIT_TASK_STATE_PROJECTION_META_TABLE);
}

function parseSyncStatus(raw: unknown): TaskStateProjectionSyncStatus {
  const value = typeof raw === "string" ? raw.trim() : "";
  return SYNC_STATUS_SET.has(value) ? (value as TaskStateProjectionSyncStatus) : "empty";
}

function parseBackend(raw: unknown): TaskStateProjectionBackend {
  const value = typeof raw === "string" ? raw.trim() : "";
  return BACKEND_SET.has(value) ? (value as TaskStateProjectionBackend) : "git-event-log";
}

export function readTaskStateProjectionMeta(db: Database.Database): TaskStateProjectionMeta | null {
  if (!taskStateProjectionMetaTableAvailable(db)) {
    return null;
  }
  const row = db
    .prepare(
      `SELECT backend, applied_sequence, source_commit, projection_schema_version, sync_status, updated_at
       FROM ${KIT_TASK_STATE_PROJECTION_META_TABLE} WHERE id = 1`
    )
    .get() as
    | {
        backend: string;
        applied_sequence: number;
        source_commit: string | null;
        projection_schema_version: number;
        sync_status: string;
        updated_at: string;
      }
    | undefined;
  if (!row) {
    return null;
  }
  return {
    schemaVersion: TASK_STATE_PROJECTION_META_SCHEMA_VERSION,
    backend: parseBackend(row.backend),
    appliedSequence: Number(row.applied_sequence) || 0,
    sourceCommit: typeof row.source_commit === "string" && row.source_commit.trim() ? row.source_commit.trim() : null,
    projectionSchemaVersion: Number(row.projection_schema_version) || 1,
    syncStatus: parseSyncStatus(row.sync_status),
    updatedAt: row.updated_at
  };
}

export type UpsertTaskStateProjectionMetaInput = {
  backend?: TaskStateProjectionBackend;
  appliedSequence?: number;
  sourceCommit?: string | null;
  projectionSchemaVersion?: number;
  syncStatus?: TaskStateProjectionSyncStatus;
  updatedAt: string;
};

export function upsertTaskStateProjectionMeta(
  db: Database.Database,
  input: UpsertTaskStateProjectionMetaInput
): TaskStateProjectionMeta {
  if (!taskStateProjectionMetaTableAvailable(db)) {
    throw new Error(`${KIT_TASK_STATE_PROJECTION_META_TABLE} is not available (kit SQLite user_version < 28)`);
  }
  const existing = readTaskStateProjectionMeta(db);
  const next: TaskStateProjectionMeta = {
    schemaVersion: TASK_STATE_PROJECTION_META_SCHEMA_VERSION,
    backend: input.backend ?? existing?.backend ?? "git-event-log",
    appliedSequence: input.appliedSequence ?? existing?.appliedSequence ?? 0,
    sourceCommit:
      input.sourceCommit !== undefined ? input.sourceCommit : (existing?.sourceCommit ?? null),
    projectionSchemaVersion:
      input.projectionSchemaVersion ?? existing?.projectionSchemaVersion ?? 1,
    syncStatus: input.syncStatus ?? existing?.syncStatus ?? "empty",
    updatedAt: input.updatedAt
  };
  db.prepare(
    `INSERT INTO ${KIT_TASK_STATE_PROJECTION_META_TABLE} (
       id, backend, applied_sequence, source_commit, projection_schema_version, sync_status, updated_at
     ) VALUES (1, @backend, @applied_sequence, @source_commit, @projection_schema_version, @sync_status, @updated_at)
     ON CONFLICT(id) DO UPDATE SET
       backend = excluded.backend,
       applied_sequence = excluded.applied_sequence,
       source_commit = excluded.source_commit,
       projection_schema_version = excluded.projection_schema_version,
       sync_status = excluded.sync_status,
       updated_at = excluded.updated_at`
  ).run({
    backend: next.backend,
    applied_sequence: next.appliedSequence,
    source_commit: next.sourceCommit,
    projection_schema_version: next.projectionSchemaVersion,
    sync_status: next.syncStatus,
    updated_at: next.updatedAt
  });
  return next;
}
