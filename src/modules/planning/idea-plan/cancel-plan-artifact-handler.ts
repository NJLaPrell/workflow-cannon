import type { ModuleCommandResult, ModuleLifecycleContext } from "../../../contracts/module-contract.js";
import {
  openPlanningStores,
  readLatestPlanArtifact,
  writeNextPlanArtifactVersion
} from "../../../core/planning/index.js";
import type { PlanArtifactStatus, PlanArtifactV1 } from "../../../core/planning/plan-artifact-v1.js";
import { attachPolicyMeta } from "../../task-engine/attach-planning-response-meta.js";
import { planningGenPolicyGate } from "../../task-engine/planning-generation-gate.js";
import { parsePlanIdFromPlanArtifactRef } from "../../task-engine/plan-artifact-execute-policy.js";
import { TaskEngineError } from "../../task-engine/transitions.js";
import {
  readIdeaPlanArtifact,
  writeNextIdeaPlanArtifactVersion
} from "./idea-plan-artifact-storage.js";
import { writeActiveDraftPlanArtifact } from "./idea-planning-metadata.js";
import { enforceIdeaPlanStatusTransition, IdeaPlanStatusTransitionError } from "./idea-plan-status-machine.js";
import { loadIdeaPlanStateSchema } from "./idea-plan-state-schema-loader.js";
import { guardIdeaPlanStateSchemaLoad } from "./idea-plan-state-schema-guard.js";
import type { IdeaPlanDocument } from "./idea-plan-types.js";

export type CancelPlanArtifactResultV1 = {
  responseSchemaVersion: 1;
  planRef: string;
  planId: string;
  version: number;
  status: "cancelled";
  ideaId?: string;
  previousStatus: string;
  transitioned: boolean;
  documentKind: "idea-plan" | "plan-artifact";
};

function cleanString(raw: unknown): string | undefined {
  return typeof raw === "string" && raw.trim() ? raw.trim() : undefined;
}

function resolvePlanRef(args: Record<string, unknown>): string | undefined {
  const planRef = cleanString(args.planRef);
  if (planRef?.startsWith("plan-artifact:")) {
    return planRef;
  }
  const planId = cleanString(args.planId);
  if (planId) {
    return `plan-artifact:${planId}`;
  }
  return undefined;
}

function successResult(
  code: "plan-artifact-cancelled" | "plan-artifact-already-cancelled",
  message: string,
  result: CancelPlanArtifactResultV1,
  ctx: ModuleLifecycleContext,
  planningGeneration: number,
  warnings?: string[]
): ModuleCommandResult {
  const data: Record<string, unknown> = { ...result };
  attachPolicyMeta(data, ctx, planningGeneration, warnings);
  return { ok: true, code, message, data };
}

function cancelClassicPlanArtifact(args: {
  workspacePath: string;
  planRef: string;
  planId: string;
  existing: PlanArtifactV1;
  db: import("better-sqlite3").Database;
  rationale?: string;
  cancelledBy: string;
  ctx: ModuleLifecycleContext;
  planningGeneration: number;
  warnings?: string[];
}): ModuleCommandResult {
  const { existing } = args;
  if (existing.status === "cancelled") {
    const result: CancelPlanArtifactResultV1 = {
      responseSchemaVersion: 1,
      planRef: existing.planRef,
      planId: existing.planId,
      version: existing.version,
      status: "cancelled",
      previousStatus: "cancelled",
      transitioned: false,
      documentKind: "plan-artifact"
    };
    return successResult(
      "plan-artifact-already-cancelled",
      `PlanArtifact ${args.planRef} is already cancelled`,
      result,
      args.ctx,
      args.planningGeneration,
      args.warnings
    );
  }

  const previousStatus = existing.status as PlanArtifactStatus;
  const nowIso = new Date().toISOString();
  const cancelledBody: PlanArtifactV1 = {
    ...existing,
    status: "cancelled",
    provenance: {
      ...existing.provenance,
      updatedAt: nowIso
    }
  };
  // Keep optional operator notes out of the typed envelope; rationale is CLI/response only.
  void args.rationale;
  void args.cancelledBy;

  const written = writeNextPlanArtifactVersion(args.workspacePath, cancelledBody, {
    sqliteDb: args.db
  });

  const result: CancelPlanArtifactResultV1 = {
    responseSchemaVersion: 1,
    planRef: written.artifact.planRef,
    planId: written.artifact.planId,
    version: written.artifact.version,
    status: "cancelled",
    previousStatus,
    transitioned: true,
    documentKind: "plan-artifact"
  };

  return successResult(
    "plan-artifact-cancelled",
    `PlanArtifact ${args.planRef} cancelled (was ${previousStatus})`,
    result,
    args.ctx,
    args.planningGeneration,
    args.warnings
  );
}

export async function runCancelPlanArtifact(
  args: Record<string, unknown>,
  ctx: ModuleLifecycleContext,
  instructionPath: string
): Promise<ModuleCommandResult> {
  const planRef = resolvePlanRef(args);
  if (!planRef) {
    return {
      ok: false,
      code: "invalid-args",
      message: "cancel-plan-artifact requires planRef (plan-artifact:<planId>) or planId",
      data: { responseSchemaVersion: 1, instructionPath }
    };
  }

  let planning;
  try {
    planning = await openPlanningStores(ctx);
  } catch (err) {
    if (err instanceof TaskEngineError) {
      return { ok: false, code: err.code, message: err.message, data: err.details };
    }
    return {
      ok: false,
      code: "storage-read-error",
      message: `Failed to open planning stores: ${(err as Error).message}`
    };
  }

  const workspacePath = ctx.workspacePath ?? process.cwd();
  const planningGeneration = planning.sqliteDual.getPlanningGeneration();
  const pg = planningGenPolicyGate(ctx, args, instructionPath, planningGeneration);
  if (pg.block) {
    return pg.block;
  }
  const db = planning.sqliteDual.getDatabase();
  const rationale = cleanString(args.rationale);
  const cancelledBy = cleanString(args.cancelledBy) ?? "dashboard-operator";

  const existingIdeaPlan = readIdeaPlanArtifact(workspacePath, planRef);
  if (existingIdeaPlan) {
    const ideaId = cleanString(args.ideaId);
    if (ideaId && ideaId !== existingIdeaPlan.ideaId) {
      return {
        ok: false,
        code: "idea-plan-mismatch",
        message: `ideaId '${ideaId}' does not match IdeaPlan document ideaId '${existingIdeaPlan.ideaId}'.`,
        data: {
          responseSchemaVersion: 1,
          planRef,
          ideaId,
          documentIdeaId: existingIdeaPlan.ideaId
        }
      };
    }

    if (existingIdeaPlan.status === "cancelled") {
      const result: CancelPlanArtifactResultV1 = {
        responseSchemaVersion: 1,
        planRef: existingIdeaPlan.planRef,
        planId: existingIdeaPlan.planId,
        version: existingIdeaPlan.version,
        status: "cancelled",
        ideaId: existingIdeaPlan.ideaId,
        previousStatus: existingIdeaPlan.cancellation?.previousStatus ?? "cancelled",
        transitioned: false,
        documentKind: "idea-plan"
      };
      return successResult(
        "plan-artifact-already-cancelled",
        `IdeaPlan ${planRef} is already cancelled`,
        result,
        ctx,
        planningGeneration,
        pg.warnings
      );
    }

    const previousStatus = existingIdeaPlan.status;
    try {
      enforceIdeaPlanStatusTransition(existingIdeaPlan.status, "cancelled");
    } catch (err) {
      if (err instanceof IdeaPlanStatusTransitionError) {
        return {
          ok: false,
          code: err.code,
          message: err.message,
          data: {
            responseSchemaVersion: 1,
            planRef,
            fromStatus: existingIdeaPlan.status,
            toStatus: "cancelled"
          }
        };
      }
      throw err;
    }

    const schemaLoad = loadIdeaPlanStateSchema("cancelled", workspacePath);
    const schemaGuard = guardIdeaPlanStateSchemaLoad(schemaLoad);
    if (!schemaGuard.ok) {
      return {
        ok: false,
        code: schemaGuard.code,
        message: schemaGuard.message,
        data: { responseSchemaVersion: 1, planRef, ...schemaGuard.data }
      };
    }

    const nowIso = new Date().toISOString();
    const updated: IdeaPlanDocument = {
      ...existingIdeaPlan,
      status: "cancelled",
      updatedAt: nowIso,
      agentDirective: schemaGuard.agentDirective,
      cancellation: {
        cancelledAt: nowIso,
        previousStatus,
        cancelledBy,
        ...(rationale ? { rationale } : {})
      }
    };

    const persisted = writeNextIdeaPlanArtifactVersion(workspacePath, updated, { sqliteDb: db });
    writeActiveDraftPlanArtifact(db, persisted.ideaId, persisted.planRef, nowIso);

    const result: CancelPlanArtifactResultV1 = {
      responseSchemaVersion: 1,
      planRef: persisted.planRef,
      planId: persisted.planId,
      version: persisted.version,
      status: "cancelled",
      ideaId: persisted.ideaId,
      previousStatus,
      transitioned: true,
      documentKind: "idea-plan"
    };

    return successResult(
      "plan-artifact-cancelled",
      `IdeaPlan ${planRef} cancelled (was ${previousStatus})`,
      result,
      ctx,
      planningGeneration,
      pg.warnings
    );
  }

  const planId = parsePlanIdFromPlanArtifactRef(planRef) ?? cleanString(args.planId);
  if (!planId) {
    return {
      ok: false,
      code: "invalid-args",
      message: "Could not resolve planId from planRef",
      data: { responseSchemaVersion: 1, planRef }
    };
  }

  const classic = readLatestPlanArtifact(workspacePath, planId);
  if (!classic) {
    return {
      ok: false,
      code: "plan-artifact-not-found",
      message: `No PlanArtifact found for ${planRef}.`,
      data: { responseSchemaVersion: 1, planRef, planId }
    };
  }

  return cancelClassicPlanArtifact({
    workspacePath,
    planRef,
    planId,
    existing: classic,
    db,
    rationale,
    cancelledBy,
    ctx,
    planningGeneration,
    warnings: pg.warnings
  });
}
