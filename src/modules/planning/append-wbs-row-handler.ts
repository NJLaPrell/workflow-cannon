import type { ModuleCommandResult, ModuleLifecycleContext } from "../../contracts/module-contract.js";
import type { PlanArtifactV1, PlanArtifactWbsItem } from "../../core/planning/plan-artifact-v1.js";
import { validatePlanArtifactWbsItemShape } from "../../core/planning/normalize-wbs-to-task-draft.js";
import { openPlanningStores } from "../../core/planning/index.js";
import { PlanArtifactVersionImmutableError } from "../../core/planning/plan-artifact-immutability.js";
import { validatePlanArtifactDraftInput } from "../../core/planning/validate-plan-artifact.js";
import { isIdeaPlanDocument, readIdeaPlanArtifact } from "../ideas/idea-plan-artifact-storage.js";
import type { IdeaPlanDocumentWithPlanningPayload } from "../ideas/idea-plan-planning-init.js";
import { attachPolicyMeta } from "../task-engine/attach-planning-response-meta.js";
import { planningGenPolicyGate } from "../task-engine/planning-generation-gate.js";
import { planningConcurrencySaveOpts, readIdempotencyValue } from "../task-engine/mutation-utils.js";
import { TaskEngineError } from "../task-engine/transitions.js";
import {
  attachGeneratedPlanDocPath,
  bestEffortGeneratePlanDocument
} from "./best-effort-generate-plan-document.js";
import {
  commitPlanArtifactDraftPersist,
  preludePlanArtifactDraftPersist
} from "./persist-plan-artifact-draft.js";

export const APPEND_WBS_ROW_INSTRUCTION = "src/modules/planning/instructions/append-wbs-row.md";

function cleanString(raw: unknown): string | undefined {
  return typeof raw === "string" && raw.trim() ? raw.trim() : undefined;
}

function resolvePlanRef(args: Record<string, unknown>): string | undefined {
  const planRef = cleanString(args.planRef);
  if (planRef) {
    return planRef;
  }
  const planId = cleanString(args.planId);
  return planId ? `plan-artifact:${planId}` : undefined;
}

function artifactHasPlanningPayload(artifact: PlanArtifactV1): boolean {
  return Boolean(artifact.identity?.title) && Array.isArray(artifact.goals) && artifact.goals.length > 0;
}

function planArtifactFromUnifiedDocument(document: IdeaPlanDocumentWithPlanningPayload): PlanArtifactV1 | null {
  if (!document.identity || !Array.isArray(document.goals) || !Array.isArray(document.wbs) || !document.provenance) {
    return null;
  }
  return {
    schemaVersion: 1,
    planId: document.planId,
    version: document.version,
    planRef: document.planRef,
    status: "draft",
    identity: document.identity,
    goals: document.goals,
    nonGoals: document.nonGoals ?? [],
    ...(document.userStories ? { userStories: document.userStories } : {}),
    valueAssessment: document.valueAssessment!,
    riskAssessment: document.riskAssessment ?? [],
    technicalImpact: document.technicalImpact!,
    ...(document.architecture ? { architecture: document.architecture } : {}),
    ...(document.uiUxDirection ? { uiUxDirection: document.uiUxDirection } : {}),
    testingStrategy: document.testingStrategy!,
    implementationGuidance: document.implementationGuidance ?? [],
    whatNotToDo: document.whatNotToDo ?? [],
    assumptions: document.assumptions ?? [],
    openQuestions: document.openQuestions ?? [],
    wbs: document.wbs,
    phaseRecommendations: document.phaseRecommendations ?? [],
    ...(document.taskGenerationPayloads ? { taskGenerationPayloads: document.taskGenerationPayloads } : {}),
    provenance: document.provenance
  };
}

function appendWbsRowSuccessResult(args: {
  code: "append-wbs-row-persisted" | "append-wbs-row-idempotent-replay";
  artifact: PlanArtifactV1;
  storagePath: string;
  appendedWbsId: string;
  replayed: boolean;
  planningChatSession?: ReturnType<typeof import("../ideas/planning-chat-session.js").toPlanningChatSessionResponse>;
}): ModuleCommandResult {
  return {
    ok: true,
    code: args.code,
    message: args.replayed ? "WBS row append idempotent replay" : "WBS row appended to unified IdeaPlan draft",
    data: {
      schemaVersion: 1,
      responseSchemaVersion: 1,
      planId: args.artifact.planId,
      version: args.artifact.version,
      planRef: args.artifact.planRef,
      status: args.artifact.status,
      storagePath: args.storagePath,
      appendedWbsId: args.appendedWbsId,
      wbsRowCount: args.artifact.wbs.length,
      replayed: args.replayed,
      ...(args.planningChatSession ? { planningChatSession: args.planningChatSession } : {})
    }
  };
}

export async function runAppendWbsRow(
  args: Record<string, unknown>,
  ctx: ModuleLifecycleContext,
  instructionPath: string = APPEND_WBS_ROW_INSTRUCTION
): Promise<ModuleCommandResult> {
  const planRef = resolvePlanRef(args);
  if (!planRef) {
    return { ok: false, code: "invalid-args", message: "append-wbs-row requires planRef or planId" };
  }

  const wbsShape = validatePlanArtifactWbsItemShape(args.wbsRow ?? args.row);
  if (!wbsShape.ok) {
    return {
      ok: false,
      code: "wbs-shape-invalid",
      message: "WBS row failed structural validation",
      data: {
        schemaVersion: 1,
        responseSchemaVersion: 1,
        findings: wbsShape.findings
      }
    };
  }
  const wbsRow: PlanArtifactWbsItem = wbsShape.item;

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

  const workspacePath = ctx.workspacePath ?? process.cwd();
  const planningGeneration = planning.sqliteDual.getPlanningGeneration();
  const pg = planningGenPolicyGate(ctx, args, instructionPath, planningGeneration);
  if (pg.block) {
    return pg.block;
  }

  const document = readIdeaPlanArtifact(workspacePath, planRef);
  if (!document || !isIdeaPlanDocument(document)) {
    return {
      ok: false,
      code: "idea-plan-not-found",
      message: `Unified IdeaPlan document not found for ${planRef}`,
      data: { schemaVersion: 1, responseSchemaVersion: 1, planRef }
    };
  }

  if (document.status !== "planning") {
    return {
      ok: false,
      code: "idea-plan-status-invalid",
      message: `append-wbs-row requires unified document status planning (current: ${document.status})`,
      data: {
        schemaVersion: 1,
        responseSchemaVersion: 1,
        planId: document.planId,
        status: document.status,
        expectedStatus: "planning"
      }
    };
  }

  const planId = document.planId;
  const baseArtifact = planArtifactFromUnifiedDocument(document as IdeaPlanDocumentWithPlanningPayload);
  if (!baseArtifact || !artifactHasPlanningPayload(baseArtifact)) {
    return {
      ok: false,
      code: "plan-artifact-draft-incomplete",
      message: "Unified IdeaPlan lacks planning payload; run draft-plan-artifact before append-wbs-row",
      data: { schemaVersion: 1, responseSchemaVersion: 1, planId, planRef }
    };
  }

  if (baseArtifact.wbs.some((row) => row.wbsId === wbsRow.wbsId)) {
    return {
      ok: false,
      code: "wbs-id-conflict",
      message: `WBS row '${wbsRow.wbsId}' already exists on plan ${planId}`,
      data: { schemaVersion: 1, responseSchemaVersion: 1, planId, wbsId: wbsRow.wbsId }
    };
  }

  const nowIso = new Date().toISOString();
  const nextArtifact: PlanArtifactV1 = {
    ...baseArtifact,
    status: "draft",
    wbs: [...baseArtifact.wbs, wbsRow],
    provenance: {
      ...baseArtifact.provenance,
      updatedAt: nowIso,
      ...(document.ideaId ? { sourceIdeaId: document.ideaId } : {})
    }
  };

  const validation = validatePlanArtifactDraftInput(nextArtifact, {
    workspaceRoot: workspacePath,
    planId,
    ideaId: document.ideaId
  });
  if (!validation.ok) {
    return {
      ok: false,
      code: "plan-artifact-schema-invalid",
      message: "PlanArtifact validation failed after WBS append",
      data: { schemaVersion: 1, responseSchemaVersion: 1, errors: validation.errors }
    };
  }

  const clientMutationId = readIdempotencyValue(args);
  const sqliteDb = planning.sqliteDual.getDatabase();
  const prelude = preludePlanArtifactDraftPersist({
    workspacePath,
    artifact: validation.artifact,
    artifactRaw: nextArtifact,
    clientMutationId,
    effectiveConfig: ctx.effectiveConfig as Record<string, unknown> | undefined,
    sqliteDb
  });

  if (prelude.kind === "conflict") {
    return { ok: false, code: prelude.code, message: prelude.message, ...(prelude.data ? { data: prelude.data } : {}) };
  }

  if (prelude.kind === "replay") {
    const replay = appendWbsRowSuccessResult({
      code: "append-wbs-row-idempotent-replay",
      artifact: prelude.artifact,
      storagePath: prelude.storagePath,
      appendedWbsId: wbsRow.wbsId,
      replayed: true
    });
    attachPolicyMeta(replay.data as Record<string, unknown>, ctx, planningGeneration, pg.warnings);
    attachGeneratedPlanDocPath(
      replay.data as Record<string, unknown>,
      await bestEffortGeneratePlanDocument(ctx, prelude.artifact.planId)
    );
    return replay;
  }

  let committed;
  try {
    planning.sqliteDual.withTransaction(() => {
      committed = commitPlanArtifactDraftPersist({
        workspacePath,
        artifact: prelude.artifact,
        clientMutationId,
        digest: prelude.digest,
        effectiveConfig: ctx.effectiveConfig as Record<string, unknown> | undefined,
        sqliteDb
      });
    }, planningConcurrencySaveOpts(args));
  } catch (err) {
    if (err instanceof TaskEngineError) {
      const data =
        err.code === "planning-generation-mismatch" && err.details
          ? (err.details as Record<string, unknown>)
          : undefined;
      return { ok: false, code: err.code, message: err.message, data };
    }
    if (err instanceof PlanArtifactVersionImmutableError) {
      return {
        ok: false,
        code: err.code,
        message: err.message,
        data: {
          schemaVersion: 1,
          responseSchemaVersion: 1,
          planId: err.planId,
          version: err.version,
          status: err.status
        }
      };
    }
    throw err;
  }

  const persisted = appendWbsRowSuccessResult({
    code: "append-wbs-row-persisted",
    artifact: committed!.artifact,
    storagePath: committed!.storagePath,
    appendedWbsId: wbsRow.wbsId,
    replayed: false,
    ...(committed!.planningChatSession ? { planningChatSession: committed!.planningChatSession } : {})
  });
  attachPolicyMeta(persisted.data as Record<string, unknown>, ctx, planningGeneration, pg.warnings);
  attachGeneratedPlanDocPath(
    persisted.data as Record<string, unknown>,
    await bestEffortGeneratePlanDocument(ctx, committed!.artifact.planId)
  );
  return persisted;
}
