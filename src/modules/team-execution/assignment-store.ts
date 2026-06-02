import type Sqlite from "better-sqlite3";
import type { DashboardTeamExecutionSummary } from "../../contracts/dashboard-summary-run.js";
import {
  TEAM_ASSIGNMENT_METADATA_SCHEMA_VERSION,
  type TeamAssignmentOrchestrationMetadataSummary
} from "../../contracts/team-execution-assignment-metadata.v1.js";
import { readKitSqliteUserVersion } from "../../core/state/workspace-kit-sqlite.js";
import {
  validateAssignmentMetadataV1,
  validateHandoffV2
} from "../../core/validation/agent-orchestration/validate-orchestration-contract.js";
import type { OrchestrationValidationIssue } from "../../core/validation/agent-orchestration/types.js";

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
  orchestrationMetadataSummary: TeamAssignmentOrchestrationMetadataSummary | null;
  createdAt: string;
  updatedAt: string;
};

export type ReconcileDecisionHint =
  | "reconcile"
  | "request_rework"
  | "assign_blocker"
  | "assign_review"
  | "cancel_supersede";

export type ReconcileHandoffContext = {
  schemaVersion: 1;
  handoffSchemaVersion: 1 | 2;
  handoffSummary: string;
  evidenceRefs: string[];
  suggestedDecision: ReconcileDecisionHint;
  suggestedDecisions: ReconcileDecisionHint[];
  handoffStatus?: string;
  blockersCount?: number;
  risksCount?: number;
  commandsRunCount?: number;
  failedCommandCount?: number;
  nextRecommendedAction?: string;
};

function countStringArray(value: unknown): number {
  if (!Array.isArray(value)) {
    return 0;
  }
  return value.filter((entry) => typeof entry === "string").length;
}

function readOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

export function summarizeAssignmentOrchestrationMetadata(
  metadata: Record<string, unknown> | null
): TeamAssignmentOrchestrationMetadataSummary | null {
  if (!metadata) {
    return null;
  }

  const resources =
    metadata.resources && typeof metadata.resources === "object" && !Array.isArray(metadata.resources)
      ? (metadata.resources as Record<string, unknown>)
      : null;
  const lockScope =
    metadata.lockScope && typeof metadata.lockScope === "object" && !Array.isArray(metadata.lockScope)
      ? (metadata.lockScope as Record<string, unknown>)
      : null;
  const schemaVersion = Number(metadata.schemaVersion);

  return {
    schemaVersion: Number.isFinite(schemaVersion) ? schemaVersion : 0,
    agentDefinitionId: readOptionalString(metadata.agentDefinitionId),
    agentSessionId: readOptionalString(metadata.agentSessionId),
    modelTier: readOptionalString(metadata.modelTier) as TeamAssignmentOrchestrationMetadataSummary["modelTier"],
    contextProfileId: readOptionalString(metadata.contextProfileId),
    accessProfileId: readOptionalString(metadata.accessProfileId),
    handoffContractId: readOptionalString(metadata.handoffContractId),
    assignmentPromptSummary: readOptionalString(metadata.assignmentPromptSummary),
    blockingPolicy: readOptionalString(metadata.blockingPolicy),
    pathCounts: {
      ownedPaths: countStringArray(metadata.ownedPaths) + countStringArray(resources?.ownedPaths),
      readOnlyPaths: countStringArray(resources?.readOnlyPaths),
      sharedPaths: countStringArray(metadata.sharedPaths) + countStringArray(resources?.sharedPaths),
      forbiddenPaths: countStringArray(metadata.forbiddenPaths) + countStringArray(resources?.forbiddenPaths),
      requiresApprovalPaths:
        countStringArray(metadata.requiresApprovalPaths) + countStringArray(resources?.requiresApprovalPaths)
    },
    lockCounts: {
      tasks: countStringArray(lockScope?.tasks),
      modules: countStringArray(lockScope?.modules),
      commands: countStringArray(lockScope?.commands)
    }
  };
}

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

export function validateHandoffContract(
  raw: unknown,
  context?: { assignmentId?: string; workerId?: string }
): { ok: true; json: string } | { ok: false; message: string } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, message: "handoff must be a JSON object" };
  }

  const schemaVersion = (raw as Record<string, unknown>).schemaVersion;
  if (schemaVersion === 1) {
    return validateHandoffContractV1(raw);
  }

  if (schemaVersion !== 2) {
    return { ok: false, message: "handoff.schemaVersion must be 1 or 2" };
  }

  const v2 = validateHandoffV2(raw);
  if (!v2.ok) {
    return {
      ok: false,
      message: v2.issues[0]?.message ?? v2.message
    };
  }

  if (context?.assignmentId && v2.data.assignmentId !== context.assignmentId) {
    return { ok: false, message: "handoff.assignmentId must match assignmentId" };
  }

  if (context?.workerId && v2.data.agentId !== context.workerId) {
    return { ok: false, message: "handoff.agentId must match workerId" };
  }

  return { ok: true, json: JSON.stringify(v2.data) };
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

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0);
}

function decideFromHandoffStatus(status: string): ReconcileDecisionHint {
  if (status === "blocked") {
    return "assign_blocker";
  }
  if (status === "needs_review") {
    return "assign_review";
  }
  if (status === "partial" || status === "failed") {
    return "request_rework";
  }
  return "reconcile";
}

function collectSuggestedDecisions(
  base: ReconcileDecisionHint,
  nextRecommendedAction: string | undefined
): ReconcileDecisionHint[] {
  const out: ReconcileDecisionHint[] = [base];
  const note = typeof nextRecommendedAction === "string" ? nextRecommendedAction.toLowerCase() : "";
  if (note.includes("supersede") || note.includes("cancel")) {
    out.push("cancel_supersede");
  }
  return out;
}

export function summarizeHandoffForReconcile(
  handoff: Record<string, unknown> | null
): ReconcileHandoffContext | null {
  if (!handoff) {
    return null;
  }

  if (handoff.schemaVersion === 1) {
    const summary = typeof handoff.summary === "string" ? handoff.summary.trim() : "";
    if (!summary) {
      return null;
    }
    return {
      schemaVersion: 1,
      handoffSchemaVersion: 1,
      handoffSummary: summary,
      evidenceRefs: readStringArray(handoff.evidenceRefs),
      suggestedDecision: "reconcile",
      suggestedDecisions: ["reconcile"]
    };
  }

  if (handoff.schemaVersion !== 2) {
    return null;
  }

  const validated = validateHandoffV2(handoff);
  if (!validated.ok) {
    return null;
  }

  const data = validated.data;
  const suggestedDecision = decideFromHandoffStatus(data.status);
  const failedCommandCount = Array.isArray(data.commandsRun)
    ? data.commandsRun.filter((run) => run.status === "failed").length
    : 0;
  return {
    schemaVersion: 1,
    handoffSchemaVersion: 2,
    handoffStatus: data.status,
    handoffSummary: data.summary,
    evidenceRefs: data.evidenceRefs,
    blockersCount: Array.isArray(data.blockers) ? data.blockers.length : 0,
    risksCount: Array.isArray(data.risks) ? data.risks.length : 0,
    commandsRunCount: Array.isArray(data.commandsRun) ? data.commandsRun.length : 0,
    failedCommandCount,
    nextRecommendedAction: data.nextRecommendedAction,
    suggestedDecision,
    suggestedDecisions: collectSuggestedDecisions(suggestedDecision, data.nextRecommendedAction)
  };
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

export type AssignmentMetadataValidationOutcome =
  | { ok: true }
  | { ok: false; code: string; message: string; issues: OrchestrationValidationIssue[] };

/** Validate orchestration metadata when `schemaVersion === 1`; legacy rows pass through. */
export function validateAssignmentMetadataWhenPresent(
  metadata: Record<string, unknown> | null,
  options?: { strict?: boolean }
): AssignmentMetadataValidationOutcome {
  if (metadata === null) {
    return { ok: true };
  }
  if (metadata.schemaVersion !== TEAM_ASSIGNMENT_METADATA_SCHEMA_VERSION) {
    return { ok: true };
  }
  const result = validateAssignmentMetadataV1(metadata, options);
  if (result.ok) {
    return { ok: true };
  }
  const primary = result.issues[0];
  return {
    ok: false,
    code: result.code,
    message: primary?.message ?? result.message,
    issues: result.issues
  };
}

function readOrchestrationStrictMetadataValidation(
  effectiveConfig: Record<string, unknown> | undefined
): boolean {
  const orchestration = effectiveConfig?.orchestration;
  if (!orchestration || typeof orchestration !== "object" || Array.isArray(orchestration)) {
    return false;
  }
  return (orchestration as Record<string, unknown>).strictMetadataValidation === true;
}

export function resolveAssignmentMetadataValidationOptions(ctx: {
  effectiveConfig?: Record<string, unknown>;
}): { strict?: boolean } {
  return readOrchestrationStrictMetadataValidation(ctx.effectiveConfig)
    ? { strict: true }
    : {};
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
    orchestrationMetadataSummary: summarizeAssignmentOrchestrationMetadata(metadata),
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

function emptyTeamDashboardSummary(): DashboardTeamExecutionSummary {
  return {
    schemaVersion: 1,
    available: false,
    totalCount: 0,
    activeCount: 0,
    byStatus: { assigned: 0, submitted: 0, blocked: 0, reconciled: 0, cancelled: 0 },
    topActive: []
  };
}

/**
 * Compact rollup of `kit_team_assignments` for `dashboard-summary` (read-only; no policy surface).
 */
/** Read-only team assignment facet for `get-next-actions` (queue intelligence). */
export type NextActionsTeamExecutionContext = {
  schemaVersion: 1;
  available: boolean;
  openCount: number;
  /** Active assignments (assigned / submitted / blocked), newest first. */
  topOpen: Array<{
    assignmentId: string;
    executionTaskId: string;
    executionTaskTitle: string | null;
    supervisorId: string;
    workerId: string;
    status: string;
    updatedAt: string;
  }>;
};

export function summarizeTeamAssignmentsForNextActions(
  db: Sqlite.Database | undefined,
  resolveTaskTitle: (taskId: string) => string | null
): NextActionsTeamExecutionContext {
  const empty: NextActionsTeamExecutionContext = {
    schemaVersion: 1,
    available: false,
    openCount: 0,
    topOpen: []
  };
  if (!db) {
    return empty;
  }
  const uvRaw = db.pragma("user_version", { simple: true });
  const uv = typeof uvRaw === "number" ? uvRaw : Number(uvRaw);
  if (!Number.isFinite(uv) || uv < TEAM_EXECUTION_KIT_MIN_USER_VERSION) {
    return empty;
  }
  try {
    const rows = db
      .prepare(
        `SELECT * FROM kit_team_assignments
         WHERE status IN ('assigned','submitted','blocked')
         ORDER BY updated_at DESC
         LIMIT 25`
      )
      .all() as Record<string, unknown>[];
    const topOpen = rows.map((raw) => {
      const row = mapRow(raw);
      return {
        assignmentId: row.id,
        executionTaskId: row.executionTaskId,
        executionTaskTitle: resolveTaskTitle(row.executionTaskId),
        supervisorId: row.supervisorId,
        workerId: row.workerId,
        status: row.status,
        updatedAt: row.updatedAt
      };
    });
    const cntRow = db
      .prepare(
        `SELECT COUNT(*) AS c FROM kit_team_assignments WHERE status IN ('assigned','submitted','blocked')`
      )
      .get() as { c: number | bigint } | undefined;
    const openCount = cntRow !== undefined ? Number(cntRow.c) || 0 : topOpen.length;
    return {
      schemaVersion: 1,
      available: true,
      openCount,
      topOpen
    };
  } catch {
    return empty;
  }
}

export function summarizeTeamAssignmentsForDashboard(
  db: Sqlite.Database,
  resolveTaskTitle: (taskId: string) => string | null
): DashboardTeamExecutionSummary {
  const uvRaw = db.pragma("user_version", { simple: true });
  const uv = typeof uvRaw === "number" ? uvRaw : Number(uvRaw);
  if (!Number.isFinite(uv) || uv < TEAM_EXECUTION_KIT_MIN_USER_VERSION) {
    return emptyTeamDashboardSummary();
  }
  try {
    const byStatus: DashboardTeamExecutionSummary["byStatus"] = {
      assigned: 0,
      submitted: 0,
      blocked: 0,
      reconciled: 0,
      cancelled: 0
    };
    const countRows = db
      .prepare("SELECT status, COUNT(*) AS c FROM kit_team_assignments GROUP BY status")
      .all() as { status: string; c: number | bigint }[];
    let totalCount = 0;
    for (const r of countRows) {
      const c = Number(r.c);
      totalCount += c;
      const st = String(r.status);
      if (st === "assigned") {
        byStatus.assigned = c;
      } else if (st === "submitted") {
        byStatus.submitted = c;
      } else if (st === "blocked") {
        byStatus.blocked = c;
      } else if (st === "reconciled") {
        byStatus.reconciled = c;
      } else if (st === "cancelled") {
        byStatus.cancelled = c;
      }
    }
    const activeCount = byStatus.assigned + byStatus.submitted + byStatus.blocked;
    const topRows = db
      .prepare(
        `SELECT * FROM kit_team_assignments
         WHERE status IN ('assigned','submitted','blocked')
         ORDER BY updated_at DESC
         LIMIT 15`
      )
      .all() as Record<string, unknown>[];
    const topActive = topRows.map((raw) => {
      const row = mapRow(raw);
      return {
        id: row.id,
        executionTaskId: row.executionTaskId,
        executionTaskTitle: resolveTaskTitle(row.executionTaskId),
        supervisorId: row.supervisorId,
        workerId: row.workerId,
        status: row.status,
        updatedAt: row.updatedAt
      };
    });
    return {
      schemaVersion: 1,
      available: true,
      totalCount,
      activeCount,
      byStatus,
      topActive
    };
  } catch {
    return emptyTeamDashboardSummary();
  }
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

export function blockAssignmentByAdmin(
  db: Sqlite.Database,
  input: { assignmentId: string; reason: string; now: string }
): boolean {
  const r = db
    .prepare(
      `UPDATE kit_team_assignments SET status = 'blocked', block_reason = ?, updated_at = ?
       WHERE id = ? AND status IN ('assigned','submitted')`
    )
    .run(input.reason, input.now, input.assignmentId);
  return r.changes > 0;
}

export function blockAssignmentFromWorker(
  db: Sqlite.Database,
  input: { assignmentId: string; workerId: string; reason: string; now: string }
): boolean {
  const r = db
    .prepare(
      `UPDATE kit_team_assignments SET status = 'blocked', block_reason = ?, updated_at = ?
       WHERE id = ? AND worker_id = ? AND status IN ('assigned','submitted')`
    )
    .run(input.reason, input.now, input.assignmentId, input.workerId);
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

export function reconcileAssignmentByAdmin(
  db: Sqlite.Database,
  input: { assignmentId: string; checkpointJson: string; now: string }
): boolean {
  const r = db
    .prepare(
      `UPDATE kit_team_assignments SET status = 'reconciled', reconcile_checkpoint_json = ?, updated_at = ?
       WHERE id = ? AND status = 'submitted'`
    )
    .run(input.checkpointJson, input.now, input.assignmentId);
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

export function cancelAssignmentByAdmin(
  db: Sqlite.Database,
  input: { assignmentId: string; now: string }
): boolean {
  const r = db
    .prepare(
      `UPDATE kit_team_assignments SET status = 'cancelled', updated_at = ?
       WHERE id = ? AND status IN ('assigned','submitted','blocked')`
    )
    .run(input.now, input.assignmentId);
  return r.changes > 0;
}
