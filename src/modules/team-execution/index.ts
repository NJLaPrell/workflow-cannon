import { randomUUID } from "node:crypto";
import type { WorkflowModule } from "../../contracts/module-contract.js";
import { builtinInstructionEntriesForModule } from "../../contracts/builtin-run-command-manifest.js";
import { openPlanningStores } from "../task-engine/persistence/planning-open.js";
import { TaskEngineError } from "../task-engine/transitions.js";
import { readOptionalExpectedPlanningGeneration } from "../task-engine/mutation-utils.js";
import { getPlanningGenerationPolicy, mergePlanningGenerationPolicyWarnings } from "../task-engine/planning-config.js";
import {
  assertTeamExecutionKitSchema,
  blockAssignment,
  cancelAssignment,
  getAssignment,
  insertAssignment,
  listAssignments,
  parseMetadata,
  reconcileAssignment,
  submitHandoff,
  taskExistsInRelationalStore,
  validateHandoffContractV1,
  validateReconcileCheckpointV1
} from "./assignment-store.js";

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
      const ts = nowIso();
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
          { expectedPlanningGeneration: exp }
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
      const hv = validateHandoffContractV1(args.handoff);
      if (!hv.ok) {
        return { ok: false, code: "invalid-args", message: hv.message };
      }
      const ts = nowIso();
      let ok = false;
      try {
        planning.sqliteDual.withTransaction(
          () => {
            ok = submitHandoff(db, { assignmentId, workerId, handoffJson: hv.json, now: ts });
            if (!ok) {
              throw new TaskEngineError(
                "invalid-transition",
                "submit rejected: assignment missing, worker mismatch, or status is not assigned"
              );
            }
          },
          { expectedPlanningGeneration: exp }
        );
      } catch (err) {
        if (err instanceof TaskEngineError) {
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
      try {
        planning.sqliteDual.withTransaction(
          () => {
            const b = blockAssignment(db, { assignmentId, supervisorId, reason, now: ts });
            if (!b) {
              throw new TaskEngineError(
                "invalid-transition",
                "block rejected: assignment missing, supervisor mismatch, or status not assigned/submitted"
              );
            }
          },
          { expectedPlanningGeneration: exp }
        );
      } catch (err) {
        if (err instanceof TaskEngineError) {
          return { ok: false, code: err.code, message: err.message };
        }
        throw err;
      }
      const data: Record<string, unknown> = { assignment: getAssignment(db, assignmentId) };
      attachPlanningMeta(data, ctx, planning.sqliteDual.getPlanningGeneration());
      return { ok: true, code: "assignment-blocked", message: `Blocked '${assignmentId}'`, data };
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
      try {
        planning.sqliteDual.withTransaction(
          () => {
            const b = reconcileAssignment(db, {
              assignmentId,
              supervisorId,
              checkpointJson: cv.json,
              now: ts
            });
            if (!b) {
              throw new TaskEngineError(
                "invalid-transition",
                "reconcile rejected: assignment missing, supervisor mismatch, or status is not submitted"
              );
            }
          },
          { expectedPlanningGeneration: exp }
        );
      } catch (err) {
        if (err instanceof TaskEngineError) {
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
      try {
        planning.sqliteDual.withTransaction(
          () => {
            const b = cancelAssignment(db, { assignmentId, supervisorId, now: ts });
            if (!b) {
              throw new TaskEngineError(
                "invalid-transition",
                "cancel rejected: assignment missing, supervisor mismatch, or terminal status"
              );
            }
          },
          { expectedPlanningGeneration: exp }
        );
      } catch (err) {
        if (err instanceof TaskEngineError) {
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
