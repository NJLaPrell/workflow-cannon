import type { ModuleCommandResult } from "../../contracts/module-contract.js";
import type { ModuleLifecycleContext } from "../../contracts/module-contract.js";
import {
  normalizeWbsItemToTaskDraft,
  prepareFinalizeDraftsWithWbsDependencies,
  type PlanningExecutionTaskDraft,
  type PlanArtifactV1,
  type PlanArtifactWbsItem,
  resolvePlanArtifactPhaseProposal
} from "../../core/planning/index.js";
import { allocateNextTaskNumericId } from "../task-engine/id-allocation.js";
import {
  resolveLatestPlanArtifactVersion,
  writeNextPlanArtifactVersion
} from "../../core/planning/plan-artifact-storage.js";
import type { IdeaPlanDocumentWithPlanningPayload } from "../ideas/idea-plan-planning-init.js";
import type { IdeaPlanDocument } from "../ideas/idea-plan-types.js";
import { openPlanningStores } from "../../core/planning/index.js";
import {
  ideaPlanStatusInvalidResult,
  persistUnifiedIdeaPlanDeliveryRefs,
  readStoredPlanArtifactVersion,
  unifiedIdeaPlanStoragePath
} from "./unified-idea-plan-review-accept.js";
import { inferTaskPhaseKey } from "../task-engine/phase-resolution.js";
import { reviewPlanningExecutionDraftGaps } from "../task-engine/planning-execution-draft-review.js";
import { runTaskRowMutationCommands } from "../task-engine/commands/task-row-mutation-commands.js";
import { runUpsertPhaseCatalogEntry } from "../task-engine/phase-catalog-commands-runtime.js";
import { readPhaseCatalogRows } from "../task-engine/persistence/phase-catalog-store.js";
import { collectPhaseCatalogHintsFromTasks } from "../task-engine/persistence/phase-catalog-store.js";
import { readKitWorkspaceStatusRow } from "../task-engine/persistence/workspace-status-store.js";
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

function collectOccupiedPhaseKeys(tasks: TaskEntity[]): string[] {
  return collectPhaseCatalogHintsFromTasks(tasks);
}

function catalogShortDescriptionForFinalize(
  loaded: PlanArtifactV1,
  phaseKey: string,
  proposalDescription: string
): string {
  const fromProposal = proposalDescription.trim();
  if (fromProposal.length > 0) {
    return fromProposal.slice(0, 240);
  }
  const match = loaded.phaseRecommendations.find((r) => r.phaseKey.trim() === phaseKey);
  const fromRecommendation = match?.label?.trim();
  if (fromRecommendation && fromRecommendation.length > 0) {
    return fromRecommendation.slice(0, 240);
  }
  const title = loaded.identity.title.trim();
  if (title.length > 0) {
    return title.slice(0, 240);
  }
  return `Phase ${phaseKey}`;
}

async function ensurePhaseCatalogEntryForFinalize(args: {
  ctx: ModuleLifecycleContext;
  stores: Awaited<ReturnType<typeof openPlanningStores>>;
  phaseKey: string;
  shortDescription: string;
  dryRun: boolean;
  commandArgs: Record<string, unknown>;
}): Promise<
  | { ok: true; created: boolean; skipped: boolean; catalogResult?: ModuleCommandResult }
  | { ok: false; result: ModuleCommandResult }
> {
  const db = args.stores.sqliteDual.getDatabase();
  const existing = readPhaseCatalogRows(db).some((row) => row.phaseKey === args.phaseKey);
  if (existing) {
    return { ok: true, created: false, skipped: true };
  }
  if (args.dryRun) {
    return { ok: true, created: true, skipped: false };
  }
  const clientMutationId =
    typeof args.commandArgs.clientMutationId === "string"
      ? `${args.commandArgs.clientMutationId}::phase-catalog`
      : undefined;
  const catalogResult = await runUpsertPhaseCatalogEntry(
    args.ctx,
    args.stores,
    args.stores.taskStore,
    {
      phaseKey: args.phaseKey,
      shortDescription: args.shortDescription,
      expectedPlanningGeneration: args.commandArgs.expectedPlanningGeneration,
      policyApproval: args.commandArgs.policyApproval,
      clientMutationId,
      actor: args.commandArgs.actor
    }
  );
  if (!catalogResult.ok) {
    return { ok: false, result: catalogResult };
  }
  return { ok: true, created: true, skipped: false, catalogResult };
}

function resolveApprovalTargetVersion(
  loaded: PlanArtifactV1,
  unifiedDocument?: IdeaPlanDocument
): number {
  if (unifiedDocument?.acceptance?.acceptedVersion !== undefined) {
    return unifiedDocument.acceptance.acceptedVersion;
  }
  if (loaded.status === "accepted" && loaded.approvalRecord?.approvedVersion !== undefined) {
    return loaded.approvalRecord.approvedVersion;
  }
  return unifiedDocument?.version ?? loaded.version;
}

function planArtifactFallback(planId: string): PlanArtifactV1 {
  return {
    schemaVersion: 1,
    planId,
    version: 1,
    planRef: `plan-artifact:${planId}`,
    status: "draft",
    identity: { title: "Plan", planningType: "new-feature" },
    goals: [],
    nonGoals: [],
    valueAssessment: { impact: "", confidence: "medium" },
    riskAssessment: [],
    technicalImpact: { systemsTouched: [] },
    testingStrategy: { layers: [], criticalPaths: [] },
    implementationGuidance: [],
    whatNotToDo: [],
    assumptions: [],
    openQuestions: [],
    wbs: [],
    phaseRecommendations: [],
    provenance: {
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: "agent",
      source: "draft-plan-artifact"
    }
  };
}

function buildFinalizeTasks(
  drafts: PlanningExecutionTaskDraft[],
  phaseKey: string,
  phaseLabel: string,
  desiredStatus: "proposed" | "ready"
): { ok: true; tasks: TaskEntity[] } | { ok: false; message: string } {
  const now = new Date().toISOString();
  const built: TaskEntity[] = [];
  for (const draft of drafts) {
    const row: Record<string, unknown> = {
      ...draft,
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
  const stored = readStoredPlanArtifactVersion(
    ctx.workspacePath,
    planId,
    targetVersion,
    planArtifactFallback(planId)
  );
  if (!stored) {
    return {
      ok: false,
      code: "plan-artifact-not-found",
      message: `PlanArtifact ${planId} version ${targetVersion} not found`,
      data: { schemaVersion: 1, responseSchemaVersion: 1, planId, version: targetVersion }
    };
  }
  const loaded = stored.artifact;
  const unifiedDocument =
    stored.kind === "idea-plan" ? (stored.document as IdeaPlanDocumentWithPlanningPayload) : undefined;
  const artifactVersion = unifiedDocument?.version ?? loaded.version;

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

  if (unifiedDocument) {
    if (unifiedDocument.status !== "accepted") {
      return ideaPlanStatusInvalidResult(
        "idea-plan-status-invalid",
        `finalize-plan-to-phase requires unified document status accepted (current: ${unifiedDocument.status})`,
        planId,
        unifiedDocument.status,
        "accepted"
      );
    }
  } else if (loaded.status !== "accepted") {
    return {
      ok: false,
      code: "plan-artifact-not-accepted",
      message: `PlanArtifact ${planId} is not accepted (status: ${loaded.status})`,
      data: {
        schemaVersion: 1,
        responseSchemaVersion: 1,
        planId,
        version: artifactVersion,
        status: loaded.status
      }
    };
  }

  const approvalTarget = resolveApprovalTargetVersion(loaded, unifiedDocument);
  if (
    !unifiedDocument &&
    loaded.approvalRecord?.approvedVersion !== undefined &&
    loaded.approvalRecord.approvedVersion !== approvalTarget
  ) {
    return {
      ok: false,
      code: "plan-artifact-not-accepted",
      message: `PlanArtifact ${planId} approval pin is inconsistent`,
      data: { schemaVersion: 1, responseSchemaVersion: 1, planId, version: artifactVersion }
    };
  }

  const desiredStatus: "proposed" | "ready" =
    args.desiredStatus === "proposed" ? "proposed" : "ready";

  const allTasks = stores.taskStore.getAllTasks();
  const workspaceStatus = readKitWorkspaceStatusRow(stores.sqliteDual.getDatabase());
  const workspaceNextPhaseKey =
    typeof workspaceStatus?.nextKitPhase === "string" ? workspaceStatus.nextKitPhase.trim() : "";

  const phaseResolved = resolvePlanArtifactPhaseProposal({
    targetPhaseKey: typeof args.targetPhaseKey === "string" ? args.targetPhaseKey : undefined,
    targetPhase: typeof args.targetPhase === "string" ? args.targetPhase : undefined,
    phaseShortDescription:
      typeof args.phaseShortDescription === "string" ? args.phaseShortDescription : undefined,
    phaseRecommendations: loaded.phaseRecommendations,
    activePhaseKeys: collectActivePhaseKeys(allTasks),
    occupiedPhaseKeys: collectOccupiedPhaseKeys(allTasks),
    workspaceNextPhaseKey: workspaceNextPhaseKey.length > 0 ? workspaceNextPhaseKey : undefined,
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
    defaultStatus: desiredStatus,
    sourceIdeaId:
      typeof loaded.provenance.sourceIdeaId === "string" ? loaded.provenance.sourceIdeaId : undefined
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

  const preparedDrafts = prepareFinalizeDraftsWithWbsDependencies({
    drafts: taskPreview,
    selectedWbsRows: wbsRows,
    allWbsRows: loaded.wbs,
    existingTasks: stores.taskStore.getAllTasks(),
    allocateTaskId: allocateNextTaskNumericId
  });
  if (!preparedDrafts.ok) {
    return {
      ok: false,
      code: "plan-artifact-finalize-review-failed",
      message: preparedDrafts.message,
      data: {
        schemaVersion: 1,
        responseSchemaVersion: 1,
        planId,
        version: loaded.version,
        wbsFindings: preparedDrafts.findings
      }
    };
  }

  const built = buildFinalizeTasks(
    preparedDrafts.drafts,
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

  const catalogShortDescription = catalogShortDescriptionForFinalize(
    loaded,
    proposal.phaseKey,
    proposal.description
  );
  const catalogEnsure = await ensurePhaseCatalogEntryForFinalize({
    ctx,
    stores,
    phaseKey: proposal.phaseKey,
    shortDescription: catalogShortDescription,
    dryRun,
    commandArgs: args
  });
  if (!catalogEnsure.ok) {
    return catalogEnsure.result;
  }

  const phaseCatalogMeta = {
    phaseKey: proposal.phaseKey,
    shortDescription: catalogShortDescription,
    created: catalogEnsure.created,
    skippedExisting: catalogEnsure.skipped
  };

  if (!dryRun) {
    let expectedPlanningGeneration = args.expectedPlanningGeneration;
    const catalogGen = (catalogEnsure.catalogResult?.data as Record<string, unknown> | undefined)
      ?.planningGeneration;
    if (typeof catalogGen === "number") {
      expectedPlanningGeneration = catalogGen;
    }

    const persist = await runTaskRowMutationCommands(
      {
        name: "persist-planning-execution-drafts",
        args: {
          tasks: built.tasks,
          planRef: loaded.planRef,
          planningType: loaded.identity.planningType,
          targetPhaseKey: proposal.phaseKey,
          targetPhase: proposal.label,
          desiredStatus,
          expectedPlanningGeneration,
          policyApproval: args.policyApproval,
          clientMutationId: args.clientMutationId,
          actor: args.actor
        }
      },
      ctx,
      stores,
      stores.taskStore
    );
    if (!persist) {
      return {
        ok: false,
        code: "unsupported-command",
        message: "persist-planning-execution-drafts is unavailable"
      };
    }
    if (!persist.ok) {
      return persist;
    }

    const now = new Date().toISOString();
    const taskRefs = built.tasks.map((task) => task.id);

    if (unifiedDocument) {
      const persisted = persistUnifiedIdeaPlanDeliveryRefs({
        workspacePath: ctx.workspacePath,
        document: unifiedDocument,
        taskRefs,
        phaseKey: proposal.phaseKey,
        taskCount: built.tasks.length,
        updatedAt: now,
        sqliteDb: stores.sqliteDual.getDatabase()
      });
      const persistData = (persist.data ?? {}) as Record<string, unknown>;
      const result: ModuleCommandResult = {
        ok: true,
        code:
          persist.code === "planning-execution-drafts-idempotent-replay"
            ? "plan-artifact-finalize-idempotent-replay"
            : "plan-artifact-finalize-persisted",
        message: `Finalized plan ${planId} into ${built.tasks.length} task(s) for phase ${proposal.phaseKey}`,
        data: {
          schemaVersion: 1,
          responseSchemaVersion: 1,
          planId,
          version: persisted.version,
          planRef: loaded.planRef,
          status: persisted.status,
          ideaPlanStatus: persisted.status,
          dryRun: false,
          phaseKey: proposal.phaseKey,
          phaseProposal: proposal,
          phaseResolutionSource: phaseResolved.source,
          createdTasks: persistData.createdTasks,
          count: persistData.count ?? built.tasks.length,
          replayed: persistData.replayed === true,
          storagePath: unifiedIdeaPlanStoragePath(ctx.workspacePath, persisted.planId, persisted.version),
          delegatedCode: persist.code,
          phaseCatalog: phaseCatalogMeta,
          delivery: persisted.delivery,
          review: {
            passed: true,
            errorCount: 0,
            warningCount: warningCount + phaseWarningCount,
            findings: [...phaseFindings, ...batchFindings],
            reviewProfile: "ux-cae-pre-persist-v1",
            taskCount: built.tasks.length
          },
          planningGeneration: persistData.planningGeneration,
          planningGenerationPolicy: persistData.planningGenerationPolicy
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

    const finalized: PlanArtifactV1 = {
      ...loaded,
      status: "finalized",
      taskGenerationPayloads: built.tasks.map((task) => ({
        id: task.id,
        title: task.title,
        type: task.type,
        priority: task.priority,
        phase: task.phase,
        phaseKey: task.phaseKey,
        approach: task.approach ?? "",
        technicalScope: task.technicalScope ?? [],
        acceptanceCriteria: task.acceptanceCriteria ?? [],
        dependsOn: task.dependsOn,
        status: task.status === "ready" ? "ready" : "proposed"
      })),
      provenance: {
        ...loaded.provenance,
        updatedAt: now
      }
    };
    const written = writeNextPlanArtifactVersion(ctx.workspacePath, finalized, {
      effectiveConfig: ctx.effectiveConfig as Record<string, unknown> | undefined,
      sqliteDb: stores.sqliteDual.getDatabase()
    });
    const persistData = (persist.data ?? {}) as Record<string, unknown>;
    const result: ModuleCommandResult = {
      ok: true,
      code:
        persist.code === "planning-execution-drafts-idempotent-replay"
          ? "plan-artifact-finalize-idempotent-replay"
          : "plan-artifact-finalize-persisted",
      message: `Finalized plan ${planId} into ${built.tasks.length} task(s) for phase ${proposal.phaseKey}`,
      data: {
        schemaVersion: 1,
        responseSchemaVersion: 1,
        planId,
        version: written.artifact.version,
        planRef: loaded.planRef,
        status: written.artifact.status,
        dryRun: false,
        phaseKey: proposal.phaseKey,
        phaseProposal: proposal,
        phaseResolutionSource: phaseResolved.source,
        createdTasks: persistData.createdTasks,
        count: persistData.count ?? built.tasks.length,
        replayed: persistData.replayed === true,
        storagePath: written.paths.artifactFileRelative(written.artifact.version),
        delegatedCode: persist.code,
        phaseCatalog: phaseCatalogMeta,
        review: {
          passed: true,
          errorCount: 0,
          warningCount: warningCount + phaseWarningCount,
          findings: [...phaseFindings, ...batchFindings],
          reviewProfile: "ux-cae-pre-persist-v1",
          taskCount: built.tasks.length
        },
        planningGeneration: persistData.planningGeneration,
        planningGenerationPolicy: persistData.planningGenerationPolicy
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
      taskPreview: preparedDrafts.drafts,
      taskGenerationPayloads: preparedDrafts.drafts,
      review: {
        passed: true,
        errorCount: 0,
        warningCount: warningCount + phaseWarningCount,
        findings: [...phaseFindings, ...batchFindings],
        reviewProfile: "ux-cae-pre-persist-v1",
        taskCount: taskPreview.length
      },
      phaseResolutionSource: phaseResolved.source,
      phaseCatalog: phaseCatalogMeta
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
