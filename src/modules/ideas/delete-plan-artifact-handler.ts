import fs from "node:fs";

import type { ModuleCommandResult, ModuleLifecycleContext } from "../../contracts/module-contract.js";
import { getPlanArtifactStoragePaths, openPlanningStores, readLatestPlanArtifact } from "../../core/planning/index.js";
import { UnifiedStateDb } from "../../core/state/unified-state-db.js";
import { planningSqliteDatabaseRelativePath } from "../task-engine/planning-config.js";
import { attachPolicyMeta } from "../task-engine/attach-planning-response-meta.js";
import { planningGenPolicyGate } from "../task-engine/planning-generation-gate.js";
import { TaskEngineError } from "../task-engine/transitions.js";
import { parsePlanIdFromPlanArtifactRef } from "../task-engine/plan-artifact-execute-policy.js";
import { readIdeaPlanArtifact } from "./idea-plan-artifact-storage.js";
import { clearActiveDraftPlanArtifact } from "./idea-planning-metadata.js";
import { deleteIdea, getIdea, isIdeaId } from "./idea-store.js";

export type DeletePlanArtifactResultV1 = {
  responseSchemaVersion: 1;
  planRef: string;
  planId: string;
  ideaId?: string;
  deletedPlanFiles: boolean;
  deletedIndex: boolean;
  deletedIdea: boolean;
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

export async function runDeletePlanArtifact(
  args: Record<string, unknown>,
  ctx: ModuleLifecycleContext,
  instructionPath: string
): Promise<ModuleCommandResult> {
  const planRef = resolvePlanRef(args);
  if (!planRef) {
    return {
      ok: false,
      code: "invalid-args",
      message: "delete-plan-artifact requires planRef (plan-artifact:<planId>) or planId",
      data: { responseSchemaVersion: 1, instructionPath }
    };
  }

  const confirmDelete = args.confirmDelete === true;
  if (!confirmDelete) {
    return {
      ok: false,
      code: "confirm-delete-required",
      message:
        "delete-plan-artifact requires confirmDelete: true (destructive: removes plan files and the linked idea row when present).",
      data: { responseSchemaVersion: 1, planRef }
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

  const existingIdeaPlan = readIdeaPlanArtifact(workspacePath, planRef);
  const planId = parsePlanIdFromPlanArtifactRef(planRef) ?? cleanString(args.planId);
  if (!planId) {
    return {
      ok: false,
      code: "invalid-args",
      message: "Could not resolve planId from planRef",
      data: { responseSchemaVersion: 1, planRef }
    };
  }

  const classic = existingIdeaPlan ? null : readLatestPlanArtifact(workspacePath, planId);
  if (!existingIdeaPlan && !classic) {
    // Still allow cleanup of orphan index/files if the directory exists.
    const pathsProbe = getPlanArtifactStoragePaths(workspacePath, planId);
    if (!fs.existsSync(pathsProbe.planDirAbsolute)) {
      return {
        ok: false,
        code: "plan-artifact-not-found",
        message: `No PlanArtifact found for ${planRef}.`,
        data: { responseSchemaVersion: 1, planRef, planId }
      };
    }
  }

  const ideaIdArg = cleanString(args.ideaId);
  const provenanceIdeaId =
    typeof classic?.provenance?.sourceIdeaId === "string"
      ? classic.provenance.sourceIdeaId.trim()
      : undefined;
  const ideaId = existingIdeaPlan?.ideaId ?? ideaIdArg ?? provenanceIdeaId;
  if (ideaIdArg && existingIdeaPlan && ideaIdArg !== existingIdeaPlan.ideaId) {
    return {
      ok: false,
      code: "idea-plan-mismatch",
      message: `ideaId '${ideaIdArg}' does not match IdeaPlan document ideaId '${existingIdeaPlan.ideaId}'.`,
      data: {
        responseSchemaVersion: 1,
        planRef,
        ideaId: ideaIdArg,
        documentIdeaId: existingIdeaPlan.ideaId
      }
    };
  }

  const paths = getPlanArtifactStoragePaths(workspacePath, planId);
  let deletedPlanFiles = false;
  if (fs.existsSync(paths.planDirAbsolute)) {
    fs.rmSync(paths.planDirAbsolute, { recursive: true, force: true });
    deletedPlanFiles = true;
  }

  const moduleId = paths.moduleId;
  const stateDb = new UnifiedStateDb(workspacePath, planningSqliteDatabaseRelativePath(ctx));
  const hadIndex = Boolean(stateDb.getModuleState(moduleId));
  stateDb.deleteModuleState(moduleId);

  let deletedIdea = false;
  if (ideaId && isIdeaId(ideaId)) {
    clearActiveDraftPlanArtifact(db, ideaId);
    if (getIdea(db, ideaId)) {
      deleteIdea(db, ideaId);
      deletedIdea = true;
    }
  }

  const result: DeletePlanArtifactResultV1 = {
    responseSchemaVersion: 1,
    planRef,
    planId,
    ...(ideaId && isIdeaId(ideaId) ? { ideaId } : {}),
    deletedPlanFiles,
    deletedIndex: hadIndex,
    deletedIdea
  };
  const data: Record<string, unknown> = { ...result };
  attachPolicyMeta(data, ctx, planningGeneration, pg.warnings);

  const message =
    deletedIdea && ideaId
      ? `Deleted plan ${planRef} and idea ${ideaId}`
      : `Deleted plan ${planRef}`;

  return {
    ok: true,
    code: "plan-artifact-deleted",
    message,
    data
  };
}
