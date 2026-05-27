import type { ModuleCommandResult } from "../../contracts/module-contract.js";
import type { ModuleLifecycleContext } from "../../contracts/module-contract.js";
import {
  normalizeWbsItemToTaskDraft,
  type PlanningExecutionTaskDraft,
  type PlanArtifactV1,
  type PlanArtifactWbsItem,
  resolvePlanArtifactPhaseProposal
} from "../../core/planning/index.js";
import {
  readPlanArtifactVersion,
  resolveLatestPlanArtifactVersion
} from "../../core/planning/plan-artifact-storage.js";
import { openPlanningStores } from "../../core/planning/index.js";
import { allocateNextTaskNumericId } from "../../core/planning/index.js";
import { inferTaskPhaseKey } from "../task-engine/phase-resolution.js";
import { reviewPlanningExecutionDraftGaps } from "../task-engine/planning-execution-draft-review.js";
import { buildTaskFromConversionPayload } from "../task-engine/mutation-utils.js";
import type { TaskEntity, TaskStatus } from "../task-engine/types.js";
import { attachPolicyMeta } from "../task-engine/attach-planning-response-meta.js";
import { planningGenPolicyGate } from "../task-engine/planning-generation-gate.js";

const ACTIVE_PHASE_TASK_STATUSES = new Set<TaskStatus>([
  "ready",
  "in_progress",
  "blocked",
  "awaiting_review",
  "awaiting_policy_approval",
  "awaiting_external_decision"
]);

function parseVersion(raw: unknown): number | undefined {
  if (typeof raw === "number" && Number.isInteger(raw) && raw >= 1) {
    return raw;
  }
  return undefined;
}

function parseWbsFilter(raw: unknown): Set<string> | undefined {
  if (!Array.isArray(raw) || raw.length === 0) {
    return undefined;
  }
  const ids = raw
    .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
    .map((x) => x.trim());
  return ids.length > 0 ? new Set(ids) : undefined;
}

function collectActivePhaseKeys(tasks: TaskEntity[]): string[] {
  const keys = new Set<string>();
  for (const task of tasks) {
    if (!ACTIVE_PHASE_TASK_STATUSES.has(task.status)) {
      continue;
    }
    const key = inferTaskPhaseKey(task);
    if (key) {
      keys.add(key);
    }
  }
  return [...keys];
}

function resolveApprovalTargetVersion(loaded: PlanArtifactV1): number {
  if (loaded.status === "accepted" && loaded.approvalRecord?.approvedVersion !== undefined) {
    return loaded.approvalRecord.approvedVersion;
  }
  return loaded.version;
}

function buildReviewTasksForGaps(
  drafts: PlanningExecutionTaskDraft[],
  existing: TaskEntity[],
  phaseKey: string,
  phaseLabel: string,
  desiredStatus: "proposed" | "ready"
): { ok: true; tasks: TaskEntity[] } | { ok: false; message: string } {
  const now = new Date().toISOString();
  let allocBase = [...existing];
  const built: TaskEntity[] = [];
  for (const draft of drafts) {
    const id = draft.id ?? allocateNextTaskNumericId(allocBase);
    const row: Record<string, unknown> = {
      ...draft,
      id,
      phase: phaseLabel,
      phaseKey,
      status: desiredStatus
    };
    const bt = buildTaskFromConversionPayload(row, now);
    if (!bt.ok) {
      return { ok: false, message: bt.message };
    }
    const task: TaskEntity = {
      ...bt.task,
      status: desiredStatus,
      phaseKey,
      phase: phaseLabel
    };
    built.push(task);
    allocBase = [...allocBase, task];
  }
  return { ok: true, tasks: built };
}

function applyResolvedPhaseToDrafts(
  drafts: PlanningExecutionTaskDraft[],
  phaseKey: string,
  phaseLabel: string,
  desiredStatus: "proposed" | "ready"
): PlanningExecutionTaskDraft[] {
  return drafts.map((d) => ({
    ...d,
    phaseKey,
    phase: phaseLabel,
    status: desiredStatus
  }));
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
  if (!dryRun) {
    return {
      ok: false,
      code: "unsupported-command",
      message: "finalize-plan-to-phase persist path ships in WP-6.5 (T100472+)"
    };
  }

  const stores = await openPlanningStores(ctx);
  const pg = planningGenPolicyGate(
    ctx,
    args,
    instructionPath,
    stores.sqliteDual.getPlanningGeneration()
  );
  if (pg.block) {
    return pg.block;
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

  const requestedVersion = parseVersion(args.version);
  const targetVersion = requestedVersion ?? latestVersion;
  const loaded = readPlanArtifactVersion(ctx.workspacePath, planId, targetVersion);
  if (!loaded) {
    return {
      ok: false,
      code: "plan-artifact-not-found",
      message: `PlanArtifact ${planId} version ${targetVersion} not found`,
      data: { schemaVersion: 1, responseSchemaVersion: 1, planId, version: targetVersion }
    };
  }

  if (requestedVersion !== undefined && requestedVersion !== latestVersion) {
    return {
      ok: false,
      code: "plan-artifact-version-mismatch",
      message: `Requested version ${requestedVersion} is not the latest (${latestVersion})`,
      data: {
        schemaVersion: 1,
        responseSchemaVersion: 1,
        planId,
        version: requestedVersion,
        latestVersion
      }
    };
  }

  if (loaded.status !== "accepted") {
    return {
      ok: false,
      code: "plan-artifact-not-accepted",
      message: `PlanArtifact ${planId} is not accepted (status: ${loaded.status})`,
      data: {
        schemaVersion: 1,
        responseSchemaVersion: 1,
        planId,
        version: loaded.version,
        status: loaded.status
      }
    };
  }

  const approvalTarget = resolveApprovalTargetVersion(loaded);
  if (loaded.approvalRecord?.approvedVersion !== undefined && loaded.approvalRecord.approvedVersion !== approvalTarget) {
    return {
      ok: false,
      code: "plan-artifact-not-accepted",
      message: `PlanArtifact ${planId} approval pin is inconsistent`,
      data: { schemaVersion: 1, responseSchemaVersion: 1, planId, version: loaded.version }
    };
  }

  const desiredStatus: "proposed" | "ready" =
    args.desiredStatus === "proposed" ? "proposed" : "ready";

  const phaseResolved = resolvePlanArtifactPhaseProposal({
    targetPhaseKey: typeof args.targetPhaseKey === "string" ? args.targetPhaseKey : undefined,
    targetPhase: typeof args.targetPhase === "string" ? args.targetPhase : undefined,
    phaseShortDescription:
      typeof args.phaseShortDescription === "string" ? args.phaseShortDescription : undefined,
    phaseRecommendations: loaded.phaseRecommendations,
    activePhaseKeys: collectActivePhaseKeys(stores.taskStore.getAllTasks()),
    allowPhaseKeyCollision: args.allowPhaseKeyCollision === true,
    strict: args.strict !== false
  });

  if (!phaseResolved.ok) {
    return {
      ok: false,
      code: "plan-artifact-finalize-review-failed",
      message: "Finalize blocked: phase proposal could not be resolved",
      data: {
        schemaVersion: 1,
        responseSchemaVersion: 1,
        planId,
        version: loaded.version,
        phaseFindings: phaseResolved.findings
      }
    };
  }

  const { proposal, findings: phaseFindings } = phaseResolved;
  const wbsFilter = parseWbsFilter(args.wbsFilter);
  const wbsRows: PlanArtifactWbsItem[] = wbsFilter
    ? loaded.wbs.filter((row) => wbsFilter.has(row.wbsId))
    : loaded.wbs;

  if (wbsRows.length === 0) {
    return {
      ok: false,
      code: "plan-artifact-finalize-review-failed",
      message: "Finalize blocked: no WBS rows selected",
      data: {
        schemaVersion: 1,
        responseSchemaVersion: 1,
        planId,
        version: loaded.version,
        wbsFilter: wbsFilter ? [...wbsFilter] : undefined
      }
    };
  }

  const normContext = {
    planRef: loaded.planRef,
    planId: loaded.planId,
    planVersion: approvalTarget,
    planningType: loaded.identity.planningType,
    defaultPhase: proposal.label,
    defaultPhaseKey: proposal.phaseKey,
    defaultStatus: desiredStatus
  };

  const wbsFindings: Array<Record<string, unknown>> = [];
  const rawDrafts: PlanningExecutionTaskDraft[] = [];
  for (const row of wbsRows) {
    const normalized = normalizeWbsItemToTaskDraft(row, normContext);
    if (!normalized.ok) {
      for (const f of normalized.findings) {
        wbsFindings.push({
          code: f.code,
          severity: "error",
          wbsId: row.wbsId,
          message: f.message,
          field: f.field
        });
      }
      continue;
    }
    rawDrafts.push(normalized.draft);
  }

  if (wbsFindings.length > 0) {
    return {
      ok: false,
      code: "plan-artifact-finalize-review-failed",
      message: "Finalize blocked: WBS normalization failed",
      data: {
        schemaVersion: 1,
        responseSchemaVersion: 1,
        planId,
        version: loaded.version,
        wbsFindings
      }
    };
  }

  const taskPreview = applyResolvedPhaseToDrafts(
    rawDrafts,
    proposal.phaseKey,
    proposal.label,
    desiredStatus
  );

  const built = buildReviewTasksForGaps(
    taskPreview,
    stores.taskStore.getAllTasks(),
    proposal.phaseKey,
    proposal.label,
    desiredStatus
  );
  if (!built.ok) {
    return {
      ok: false,
      code: "plan-artifact-finalize-review-failed",
      message: built.message,
      data: { schemaVersion: 1, responseSchemaVersion: 1, planId, version: loaded.version }
    };
  }

  const batchFindings = reviewPlanningExecutionDraftGaps(built.tasks);
  const errorCount = batchFindings.filter((f) => f.severity === "error").length;
  const warningCount = batchFindings.filter((f) => f.severity === "warning").length;
  const phaseWarningCount = phaseFindings.filter((f) => f.severity === "warning").length;

  if (errorCount > 0 || phaseFindings.some((f) => f.severity === "blocker")) {
    return {
      ok: false,
      code: "plan-artifact-finalize-review-failed",
      message: "Finalize blocked: task batch review has blockers",
      data: {
        schemaVersion: 1,
        responseSchemaVersion: 1,
        planId,
        version: loaded.version,
        phaseKey: proposal.phaseKey,
        phaseProposal: proposal,
        review: {
          passed: false,
          errorCount,
          warningCount: warningCount + phaseWarningCount,
          findings: [...phaseFindings, ...batchFindings, ...wbsFindings],
          reviewProfile: "ux-cae-pre-persist-v1"
        }
      }
    };
  }

  const result: ModuleCommandResult = {
    ok: true,
    code: "plan-artifact-finalize-preview",
    message: `Finalize preview: ${taskPreview.length} task draft(s) for phase ${proposal.phaseKey}`,
    data: {
      schemaVersion: 1,
      responseSchemaVersion: 1,
      planId,
      version: loaded.version,
      dryRun: true,
      phaseKey: proposal.phaseKey,
      phaseProposal: proposal,
      taskPreview,
      taskGenerationPayloads: taskPreview,
      review: {
        passed: true,
        errorCount: 0,
        warningCount: warningCount + phaseWarningCount,
        findings: [...phaseFindings, ...batchFindings],
        reviewProfile: "ux-cae-pre-persist-v1",
        taskCount: taskPreview.length
      },
      phaseResolutionSource: phaseResolved.source
    }
  };
  attachPolicyMeta(
    result.data as Record<string, unknown>,
    ctx,
    stores.sqliteDual.getPlanningGeneration(),
    pg.warnings
  );
  return result;
}
