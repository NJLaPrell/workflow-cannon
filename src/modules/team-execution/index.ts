import { randomUUID } from "node:crypto";
import type Sqlite from "better-sqlite3";
import type { WorkflowModule } from "../../contracts/module-contract.js";
import { builtinInstructionEntriesForModule } from "../../contracts/builtin-run-command-manifest.js";
import { openPlanningStores } from "../task-engine/persistence/planning-open.js";
import { TaskStore } from "../task-engine/persistence/store.js";
import { runReportDefectCommand } from "../task-engine/commands/report-defect-on-command.js";
import { TaskEngineError } from "../task-engine/transitions.js";
import { readOptionalExpectedPlanningGeneration } from "../task-engine/mutation-utils.js";
import { getPlanningGenerationPolicy, mergePlanningGenerationPolicyWarnings } from "../task-engine/planning-config.js";
import {
  assertTeamExecutionKitSchema,
  type TeamAssignmentRow,
  blockAssignment,
  blockAssignmentByAdmin,
  blockAssignmentFromWorker,
  cancelAssignment,
  cancelAssignmentByAdmin,
  getAssignment,
  insertAssignment,
  listAssignments,
  parseMetadata,
  reconcileAssignment,
  reconcileAssignmentByAdmin,
  resolveAssignmentMetadataValidationOptions,
  submitHandoff,
  taskExistsInRelationalStore,
  validateAssignmentMetadataWhenPresent,
  validateHandoffContract,
  validateReconcileCheckpointV1
} from "./assignment-store.js";

type AssignmentLifecycleAction =
  | "submit-assignment-handoff"
  | "report-assignment-blocker"
  | "block-assignment"
  | "reconcile-assignment"
  | "cancel-assignment";

type AssignmentAuthorityRole = "worker" | "supervisor";

type AssignmentValidationInput = {
  action: AssignmentLifecycleAction;
  assignmentId: string;
  assignment: TeamAssignmentRow | null;
  callerId: string | undefined;
  expectedRole: AssignmentAuthorityRole;
  claimedRoleId: string;
  allowedStatuses: TeamAssignmentRow["status"][];
  adminIds: Set<string>;
};

function readResolvedActorId(ctx: { resolvedActor?: string }): string | undefined {
  if (typeof ctx.resolvedActor !== "string") {
    return undefined;
  }
  const v = ctx.resolvedActor.trim();
  return v.length > 0 ? v : undefined;
}

function readAdminIds(ctx: { effectiveConfig?: Record<string, unknown> }): Set<string> {
  const out = new Set<string>();

  const pushIds = (raw: unknown): void => {
    if (!Array.isArray(raw)) {
      return;
    }
    for (const item of raw) {
      if (typeof item !== "string") {
        continue;
      }
      const id = item.trim();
      if (id.length > 0) {
        out.add(id);
      }
    }
  };

  const orchestration =
    ctx.effectiveConfig?.orchestration &&
    typeof ctx.effectiveConfig.orchestration === "object" &&
    !Array.isArray(ctx.effectiveConfig.orchestration)
      ? (ctx.effectiveConfig.orchestration as Record<string, unknown>)
      : undefined;
  const teamExecution =
    ctx.effectiveConfig?.teamExecution &&
    typeof ctx.effectiveConfig.teamExecution === "object" &&
    !Array.isArray(ctx.effectiveConfig.teamExecution)
      ? (ctx.effectiveConfig.teamExecution as Record<string, unknown>)
      : undefined;

  pushIds(orchestration?.adminIds);
  pushIds(teamExecution?.adminIds);
  return out;
}

function lifecycleValidationError(input: {
  code: "assignment-not-found" | "assignment-authority-denied" | "assignment-status-invalid";
  action: AssignmentLifecycleAction;
  assignmentId: string;
  message: string;
  expectedRole?: AssignmentAuthorityRole;
  callerId?: string;
  claimedRoleId?: string;
  assignment?: TeamAssignmentRow | null;
  allowedStatuses?: TeamAssignmentRow["status"][];
  reason: string;
}) {
  return {
    ok: false,
    code: input.code,
    message: input.message,
    data: {
      lifecycleError: {
        code: input.code,
        reason: input.reason,
        action: input.action,
        assignmentId: input.assignmentId,
        expectedRole: input.expectedRole,
        callerId: input.callerId,
        claimedRoleId: input.claimedRoleId,
        assignment: input.assignment
          ? {
              id: input.assignment.id,
              status: input.assignment.status,
              workerId: input.assignment.workerId,
              supervisorId: input.assignment.supervisorId
            }
          : undefined,
        allowedStatuses: input.allowedStatuses
      }
    }
  };
}

function validateAssignmentLifecycleAuthority(input: AssignmentValidationInput): {
  ok: true;
  allowSupervisorAdminOverride: boolean;
} | {
  ok: false;
  error: ReturnType<typeof lifecycleValidationError>;
} {
  const assignment = input.assignment;
  if (!assignment) {
    return {
      ok: false,
      error: lifecycleValidationError({
        code: "assignment-not-found",
        action: input.action,
        assignmentId: input.assignmentId,
        message: `${input.action} rejected: assignment '${input.assignmentId}' not found`,
        expectedRole: input.expectedRole,
        callerId: input.callerId,
        claimedRoleId: input.claimedRoleId,
        reason: "assignment-missing"
      })
    };
  }

  const callerIsAdmin = Boolean(input.callerId && input.adminIds.has(input.callerId));
  const callerMatchesClaimedRoleId = !input.callerId || input.callerId === input.claimedRoleId;
  if (!callerMatchesClaimedRoleId) {
    return {
      ok: false,
      error: lifecycleValidationError({
        code: "assignment-authority-denied",
        action: input.action,
        assignmentId: input.assignmentId,
        message: `${input.action} rejected: caller does not match claimed ${input.expectedRole} id`,
        expectedRole: input.expectedRole,
        callerId: input.callerId,
        claimedRoleId: input.claimedRoleId,
        assignment,
        reason: "caller-claimed-role-mismatch"
      })
    };
  }

  const roleMatch =
    input.expectedRole === "worker"
      ? assignment.workerId === input.claimedRoleId
      : assignment.supervisorId === input.claimedRoleId;

  if (!roleMatch) {
    const allowSupervisorAdminOverride =
      input.expectedRole === "supervisor" && callerIsAdmin && callerMatchesClaimedRoleId;
    if (!allowSupervisorAdminOverride) {
      return {
        ok: false,
        error: lifecycleValidationError({
          code: "assignment-authority-denied",
          action: input.action,
          assignmentId: input.assignmentId,
          message: `${input.action} rejected: assignment ${input.expectedRole} mismatch`,
          expectedRole: input.expectedRole,
          callerId: input.callerId,
          claimedRoleId: input.claimedRoleId,
          assignment,
          reason: "assignment-role-mismatch"
        })
      };
    }
  }

  if (!input.allowedStatuses.includes(assignment.status)) {
    return {
      ok: false,
      error: lifecycleValidationError({
        code: "assignment-status-invalid",
        action: input.action,
        assignmentId: input.assignmentId,
        message: `${input.action} rejected: assignment status '${assignment.status}' is not allowed`,
        expectedRole: input.expectedRole,
        callerId: input.callerId,
        claimedRoleId: input.claimedRoleId,
        assignment,
        allowedStatuses: input.allowedStatuses,
        reason: "status-not-allowed"
      })
    };
  }

  return {
    ok: true,
    allowSupervisorAdminOverride:
      input.expectedRole === "supervisor" && assignment.supervisorId !== input.claimedRoleId
  };
}

function attachPlanningMeta(
  data: Record<string, unknown>,
  ctx: { effectiveConfig?: Record<string, unknown> },
  gen: number,
  warnings?: string[]
): void {
  data.planningGeneration = gen;
  data.planningGenerationPolicy = getPlanningGenerationPolicy({
    effectiveConfig: ctx.effectiveConfig as Record<string, unknown> | undefined
  });
  mergePlanningGenerationPolicyWarnings(data, warnings);
}

function nowIso(): string {
  return new Date().toISOString();
}

function readOptionalStringArg(args: Record<string, unknown>, key: string): string | undefined {
  const value = args[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function readStringArrayArg(args: Record<string, unknown>, key: string): string[] {
  const value = args[key];
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function listHandoffEvidenceRefs(assignment: ReturnType<typeof getAssignment>): string[] {
  if (!assignment?.handoff) {
    return [];
  }
  const refs = assignment.handoff.evidenceRefs;
  if (!Array.isArray(refs)) {
    return [];
  }
  return refs.filter((ref): ref is string => typeof ref === "string" && ref.trim().length > 0);
}

function readAnyTaskId(db: Sqlite.Database): string | undefined {
  const row = db.prepare("SELECT id FROM task_engine_tasks ORDER BY id LIMIT 1").get() as
    | { id: string }
    | undefined;
  return row?.id;
}

export const teamExecutionModule: WorkflowModule = {
  registration: {
    id: "team-execution",
    version: "0.1.0",
    contractVersion: "1",
    stateSchema: 1,
    capabilities: ["team-execution"],
    dependsOn: [],
    optionalPeers: [],
    enabledByDefault: true,
    config: {
      path: "src/modules/team-execution/config.md",
      format: "md",
      description: "Supervisor/worker assignment records and handoff persistence in kit SQLite."
    },
    instructions: {
      directory: "src/modules/team-execution/instructions",
      entries: builtinInstructionEntriesForModule("team-execution")
    }
  },

  async onCommand(command, ctx) {
    const args = command.args ?? {};
    const name = command.name;
    const callerId = readResolvedActorId(ctx);
    const adminIds = readAdminIds(ctx);

    let planning;
    try {
      planning = await openPlanningStores(ctx);
    } catch (err) {
      if (err instanceof TaskEngineError) {
        return { ok: false, code: err.code, message: err.message };
      }
      return {
        ok: false,
        code: "storage-read-error",
        message: `Failed to open planning stores: ${(err as Error).message}`
      };
    }

    const dbPathAbs = planning.sqliteDual.dbPath;
    const schemaOk = assertTeamExecutionKitSchema(dbPathAbs);
    if (!schemaOk.ok) {
      return { ok: false, code: "invalid-task-schema", message: schemaOk.message };
    }

    const db = planning.sqliteDual.getDatabase();
    const gen = planning.sqliteDual.getPlanningGeneration();

    if (name === "list-assignments") {
      const executionTaskId =
        typeof args.executionTaskId === "string" && args.executionTaskId.trim()
          ? args.executionTaskId.trim()
          : undefined;
      const supervisorId =
        typeof args.supervisorId === "string" && args.supervisorId.trim()
          ? args.supervisorId.trim()
          : undefined;
      const workerId =
        typeof args.workerId === "string" && args.workerId.trim() ? args.workerId.trim() : undefined;
      const statusRaw = typeof args.status === "string" && args.status.trim() ? args.status.trim() : undefined;
      const status =
        statusRaw === "assigned" ||
        statusRaw === "submitted" ||
        statusRaw === "blocked" ||
        statusRaw === "reconciled" ||
        statusRaw === "cancelled"
          ? statusRaw
          : undefined;
      if (statusRaw && !status) {
        return {
          ok: false,
          code: "invalid-args",
          message:
            "list-assignments: status must be one of assigned | submitted | blocked | reconciled | cancelled"
        };
      }
      const assignments = listAssignments(db, {
        executionTaskId,
        status,
        supervisorId,
        workerId
      });
      const data: Record<string, unknown> = { assignments, count: assignments.length };
      attachPlanningMeta(data, ctx, gen);
      return {
        ok: true,
        code: "assignments-listed",
        message: `${assignments.length} assignment(s)`,
        data
      };
    }

    const exp = readOptionalExpectedPlanningGeneration(args);

    if (name === "register-assignment") {
      const executionTaskId =
        typeof args.executionTaskId === "string" && args.executionTaskId.trim()
          ? args.executionTaskId.trim()
          : "";
      if (!executionTaskId) {
        return { ok: false, code: "invalid-args", message: "register-assignment requires executionTaskId" };
      }
      const supervisorId =
        typeof args.supervisorId === "string" && args.supervisorId.trim() ? args.supervisorId.trim() : "";
      const workerId =
        typeof args.workerId === "string" && args.workerId.trim() ? args.workerId.trim() : "";
      if (!supervisorId || !workerId) {
        return {
          ok: false,
          code: "invalid-args",
          message: "register-assignment requires supervisorId and workerId"
        };
      }
      const assignmentId =
        typeof args.assignmentId === "string" && args.assignmentId.trim()
          ? args.assignmentId.trim()
          : randomUUID();
      const metadata = parseMetadata(args.metadata);
      if (args.metadata !== undefined && args.metadata !== null && metadata === null) {
        return { ok: false, code: "invalid-args", message: "register-assignment metadata must be a JSON object" };
      }
      const metadataValidation = validateAssignmentMetadataWhenPresent(
        metadata,
        resolveAssignmentMetadataValidationOptions(ctx)
      );
      if (!metadataValidation.ok) {
        return {
          ok: false,
          code: metadataValidation.code,
          message: metadataValidation.message,
          data: { issues: metadataValidation.issues }
        };
      }
      const ts = nowIso();
      const persistTaskId = executionTaskId || readAnyTaskId(db);
      try {
        planning.sqliteDual.withTransaction(
          () => {
            if (getAssignment(db, assignmentId)) {
              throw new TaskEngineError("invalid-task-schema", `assignmentId '${assignmentId}' already exists`);
            }
            if (!taskExistsInRelationalStore(db, executionTaskId)) {
              throw new TaskEngineError(
                "task-not-found",
                `execution task '${executionTaskId}' not found in relational task store (task_engine_tasks)`
              );
            }
            insertAssignment(db, {
              id: assignmentId,
              executionTaskId,
              supervisorId,
              workerId,
              metadata,
              now: ts
            });
          },
          {
            expectedPlanningGeneration: exp,
            persistScope: "incremental",
            ...(persistTaskId ? { dirtyTaskIds: [persistTaskId] } : {})
          }
        );
      } catch (err) {
        if (err instanceof TaskEngineError) {
          return { ok: false, code: err.code, message: err.message };
        }
        throw err;
      }
      const row = getAssignment(db, assignmentId)!;
      const data: Record<string, unknown> = { assignment: row };
      attachPlanningMeta(data, ctx, planning.sqliteDual.getPlanningGeneration());
      return { ok: true, code: "assignment-registered", message: `Assignment '${assignmentId}'`, data };
    }

    if (name === "submit-assignment-handoff") {
      const assignmentId =
        typeof args.assignmentId === "string" && args.assignmentId.trim() ? args.assignmentId.trim() : "";
      const workerId =
        typeof args.workerId === "string" && args.workerId.trim() ? args.workerId.trim() : "";
      if (!assignmentId || !workerId) {
        return {
          ok: false,
          code: "invalid-args",
          message: "submit-assignment-handoff requires assignmentId and workerId"
        };
      }
      const hv = validateHandoffContract(args.handoff, { assignmentId, workerId });
      if (!hv.ok) {
        return { ok: false, code: "invalid-args", message: hv.message };
      }
      const ts = nowIso();
      const before = getAssignment(db, assignmentId);
      const validation = validateAssignmentLifecycleAuthority({
        action: "submit-assignment-handoff",
        assignmentId,
        assignment: before,
        callerId,
        expectedRole: "worker",
        claimedRoleId: workerId,
        allowedStatuses: ["assigned"],
        adminIds
      });
      if (!validation.ok) {
        return validation.error;
      }
      let ok = false;
      const persistTaskId = before?.executionTaskId ?? readAnyTaskId(db);
      try {
        planning.sqliteDual.withTransaction(
          () => {
            ok = submitHandoff(db, { assignmentId, workerId, handoffJson: hv.json, now: ts });
            if (!ok) {
              throw new TaskEngineError("invalid-transition", "submit rejected: assignment state changed");
            }
          },
          {
            expectedPlanningGeneration: exp,
            persistScope: "incremental",
            ...(persistTaskId ? { dirtyTaskIds: [persistTaskId] } : {})
          }
        );
      } catch (err) {
        if (err instanceof TaskEngineError) {
          if (err.code === "invalid-transition" && err.message.includes("state changed")) {
            return lifecycleValidationError({
              code: "assignment-status-invalid",
              action: "submit-assignment-handoff",
              assignmentId,
              message: "submit-assignment-handoff rejected: assignment state changed",
              expectedRole: "worker",
              callerId,
              claimedRoleId: workerId,
              assignment: getAssignment(db, assignmentId),
              allowedStatuses: ["assigned"],
              reason: "state-changed-during-mutation"
            });
          }
          return { ok: false, code: err.code, message: err.message };
        }
        throw err;
      }
      const data: Record<string, unknown> = { assignment: getAssignment(db, assignmentId) };
      attachPlanningMeta(data, ctx, planning.sqliteDual.getPlanningGeneration());
      return { ok: true, code: "assignment-handoff-submitted", message: `Handoff for '${assignmentId}'`, data };
    }

    if (name === "block-assignment") {
      const assignmentId =
        typeof args.assignmentId === "string" && args.assignmentId.trim() ? args.assignmentId.trim() : "";
      const supervisorId =
        typeof args.supervisorId === "string" && args.supervisorId.trim() ? args.supervisorId.trim() : "";
      const reason = typeof args.reason === "string" ? args.reason.trim() : "";
      if (!assignmentId || !supervisorId || !reason) {
        return {
          ok: false,
          code: "invalid-args",
          message: "block-assignment requires assignmentId, supervisorId, and non-empty reason"
        };
      }
      const ts = nowIso();
      const before = getAssignment(db, assignmentId);
      const validation = validateAssignmentLifecycleAuthority({
        action: "block-assignment",
        assignmentId,
        assignment: before,
        callerId,
        expectedRole: "supervisor",
        claimedRoleId: supervisorId,
        allowedStatuses: ["assigned", "submitted"],
        adminIds
      });
      if (!validation.ok) {
        return validation.error;
      }
      const persistTaskId = before?.executionTaskId ?? readAnyTaskId(db);
      try {
        planning.sqliteDual.withTransaction(
          () => {
            const b = validation.allowSupervisorAdminOverride
              ? blockAssignmentByAdmin(db, { assignmentId, reason, now: ts })
              : blockAssignment(db, { assignmentId, supervisorId, reason, now: ts });
            if (!b) {
              throw new TaskEngineError("invalid-transition", "block rejected: assignment state changed");
            }
          },
          {
            expectedPlanningGeneration: exp,
            persistScope: "incremental",
            ...(persistTaskId ? { dirtyTaskIds: [persistTaskId] } : {})
          }
        );
      } catch (err) {
        if (err instanceof TaskEngineError) {
          if (err.code === "invalid-transition" && err.message.includes("state changed")) {
            return lifecycleValidationError({
              code: "assignment-status-invalid",
              action: "block-assignment",
              assignmentId,
              message: "block-assignment rejected: assignment state changed",
              expectedRole: "supervisor",
              callerId,
              claimedRoleId: supervisorId,
              assignment: getAssignment(db, assignmentId),
              allowedStatuses: ["assigned", "submitted"],
              reason: "state-changed-during-mutation"
            });
          }
          return { ok: false, code: err.code, message: err.message };
        }
        throw err;
      }
      const data: Record<string, unknown> = { assignment: getAssignment(db, assignmentId) };
      attachPlanningMeta(data, ctx, planning.sqliteDual.getPlanningGeneration());
      return { ok: true, code: "assignment-blocked", message: `Blocked '${assignmentId}'`, data };
    }

    if (name === "report-assignment-blocker") {
      const assignmentId = readOptionalStringArg(args, "assignmentId") ?? "";
      const workerId = readOptionalStringArg(args, "workerId") ?? "";
      const reason = readOptionalStringArg(args, "reason") ?? "";
      if (!assignmentId || !workerId || !reason) {
        return {
          ok: false,
          code: "invalid-args",
          message: "report-assignment-blocker requires assignmentId, workerId, and non-empty reason"
        };
      }

      const before = getAssignment(db, assignmentId);
      const validation = validateAssignmentLifecycleAuthority({
        action: "report-assignment-blocker",
        assignmentId,
        assignment: before,
        callerId,
        expectedRole: "worker",
        claimedRoleId: workerId,
        allowedStatuses: ["assigned", "submitted"],
        adminIds
      });
      if (!validation.ok) {
        return validation.error;
      }

      const ts = nowIso();
      const persistTaskId = before?.executionTaskId || readAnyTaskId(db);
      try {
        planning.sqliteDual.withTransaction(
          () => {
            const blocked = blockAssignmentFromWorker(db, {
              assignmentId,
              workerId,
              reason,
              now: ts
            });
            if (!blocked) {
              throw new TaskEngineError(
                "invalid-transition",
                "report-assignment-blocker rejected: assignment state changed"
              );
            }
          },
          {
            expectedPlanningGeneration: exp,
            persistScope: "incremental",
            ...(persistTaskId ? { dirtyTaskIds: [persistTaskId] } : {})
          }
        );
      } catch (err) {
        if (err instanceof TaskEngineError) {
          if (err.code === "invalid-transition" && err.message.includes("state changed")) {
            return lifecycleValidationError({
              code: "assignment-status-invalid",
              action: "report-assignment-blocker",
              assignmentId,
              message: "report-assignment-blocker rejected: assignment state changed",
              expectedRole: "worker",
              callerId,
              claimedRoleId: workerId,
              assignment: getAssignment(db, assignmentId),
              allowedStatuses: ["assigned", "submitted"],
              reason: "state-changed-during-mutation"
            });
          }
          return { ok: false, code: err.code, message: err.message };
        }
        throw err;
      }

      const assignment = getAssignment(db, assignmentId);
      const createDefect = args.createDefect !== false;
      const outputRefs = Array.from(new Set([...readStringArrayArg(args, "outputRefs"), ...listHandoffEvidenceRefs(assignment)]));

      if (!createDefect) {
        const data: Record<string, unknown> = {
          assignment,
          blockerReport: {
            reason,
            outputRefs,
            defectCreated: false
          }
        };
        attachPlanningMeta(data, ctx, planning.sqliteDual.getPlanningGeneration());
        return {
          ok: true,
          code: "assignment-blocker-reported",
          message: `Blocked '${assignmentId}' without creating a defect task`,
          data
        };
      }

      const store = TaskStore.forSqliteDual(planning.sqliteDual);
      await store.load();
      const defectTitle = readOptionalStringArg(args, "defectTitle") ?? `Assignment blocker: ${assignmentId}`;
      const defectSummary =
        readOptionalStringArg(args, "defectSummary") ?? `Worker '${workerId}' blocked assignment '${assignmentId}': ${reason}`;
      const defectEvidence =
        readOptionalStringArg(args, "defectEvidence") ??
        (outputRefs.length > 0 ? `Assignment output refs: ${outputRefs.join(", ")}` : `Blocker reason: ${reason}`);

      const defectArgs: Record<string, unknown> = {
        title: defectTitle,
        summary: defectSummary,
        evidence: defectEvidence,
        relatedTaskId: assignment?.executionTaskId,
        expectedPlanningGeneration: planning.sqliteDual.getPlanningGeneration(),
        actor: readOptionalStringArg(args, "actor")
      };
      const severity = readOptionalStringArg(args, "severity");
      if (severity) {
        defectArgs.severity = severity;
      }
      const features = readStringArrayArg(args, "features");
      if (features.length > 0) {
        defectArgs.features = features;
      }
      const phaseKey = readOptionalStringArg(args, "phaseKey");
      if (phaseKey) {
        defectArgs.phaseKey = phaseKey;
      }
      const phase = readOptionalStringArg(args, "phase");
      if (phase) {
        defectArgs.phase = phase;
      }

      const defectResult = await runReportDefectCommand(ctx, planning, store, defectArgs);
      if (!defectResult.ok) {
        const data: Record<string, unknown> = {
          assignment,
          blockerReport: {
            reason,
            outputRefs,
            defectCreated: false,
            defectError: {
              code: defectResult.code,
              message: defectResult.message
            }
          }
        };
        attachPlanningMeta(data, ctx, planning.sqliteDual.getPlanningGeneration());
        return {
          ok: false,
          code: "assignment-blocked-defect-create-failed",
          message: `Blocked '${assignmentId}', but defect creation failed: ${defectResult.message}`,
          data
        };
      }

      const data: Record<string, unknown> = {
        assignment,
        blockerReport: {
          reason,
          outputRefs,
          defectCreated: true
        },
        defectTask: defectResult.data && typeof defectResult.data === "object" ? defectResult.data.task : undefined,
        defect: defectResult.data
      };
      attachPlanningMeta(data, ctx, planning.sqliteDual.getPlanningGeneration());
      return {
        ok: true,
        code: "assignment-blocker-reported",
        message: `Blocked '${assignmentId}' and created a defect task`,
        data
      };
    }

    if (name === "reconcile-assignment") {
      const assignmentId =
        typeof args.assignmentId === "string" && args.assignmentId.trim() ? args.assignmentId.trim() : "";
      const supervisorId =
        typeof args.supervisorId === "string" && args.supervisorId.trim() ? args.supervisorId.trim() : "";
      if (!assignmentId || !supervisorId) {
        return {
          ok: false,
          code: "invalid-args",
          message: "reconcile-assignment requires assignmentId and supervisorId"
        };
      }
      const cv = validateReconcileCheckpointV1(args.checkpoint);
      if (!cv.ok) {
        return { ok: false, code: "invalid-args", message: cv.message };
      }
      const ts = nowIso();
      const before = getAssignment(db, assignmentId);
      const validation = validateAssignmentLifecycleAuthority({
        action: "reconcile-assignment",
        assignmentId,
        assignment: before,
        callerId,
        expectedRole: "supervisor",
        claimedRoleId: supervisorId,
        allowedStatuses: ["submitted"],
        adminIds
      });
      if (!validation.ok) {
        return validation.error;
      }
      const persistTaskId = before?.executionTaskId ?? readAnyTaskId(db);
      try {
        planning.sqliteDual.withTransaction(
          () => {
            const b = validation.allowSupervisorAdminOverride
              ? reconcileAssignmentByAdmin(db, {
                  assignmentId,
                  checkpointJson: cv.json,
                  now: ts
                })
              : reconcileAssignment(db, {
                  assignmentId,
                  supervisorId,
                  checkpointJson: cv.json,
                  now: ts
                });
            if (!b) {
              throw new TaskEngineError("invalid-transition", "reconcile rejected: assignment state changed");
            }
          },
          {
            expectedPlanningGeneration: exp,
            persistScope: "incremental",
            ...(persistTaskId ? { dirtyTaskIds: [persistTaskId] } : {})
          }
        );
      } catch (err) {
        if (err instanceof TaskEngineError) {
          if (err.code === "invalid-transition" && err.message.includes("state changed")) {
            return lifecycleValidationError({
              code: "assignment-status-invalid",
              action: "reconcile-assignment",
              assignmentId,
              message: "reconcile-assignment rejected: assignment state changed",
              expectedRole: "supervisor",
              callerId,
              claimedRoleId: supervisorId,
              assignment: getAssignment(db, assignmentId),
              allowedStatuses: ["submitted"],
              reason: "state-changed-during-mutation"
            });
          }
          return { ok: false, code: err.code, message: err.message };
        }
        throw err;
      }
      const data: Record<string, unknown> = { assignment: getAssignment(db, assignmentId) };
      attachPlanningMeta(data, ctx, planning.sqliteDual.getPlanningGeneration());
      return { ok: true, code: "assignment-reconciled", message: `Reconciled '${assignmentId}'`, data };
    }

    if (name === "cancel-assignment") {
      const assignmentId =
        typeof args.assignmentId === "string" && args.assignmentId.trim() ? args.assignmentId.trim() : "";
      const supervisorId =
        typeof args.supervisorId === "string" && args.supervisorId.trim() ? args.supervisorId.trim() : "";
      if (!assignmentId || !supervisorId) {
        return {
          ok: false,
          code: "invalid-args",
          message: "cancel-assignment requires assignmentId and supervisorId"
        };
      }
      const ts = nowIso();
      const before = getAssignment(db, assignmentId);
      const validation = validateAssignmentLifecycleAuthority({
        action: "cancel-assignment",
        assignmentId,
        assignment: before,
        callerId,
        expectedRole: "supervisor",
        claimedRoleId: supervisorId,
        allowedStatuses: ["assigned", "submitted", "blocked"],
        adminIds
      });
      if (!validation.ok) {
        return validation.error;
      }
      const persistTaskId = before?.executionTaskId ?? readAnyTaskId(db);
      try {
        planning.sqliteDual.withTransaction(
          () => {
            const b = validation.allowSupervisorAdminOverride
              ? cancelAssignmentByAdmin(db, { assignmentId, now: ts })
              : cancelAssignment(db, { assignmentId, supervisorId, now: ts });
            if (!b) {
              throw new TaskEngineError("invalid-transition", "cancel rejected: assignment state changed");
            }
          },
          {
            expectedPlanningGeneration: exp,
            persistScope: "incremental",
            ...(persistTaskId ? { dirtyTaskIds: [persistTaskId] } : {})
          }
        );
      } catch (err) {
        if (err instanceof TaskEngineError) {
          if (err.code === "invalid-transition" && err.message.includes("state changed")) {
            return lifecycleValidationError({
              code: "assignment-status-invalid",
              action: "cancel-assignment",
              assignmentId,
              message: "cancel-assignment rejected: assignment state changed",
              expectedRole: "supervisor",
              callerId,
              claimedRoleId: supervisorId,
              assignment: getAssignment(db, assignmentId),
              allowedStatuses: ["assigned", "submitted", "blocked"],
              reason: "state-changed-during-mutation"
            });
          }
          return { ok: false, code: err.code, message: err.message };
        }
        throw err;
      }
      const data: Record<string, unknown> = { assignment: getAssignment(db, assignmentId) };
      attachPlanningMeta(data, ctx, planning.sqliteDual.getPlanningGeneration());
      return { ok: true, code: "assignment-cancelled", message: `Cancelled '${assignmentId}'`, data };
    }

    return {
      ok: false,
      code: "unknown-command",
      message: `team-execution module: unhandled command '${name}'`
    };
  }
};
