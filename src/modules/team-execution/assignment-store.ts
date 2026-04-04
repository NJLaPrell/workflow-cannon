import type Sqlite from "better-sqlite3";
import { readKitSqliteUserVersion } from "../../core/state/workspace-kit-sqlite.js";

export const TEAM_EXECUTION_KIT_MIN_USER_VERSION = 7;

const ASSIGNMENT_STATUSES = new Set(["assigned", "submitted", "blocked", "reconciled", "cancelled"]);

export type TeamAssignmentStatus = "assigned" | "submitted" | "blocked" | "reconciled" | "cancelled";

export type TeamAssignmentRow = {
  id: string;
  executionTaskId: string;
  supervisorId: string;
  workerId: string;
  status: TeamAssignmentStatus;
  handoff: Record<string, unknown> | null;
  reconcileCheckpoint: Record<string, unknown> | null;
  blockReason: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
};

export function assertTeamExecutionKitSchema(
  dbPathAbs: string
): { ok: true } | { ok: false; message: string } {
  const uv = readKitSqliteUserVersion(dbPathAbs);
  if (uv < TEAM_EXECUTION_KIT_MIN_USER_VERSION) {
    return {
      ok: false,
      message: `team-execution commands require kit SQLite user_version >= ${TEAM_EXECUTION_KIT_MIN_USER_VERSION} (current ${uv}); open the workspace DB once with a current workspace-kit to migrate`
    };
  }
  return { ok: true };
}

export function validateHandoffContractV1(
  raw: unknown
): { ok: true; json: string } | { ok: false; message: string } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, message: "handoff must be a JSON object" };
  }
  const o = raw as Record<string, unknown>;
  if (o.schemaVersion !== 1) {
    return { ok: false, message: "handoff.schemaVersion must be 1" };
  }
  if (typeof o.summary !== "string" || !o.summary.trim()) {
    return { ok: false, message: "handoff.summary must be a non-empty string" };
  }
  if (o.evidenceRefs !== undefined) {
    if (!Array.isArray(o.evidenceRefs) || !o.evidenceRefs.every((x) => typeof x === "string")) {
      return { ok: false, message: "handoff.evidenceRefs must be an array of strings when present" };
    }
  }
  return { ok: true, json: JSON.stringify(o) };
}

export function validateReconcileCheckpointV1(
  raw: unknown
): { ok: true; json: string } | { ok: false; message: string } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, message: "checkpoint must be a JSON object" };
  }
  const o = raw as Record<string, unknown>;
  if (o.schemaVersion !== 1) {
    return { ok: false, message: "checkpoint.schemaVersion must be 1" };
  }
  if (typeof o.mergedSummary !== "string" || !o.mergedSummary.trim()) {
    return { ok: false, message: "checkpoint.mergedSummary must be a non-empty string" };
  }
  return { ok: true, json: JSON.stringify(o) };
}

export function parseMetadata(raw: unknown): Record<string, unknown> | null {
  if (raw === undefined || raw === null) {
    return null;
  }
  if (typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }
  return raw as Record<string, unknown>;
}

export function taskExistsInRelationalStore(db: Sqlite.Database, taskId: string): boolean {
  const row = db
    .prepare("SELECT 1 AS ok FROM task_engine_tasks WHERE id = ? LIMIT 1")
    .get(taskId) as { ok: number } | undefined;
  return Boolean(row);
}

function mapRow(
  r: Record<string, unknown>
): TeamAssignmentRow {
  let handoff: Record<string, unknown> | null = null;
  if (typeof r.handoff_json === "string" && r.handoff_json.trim()) {
    try {
      const p = JSON.parse(r.handoff_json) as unknown;
      if (p && typeof p === "object" && !Array.isArray(p)) {
        handoff = p as Record<string, unknown>;
      }
    } catch {
      handoff = null;
    }
  }
  let reconcileCheckpoint: Record<string, unknown> | null = null;
  if (typeof r.reconcile_checkpoint_json === "string" && r.reconcile_checkpoint_json.trim()) {
    try {
      const p = JSON.parse(r.reconcile_checkpoint_json) as unknown;
      if (p && typeof p === "object" && !Array.isArray(p)) {
        reconcileCheckpoint = p as Record<string, unknown>;
      }
    } catch {
      reconcileCheckpoint = null;
    }
  }
  let metadata: Record<string, unknown> | null = null;
  if (typeof r.metadata_json === "string" && r.metadata_json.trim()) {
    try {
      const p = JSON.parse(r.metadata_json) as unknown;
      if (p && typeof p === "object" && !Array.isArray(p)) {
        metadata = p as Record<string, unknown>;
      }
    } catch {
      metadata = null;
    }
  }
  const st = String(r.status);
  const status = ASSIGNMENT_STATUSES.has(st) ? (st as TeamAssignmentStatus) : "assigned";
  return {
    id: String(r.id),
    executionTaskId: String(r.execution_task_id),
    supervisorId: String(r.supervisor_id),
    workerId: String(r.worker_id),
    status,
    handoff,
    reconcileCheckpoint,
    blockReason: typeof r.block_reason === "string" ? r.block_reason : null,
    metadata,
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at)
  };
}

export function insertAssignment(
  db: Sqlite.Database,
  input: {
    id: string;
    executionTaskId: string;
    supervisorId: string;
    workerId: string;
    metadata: Record<string, unknown> | null;
    now: string;
  }
): void {
  const metaStr = input.metadata ? JSON.stringify(input.metadata) : null;
  db.prepare(
    `INSERT INTO kit_team_assignments (
      id, execution_task_id, supervisor_id, worker_id, status,
      handoff_json, reconcile_checkpoint_json, block_reason, metadata_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, 'assigned', NULL, NULL, NULL, ?, ?, ?)`
  ).run(
    input.id,
    input.executionTaskId,
    input.supervisorId,
    input.workerId,
    metaStr,
    input.now,
    input.now
  );
}

export function getAssignment(db: Sqlite.Database, id: string): TeamAssignmentRow | null {
  const r = db.prepare("SELECT * FROM kit_team_assignments WHERE id = ?").get(id) as Record<
    string,
    unknown
  > | undefined;
  return r ? mapRow(r) : null;
}

export type ListAssignmentsFilter = {
  executionTaskId?: string;
  status?: TeamAssignmentStatus;
  supervisorId?: string;
  workerId?: string;
};

export function listAssignments(db: Sqlite.Database, filter: ListAssignmentsFilter): TeamAssignmentRow[] {
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (filter.executionTaskId) {
    clauses.push("execution_task_id = ?");
    params.push(filter.executionTaskId);
  }
  if (filter.status) {
    clauses.push("status = ?");
    params.push(filter.status);
  }
  if (filter.supervisorId) {
    clauses.push("supervisor_id = ?");
    params.push(filter.supervisorId);
  }
  if (filter.workerId) {
    clauses.push("worker_id = ?");
    params.push(filter.workerId);
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const rows = db.prepare(`SELECT * FROM kit_team_assignments ${where} ORDER BY created_at ASC`).all(
    ...params
  ) as Record<string, unknown>[];
  return rows.map(mapRow);
}

export function submitHandoff(
  db: Sqlite.Database,
  input: { assignmentId: string; workerId: string; handoffJson: string; now: string }
): boolean {
  const r = db
    .prepare(
      `UPDATE kit_team_assignments SET status = 'submitted', handoff_json = ?, block_reason = NULL, updated_at = ?
       WHERE id = ? AND worker_id = ? AND status = 'assigned'`
    )
    .run(input.handoffJson, input.now, input.assignmentId, input.workerId);
  return r.changes > 0;
}

export function blockAssignment(
  db: Sqlite.Database,
  input: { assignmentId: string; supervisorId: string; reason: string; now: string }
): boolean {
  const r = db
    .prepare(
      `UPDATE kit_team_assignments SET status = 'blocked', block_reason = ?, updated_at = ?
       WHERE id = ? AND supervisor_id = ? AND status IN ('assigned','submitted')`
    )
    .run(input.reason, input.now, input.assignmentId, input.supervisorId);
  return r.changes > 0;
}

export function reconcileAssignment(
  db: Sqlite.Database,
  input: { assignmentId: string; supervisorId: string; checkpointJson: string; now: string }
): boolean {
  const r = db
    .prepare(
      `UPDATE kit_team_assignments SET status = 'reconciled', reconcile_checkpoint_json = ?, updated_at = ?
       WHERE id = ? AND supervisor_id = ? AND status = 'submitted'`
    )
    .run(input.checkpointJson, input.now, input.assignmentId, input.supervisorId);
  return r.changes > 0;
}

export function cancelAssignment(
  db: Sqlite.Database,
  input: { assignmentId: string; supervisorId: string; now: string }
): boolean {
  const r = db
    .prepare(
      `UPDATE kit_team_assignments SET status = 'cancelled', updated_at = ?
       WHERE id = ? AND supervisor_id = ? AND status IN ('assigned','submitted','blocked')`
    )
    .run(input.now, input.assignmentId, input.supervisorId);
  return r.changes > 0;
}
