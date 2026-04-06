import type SqliteDatabase from "better-sqlite3";
import fs from "node:fs";
import { readKitSqliteUserVersion } from "../../core/state/workspace-kit-sqlite.js";

export const CHECKPOINT_KIT_MIN_USER_VERSION = 9;

export type CheckpointRefKind = "head" | "stash";

export type CheckpointRow = {
  id: string;
  createdAt: string;
  taskId: string | null;
  actor: string | null;
  label: string | null;
  actionType: string;
  refKind: CheckpointRefKind;
  gitHeadSha: string;
  secondaryRef: string | null;
  manifest: string[];
  metadata: Record<string, unknown> | null;
};

export function assertCheckpointKitSchema(dbAbsPath: string): { ok: true } | { ok: false; message: string } {
  if (!fs.existsSync(dbAbsPath)) {
    return { ok: false, message: `SQLite database not found at ${dbAbsPath}` };
  }
  const uv = readKitSqliteUserVersion(dbAbsPath);
  if (uv < CHECKPOINT_KIT_MIN_USER_VERSION) {
    return {
      ok: false,
      message: `checkpoints require kit SQLite user_version >= ${CHECKPOINT_KIT_MIN_USER_VERSION} (current ${uv}); open the workspace DB with a current workspace-kit to migrate`
    };
  }
  return { ok: true };
}

function parseRow(r: Record<string, unknown>): CheckpointRow {
  let manifest: string[] = [];
  try {
    const p = JSON.parse(String(r.manifest_json ?? "[]")) as unknown;
    if (Array.isArray(p)) {
      manifest = p.filter((x): x is string => typeof x === "string");
    }
  } catch {
    manifest = [];
  }
  let metadata: Record<string, unknown> | null = null;
  if (typeof r.metadata_json === "string" && r.metadata_json.trim()) {
    try {
      const o = JSON.parse(r.metadata_json) as unknown;
      metadata = o && typeof o === "object" && !Array.isArray(o) ? (o as Record<string, unknown>) : null;
    } catch {
      metadata = null;
    }
  }
  const refKind = r.ref_kind === "stash" ? "stash" : "head";
  return {
    id: String(r.id),
    createdAt: String(r.created_at),
    taskId: r.task_id != null && String(r.task_id).trim() ? String(r.task_id) : null,
    actor: r.actor != null && String(r.actor).trim() ? String(r.actor) : null,
    label: r.label != null && String(r.label).trim() ? String(r.label) : null,
    actionType: String(r.action_type ?? "manual"),
    refKind,
    gitHeadSha: String(r.git_head_sha),
    secondaryRef:
      r.secondary_ref != null && String(r.secondary_ref).trim() ? String(r.secondary_ref) : null,
    manifest,
    metadata
  };
}

export function insertCheckpoint(
  db: SqliteDatabase.Database,
  row: {
    id: string;
    createdAt: string;
    taskId?: string | null;
    actor?: string | null;
    label?: string | null;
    actionType: string;
    refKind: CheckpointRefKind;
    gitHeadSha: string;
    secondaryRef?: string | null;
    manifest: string[];
    metadata?: Record<string, unknown> | null;
  }
): void {
  db.prepare(
    `INSERT INTO kit_task_checkpoints (
      id, created_at, task_id, actor, label, action_type, ref_kind, git_head_sha, secondary_ref, manifest_json, metadata_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    row.id,
    row.createdAt,
    row.taskId ?? null,
    row.actor ?? null,
    row.label ?? null,
    row.actionType,
    row.refKind,
    row.gitHeadSha,
    row.secondaryRef ?? null,
    JSON.stringify(row.manifest),
    row.metadata && Object.keys(row.metadata).length ? JSON.stringify(row.metadata) : null
  );
}

export function getCheckpointById(db: SqliteDatabase.Database, id: string): CheckpointRow | undefined {
  const r = db.prepare("SELECT * FROM kit_task_checkpoints WHERE id = ?").get(id) as
    | Record<string, unknown>
    | undefined;
  return r ? parseRow(r) : undefined;
}

export function listCheckpoints(
  db: SqliteDatabase.Database,
  opts: { taskId?: string; limit?: number } = {}
): CheckpointRow[] {
  const limit = Math.min(Math.max(opts.limit ?? 100, 1), 500);
  if (opts.taskId && opts.taskId.trim()) {
    const rows = db
      .prepare(
        "SELECT * FROM kit_task_checkpoints WHERE task_id = ? ORDER BY created_at DESC LIMIT ?"
      )
      .all(opts.taskId.trim(), limit) as Record<string, unknown>[];
    return rows.map(parseRow);
  }
  const rows = db
    .prepare("SELECT * FROM kit_task_checkpoints ORDER BY created_at DESC LIMIT ?")
    .all(limit) as Record<string, unknown>[];
  return rows.map(parseRow);
}
