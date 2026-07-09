import type { ModuleCommandResult, ModuleLifecycleContext } from "../../contracts/module-contract.js";
import type {
  PlanArtifactIdentity,
  PlanArtifactV1,
  PlanArtifactWbsItem
} from "../../core/planning/plan-artifact-v1.js";
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

export const PATCH_PLAN_ARTIFACT_INSTRUCTION = "src/modules/planning/instructions/patch-plan-artifact.md";

export const PATCHABLE_PLAN_ARTIFACT_SECTIONS = ["identity", "goals", "wbs"] as const;
export type PatchablePlanArtifactSection = (typeof PATCHABLE_PLAN_ARTIFACT_SECTIONS)[number];

const IDENTITY_PATCH_KEYS = new Set(["title", "planningType", "summary", "tags"]);

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

function isPatchableSection(value: unknown): value is PatchablePlanArtifactSection {
  return typeof value === "string" && (PATCHABLE_PLAN_ARTIFACT_SECTIONS as readonly string[]).includes(value);
}

function validateGoalsPatch(patch: unknown): string[] | null {
  if (!Array.isArray(patch) || patch.length === 0) {
    return null;
  }
  const goals: string[] = [];
  for (const entry of patch) {
    if (typeof entry !== "string" || !entry.trim()) {
      return null;
    }
    goals.push(entry.trim());
  }
  return goals;
}

function validateIdentityPatch(patch: unknown): Partial<PlanArtifactIdentity> | null {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
    return null;
  }
  const out: Partial<PlanArtifactIdentity> = {};
  for (const [key, value] of Object.entries(patch as Record<string, unknown>)) {
    if (!IDENTITY_PATCH_KEYS.has(key)) {
      return null;
    }
    if (key === "tags") {
      if (!Array.isArray(value) || value.some((tag) => typeof tag !== "string" || !tag.trim())) {
        return null;
      }
      out.tags = value.map((tag) => (tag as string).trim());
      continue;
    }
    if (typeof value !== "string" || !value.trim()) {
      return null;
    }
    if (key === "title") {
      out.title = value.trim();
    } else if (key === "planningType") {
      out.planningType = value.trim() as PlanArtifactIdentity["planningType"];
    } else if (key === "summary") {
      out.summary = value.trim();
    }
  }
  return Object.keys(out).length > 0 ? out : null;
}

function validateWbsRowPatch(patch: unknown): Record<string, unknown> | null {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
    return null;
  }
  const raw = patch as Record<string, unknown>;
  if ("wbsId" in raw) {
    return null;
  }
  return Object.keys(raw).length > 0 ? raw : null;
}

function patchPlanArtifactSuccessResult(args: {
  code: "patch-plan-artifact-persisted" | "patch-plan-artifact-idempotent-replay";
  artifact: PlanArtifactV1;
  storagePath: string;
  section: PatchablePlanArtifactSection;
  patchedWbsId?: string;
  replayed: boolean;
  planningChatSession?: ReturnType<typeof import("../ideas/planning-chat-session.js").toPlanningChatSessionResponse>;
}): ModuleCommandResult {
  return {
    ok: true,
    code: args.code,
    message: args.replayed ? "Plan artifact patch idempotent replay" : "Plan artifact section patched on unified IdeaPlan draft",
    data: {
      schemaVersion: 1,
      responseSchemaVersion: 1,
      planId: args.artifact.planId,
      version: args.artifact.version,
      planRef: args.artifact.planRef,
      status: args.artifact.status,
      storagePath: args.storagePath,
      patchedSection: args.section,
      ...(args.patchedWbsId ? { patchedWbsId: args.patchedWbsId } : {}),
      replayed: args.replayed,
      ...(args.planningChatSession ? { planningChatSession: args.planningChatSession } : {})
    }
  };
}

export function applyPlanArtifactSectionPatch(
  baseArtifact: PlanArtifactV1,
  section: PatchablePlanArtifactSection,
  patch: unknown,
  wbsId?: string
):
  | { ok: true; artifact: PlanArtifactV1; patchedWbsId?: string }
  | { ok: false; code: string; message: string; data?: Record<string, unknown> } {
  if (section === "identity") {
    const identityPatch = validateIdentityPatch(patch);
    if (!identityPatch) {
      return {
        ok: false,
        code: "patch-shape-invalid",
        message: "identity patch must be a non-empty object with title, planningType, summary, and/or tags"
      };
    }
    return {
      ok: true,
      artifact: {
        ...baseArtifact,
        identity: { ...baseArtifact.identity, ...identityPatch }
      }
    };
  }

  if (section === "goals") {
    const goals = validateGoalsPatch(patch);
    if (!goals) {
      return {
        ok: false,
        code: "patch-shape-invalid",
        message: "goals patch must be a non-empty array of non-empty strings"
      };
    }
    return {
      ok: true,
      artifact: {
        ...baseArtifact,
        goals
      }
    };
  }

  const resolvedWbsId = cleanString(wbsId);
  if (!resolvedWbsId) {
    return {
      ok: false,
      code: "wbs-id-required",
      message: "patch-plan-artifact section wbs requires wbsId"
    };
  }

  const rowPatch = validateWbsRowPatch(patch);
  if (!rowPatch) {
    return {
      ok: false,
      code: "patch-shape-invalid",
      message: "wbs patch must be a non-empty object of row fields (wbsId is supplied separately)"
    };
  }

  const rowIndex = baseArtifact.wbs.findIndex((row) => row.wbsId === resolvedWbsId);
  if (rowIndex < 0) {
    return {
      ok: false,
      code: "wbs-not-found",
      message: `WBS row '${resolvedWbsId}' not found on plan ${baseArtifact.planId}`,
      data: { schemaVersion: 1, responseSchemaVersion: 1, planId: baseArtifact.planId, wbsId: resolvedWbsId }
    };
  }

  const mergedRow = { ...baseArtifact.wbs[rowIndex], ...rowPatch } as PlanArtifactWbsItem;
  const wbsShape = validatePlanArtifactWbsItemShape(mergedRow);
  if (!wbsShape.ok) {
    return {
      ok: false,
      code: "wbs-shape-invalid",
      message: "Merged WBS row failed structural validation",
      data: {
        schemaVersion: 1,
        responseSchemaVersion: 1,
        findings: wbsShape.findings
      }
    };
  }

  const nextWbs = [...baseArtifact.wbs];
  nextWbs[rowIndex] = wbsShape.item;
  return {
    ok: true,
    artifact: {
      ...baseArtifact,
      wbs: nextWbs
    },
    patchedWbsId: resolvedWbsId
  };
}

export async function runPatchPlanArtifact(
  args: Record<string, unknown>,
  ctx: ModuleLifecycleContext,
  instructionPath: string = PATCH_PLAN_ARTIFACT_INSTRUCTION
): Promise<ModuleCommandResult> {
  const planRef = resolvePlanRef(args);
  if (!planRef) {
    return { ok: false, code: "invalid-args", message: "patch-plan-artifact requires planRef or planId" };
  }

  const sectionRaw = cleanString(args.section);
  if (!sectionRaw || !isPatchableSection(sectionRaw)) {
    return {
      ok: false,
      code: "patch-section-invalid",
      message: `patch-plan-artifact section must be one of: ${PATCHABLE_PLAN_ARTIFACT_SECTIONS.join(", ")}`,
      data: {
        schemaVersion: 1,
        responseSchemaVersion: 1,
        allowedSections: [...PATCHABLE_PLAN_ARTIFACT_SECTIONS]
      }
    };
  }
  const section = sectionRaw;

  if (!("patch" in args)) {
    return {
      ok: false,
      code: "invalid-args",
      message: "patch-plan-artifact requires patch payload for the target section"
    };
  }

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
      message: `patch-plan-artifact requires unified document status planning (current: ${document.status})`,
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
      message: "Unified IdeaPlan lacks planning payload; run draft-plan-artifact before patch-plan-artifact",
      data: { schemaVersion: 1, responseSchemaVersion: 1, planId, planRef }
    };
  }

  const wbsId = cleanString(args.wbsId) ?? cleanString((args.patch as Record<string, unknown> | undefined)?.wbsId);
  const applied = applyPlanArtifactSectionPatch(baseArtifact, section, args.patch, wbsId);
  if (!applied.ok) {
    return {
      ok: false,
      code: applied.code,
      message: applied.message,
      ...(applied.data ? { data: applied.data } : {})
    };
  }

  const nowIso = new Date().toISOString();
  const nextArtifact: PlanArtifactV1 = {
    ...applied.artifact,
    status: "draft",
    provenance: {
      ...applied.artifact.provenance,
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
      message: "PlanArtifact validation failed after section patch",
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
    const replay = patchPlanArtifactSuccessResult({
      code: "patch-plan-artifact-idempotent-replay",
      artifact: prelude.artifact,
      storagePath: prelude.storagePath,
      section,
      patchedWbsId: applied.patchedWbsId,
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

  const persisted = patchPlanArtifactSuccessResult({
    code: "patch-plan-artifact-persisted",
    artifact: committed!.artifact,
    storagePath: committed!.storagePath,
    section,
    patchedWbsId: applied.patchedWbsId,
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
