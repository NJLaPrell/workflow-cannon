import type { ModuleCommandResult, ModuleLifecycleContext } from "../../contracts/module-contract.js";
import type { PlanArtifactV1 } from "../../core/planning/plan-artifact-v1.js";
import {
  normalizeWbsItemToTaskDraft,
  openPlanningStores,
  readPlanArtifactVersion,
  resolveLatestPlanArtifactVersion,
  resolvePlanArtifactPhaseProposal,
  type PlanningExecutionTaskDraft
} from "../../core/planning/index.js";
import { maxNumericTaskIdFromIds } from "./build-plan-execution-drafts.js";
import { runTaskRowMutationCommands } from "../task-engine/commands/task-row-mutation-commands.js";
import type { TaskEntity } from "../task-engine/types.js";
import { planningGenPolicyGate } from "../task-engine/planning-generation-gate.js";

const TERMINAL_TASK_STATUSES = new Set(["completed", "cancelled", "canceled", "deferred", "archived"]);

function parseVersion(raw: unknown): number | undefined {
  if (typeof raw === "number" && Number.isInteger(raw) && raw >= 1) return raw;
  if (typeof raw === "string" && /^\d+$/.test(raw.trim())) return Number(raw.trim());
  return undefined;
}

function parseStringArray(raw: unknown, field: string): { ok: true; values: string[] } | { ok: false; result: ModuleCommandResult } {
  if (raw === undefined) return { ok: true, values: [] };
  if (!Array.isArray(raw)) {
    return { ok: false, result: { ok: false, code: "invalid-run-args", message: `${field} must be an array of strings` } };
  }
  const values = raw.filter((x): x is string => typeof x === "string").map((x) => x.trim()).filter(Boolean);
  if (values.length !== raw.length) {
    return { ok: false, result: { ok: false, code: "invalid-run-args", message: `${field} must contain only non-empty strings` } };
  }
  return { ok: true, values };
}

function taskIsActive(task: TaskEntity): boolean {
  return !TERMINAL_TASK_STATUSES.has(String(task.status));
}

function selectedWbsRows(artifact: PlanArtifactV1, wbsFilter: string[]): PlanArtifactV1["wbs"] {
  if (wbsFilter.length === 0) return artifact.wbs;
  const wanted = new Set(wbsFilter);
  return artifact.wbs.filter((row) => wanted.has(row.wbsId) || (row.path ? wanted.has(row.path) : false));
}

function allocatePreviewIds(drafts: PlanningExecutionTaskDraft[], existingTasks: TaskEntity[]): PlanningExecutionTaskDraft[] {
  const existingIds = new Set(existingTasks.map((task) => task.id));
  const assigned = new Set<string>();
  let next = maxNumericTaskIdFromIds(existingIds);
  return drafts.map((draft) => {
    const requested = typeof draft.id === "string" && /^T\d+$/.test(draft.id.trim()) ? draft.id.trim() : undefined;
    let id = requested;
    if (!id || existingIds.has(id) || assigned.has(id)) {
      do {
        next += 1;
        id = `T${next}`;
      } while (existingIds.has(id) || assigned.has(id));
    }
    assigned.add(id);
    return { ...draft, id };
  });
}

function remapWbsDependencies(
  drafts: PlanningExecutionTaskDraft[],
  wbsToTaskId: Map<string, string>
): PlanningExecutionTaskDraft[] {
  return drafts.map((draft) => {
    const dependsOn = draft.dependsOn?.map((dep) => wbsToTaskId.get(dep) ?? dep);
    return dependsOn ? { ...draft, dependsOn } : draft;
  });
}

function assertAcceptedArtifact(artifact: PlanArtifactV1): ModuleCommandResult | null {
  if (artifact.status !== "accepted") {
    return {
      ok: false,
      code: "plan-artifact-not-accepted",
      message: `PlanArtifact ${artifact.planId} is not accepted (status: ${artifact.status})`,
      data: {
        schemaVersion: 1,
        responseSchemaVersion: 1,
        planId: artifact.planId,
        version: artifact.version,
        status: artifact.status
      }
    };
  }
  if (artifact.approvalRecord?.confirmed !== true || artifact.approvalRecord.planRef !== artifact.planRef) {
    return {
      ok: false,
      code: "plan-artifact-not-accepted",
      message: `PlanArtifact ${artifact.planId} is missing a confirmed approval record`,
      data: { schemaVersion: 1, responseSchemaVersion: 1, planId: artifact.planId, version: artifact.version }
    };
  }
  return null;
}

export async function runFinalizePlanToPhase(
  args: Record<string, unknown>,
  ctx: ModuleLifecycleContext,
  instructionPath: string
): Promise<ModuleCommandResult> {
  const planId = typeof args.planId === "string" ? args.planId.trim() : "";
  if (!planId) {
    return { ok: false, code: "invalid-run-args", message: "finalize-plan-to-phase requires planId" };
  }

  const dryRun = args.dryRun !== false;
  const requestedVersion = parseVersion(args.version);
  if (args.version !== undefined && requestedVersion === undefined) {
    return { ok: false, code: "invalid-run-args", message: "version must be a positive integer" };
  }

  const latestVersion = resolveLatestPlanArtifactVersion(ctx.workspacePath, planId);
  if (latestVersion === null) {
    return {
      ok: false,
      code: "plan-artifact-not-found",
      message: `PlanArtifact ${planId} not found`,
      data: { schemaVersion: 1, responseSchemaVersion: 1, planId }
    };
  }
  if (requestedVersion !== undefined && requestedVersion !== latestVersion) {
    return {
      ok: false,
      code: "plan-artifact-version-mismatch",
      message: `Requested version ${requestedVersion} is not the latest (${latestVersion})`,
      data: { schemaVersion: 1, responseSchemaVersion: 1, planId, version: requestedVersion, latestVersion }
    };
  }

  const loaded = readPlanArtifactVersion(ctx.workspacePath, planId, latestVersion);
  if (!loaded) {
    return {
      ok: false,
      code: "plan-artifact-not-found",
      message: `PlanArtifact ${planId} version ${latestVersion} not found`,
      data: { schemaVersion: 1, responseSchemaVersion: 1, planId, version: latestVersion }
    };
  }

  const acceptedBlock = assertAcceptedArtifact(loaded);
  if (acceptedBlock) return acceptedBlock;

  const wbsFilter = parseStringArray(args.wbsFilter, "wbsFilter");
  if (!wbsFilter.ok) return wbsFilter.result;

  const stores = await openPlanningStores(ctx);
  if (!dryRun) {
    const pg = planningGenPolicyGate(ctx, args, instructionPath, stores.sqliteDual.getPlanningGeneration());
    if (pg.block) return pg.block;
    return {
      ok: false,
      code: "unsupported-command",
      message: "finalize-plan-to-phase persist path ships in T100472; dryRun preview is available"
    };
  }

  const existingTasks = stores.taskStore.getAllTasks();
  const activePhaseKeys = Array.from(
    new Set(existingTasks.filter(taskIsActive).map((task) => task.phaseKey).filter((key): key is string => typeof key === "string" && key.trim().length > 0))
  ).sort();
  const phase = resolvePlanArtifactPhaseProposal({
    targetPhaseKey: typeof args.targetPhaseKey === "string" ? args.targetPhaseKey : undefined,
    targetPhase: typeof args.targetPhase === "string" ? args.targetPhase : undefined,
    preferredPhaseKey: typeof args.preferredPhaseKey === "string" ? args.preferredPhaseKey : undefined,
    phaseShortDescription: typeof args.phaseShortDescription === "string" ? args.phaseShortDescription : undefined,
    phaseRecommendations: loaded.phaseRecommendations,
    activePhaseKeys,
    allowPhaseKeyCollision: args.allowPhaseKeyCollision === true,
    strict: args.strict !== false
  });
  if (!phase.ok) {
    return {
      ok: false,
      code: phase.code,
      message: "Finalize blocked by phase proposal findings",
      data: { schemaVersion: 1, responseSchemaVersion: 1, planId, version: loaded.version, findings: phase.findings }
    };
  }

  const desiredStatus = args.desiredStatus === "proposed" ? "proposed" : "ready";
  if (args.desiredStatus !== undefined && args.desiredStatus !== "proposed" && args.desiredStatus !== "ready") {
    return { ok: false, code: "invalid-run-args", message: "desiredStatus must be 'proposed' or 'ready'" };
  }

  const selected = selectedWbsRows(loaded, wbsFilter.values);
  if (selected.length === 0) {
    return { ok: false, code: "invalid-run-args", message: "wbsFilter did not match any WBS rows" };
  }

  const normalized: PlanningExecutionTaskDraft[] = [];
  const provenanceRows: Record<string, unknown>[] = [];
  for (const row of selected) {
    const result = normalizeWbsItemToTaskDraft(row, {
      planRef: loaded.planRef,
      planId: loaded.planId,
      planVersion: loaded.version,
      planningType: loaded.identity.planningType,
      defaultPhase: phase.proposal.label,
      defaultPhaseKey: phase.proposal.phaseKey,
      defaultStatus: desiredStatus
    });
    if (!result.ok) {
      return {
        ok: false,
        code: "plan-artifact-finalize-review-failed",
        message: `WBS row ${row.wbsId} is not task-draft compatible`,
        data: { schemaVersion: 1, responseSchemaVersion: 1, planId, version: loaded.version, findings: result.findings }
      };
    }
    normalized.push(result.draft);
    provenanceRows.push(result.planningProvenance as unknown as Record<string, unknown>);
  }

  const withIds = allocatePreviewIds(normalized, existingTasks);
  const wbsToTaskId = new Map<string, string>();
  selected.forEach((row, index) => {
    const taskId = withIds[index]?.id;
    if (taskId) wbsToTaskId.set(row.wbsId, taskId);
  });
  const taskPreview = remapWbsDependencies(withIds, wbsToTaskId);

  const review = await runTaskRowMutationCommands(
    {
      name: "review-planning-execution-drafts",
      args: {
        tasks: taskPreview,
        planRef: loaded.planRef,
        planningType: loaded.identity.planningType,
        targetPhaseKey: phase.proposal.phaseKey,
        targetPhase: phase.proposal.label,
        desiredStatus
      }
    },
    ctx,
    stores,
    stores.taskStore
  );
  if (!review) {
    return { ok: false, code: "unsupported-command", message: "review-planning-execution-drafts is unavailable" };
  }

  const data: Record<string, unknown> = {
    schemaVersion: 1,
    responseSchemaVersion: 1,
    planId: loaded.planId,
    version: loaded.version,
    planRef: loaded.planRef,
    dryRun: true,
    persisted: false,
    phaseKey: phase.proposal.phaseKey,
    targetPhase: phase.proposal.label,
    phaseProposal: phase.proposal,
    phaseProposalSource: phase.source,
    phaseFindings: phase.findings,
    desiredStatus,
    wbsFilter: wbsFilter.values,
    taskPreview,
    taskGenerationPayloads: taskPreview,
    planningProvenance: provenanceRows,
    review: review.data ?? { code: review.code, ok: review.ok },
    reviewCode: review.code
  };

  if (!review.ok || review.code === "planning-execution-drafts-review-findings") {
    return {
      ok: false,
      code: "plan-artifact-finalize-review-failed",
      message: review.message ?? "Finalize preview review failed",
      data
    };
  }

  return {
    ok: true,
    code: "plan-artifact-finalize-preview",
    message: `Finalize preview generated ${taskPreview.length} task draft(s) for ${phase.proposal.label}`,
    data
  };
}