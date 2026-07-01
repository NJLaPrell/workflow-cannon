import type Database from "better-sqlite3";
import type { ModuleLifecycleContext } from "../../../contracts/module-contract.js";
import type {
  DashboardSummaryData,
  DashboardTaskRow,
  DashboardSystemStatus,
  DashboardTaskStateProjectionSummary,
  DashboardSubagentRegistrySummary,
  DashboardTeamExecutionSummary,
  DashboardPastPhaseNotesEntry,
  DashboardApprovalQueueSummary,
  DashboardHumanGatesSummary,
  DashboardIdeasSummary,
  DashboardPhaseJournalStats
} from "../../../contracts/dashboard-summary-run.js";
import type { TaskStore } from "../persistence/store.js";
import type { SqliteDualPlanningStore } from "../persistence/sqlite-dual-planning.js";
import type { TaskEntity } from "../types.js";
import {
  buildDashboardSystemStatus,
  buildDashboardSystemStatusOverview
} from "./build-dashboard-system-status.js";
import {
  buildDashboardTaskStateProjectionSummary,
  buildDashboardTaskStateProjectionOverview
} from "./build-dashboard-task-state-projection.js";
import {
  readCurrentAgentActivityLease,
  listCurrentAgentActivityLeases,
  agentActivityLeaseToDashboardStatus
} from "../agent-activity-store.js";
import { buildDashboardAgentStatus } from "./dashboard-agent-status.js";
import { buildDashboardAgentActivitySummary } from "./build-dashboard-agent-activity-summary.js";
import {
  buildDashboardCurrentPhaseDelivery,
  collectPhaseDeliveryDashboardFields
} from "./phase-delivery-status.js";
import { resolveAgentGuidanceFromEffectiveConfig } from "../../../core/agent-guidance-catalog.js";
import { loadBehaviorWorkspaceState } from "../../agent-behavior/persistence.js";
import { BehaviorProfileStore } from "../../agent-behavior/store.js";
import { dashboardOnboardingTemperamentLabel } from "../../agent-behavior/onboarding-temperament-label.js";
import { resolveAgentPresentationPolicy } from "../../../core/agent-presentation-policy.js";
import { buildDashboardHumanGatesSummary } from "./build-dashboard-human-gates.js";
import { buildDashboardApprovalQueueSummary } from "./build-dashboard-approval-queue.js";
import { summarizePendingTaskMutationIntents } from "../coordination/task-mutation-intents.js";
import { buildDashboardPhaseJournalStats } from "./build-dashboard-phase-journal-stats.js";
import { buildDashboardPastPhaseNotes } from "./build-dashboard-past-phase-notes.js";
import { getNextActions, isImprovementLikeTask } from "../suggestions.js";
import { buildFeatureEnrichmentBySlug, loadTaskFeatureLinkMap } from "../persistence/feature-registry-queries.js";
import { projectDashboardTaskRow } from "../task-read-projections.js";
import { buildDashboardPhaseBucketsForTasks } from "./dashboard-phase-buckets.js";
import {
  listWishlistIntakeTasksAsItems,
  findWishlistIntakeTaskByLegacyOrTaskId,
  isWishlistIntakeTask
} from "../wishlist-intake.js";
import { readBuildPlanSession, toDashboardPlanningSession } from "../../../core/planning/build-plan-session-file.js";
import { getPlanningGenerationPolicy } from "../planning-config.js";
import {
  decodeListTasksCursor,
  encodeListTasksCursor,
  listTaskIsAfterCursor,
  listTasksComparator
} from "../list-tasks-pagination.js";
import { projectTaskReadEntity } from "../task-read-projections.js";
import { rowToTaskEntity, type TaskEngineTaskRow } from "../persistence/sqlite-task-row-mapping.js";
import { TASK_ENGINE_TASKS_TABLE } from "../../../core/state/kit-sqlite/planning-sqlite-kernel.js";
import { inferTaskPhaseKey } from "../phase-resolution.js";
import { summarizeAgentRegistrySessions } from "../agent-registry-session-summary.js";
import { summarizeCheckpointsForDashboard } from "../../checkpoints/checkpoint-store.js";
import { summarizeSubagentsForDashboard } from "../../subagents/subagent-store.js";
import { summarizeTeamAssignmentsForDashboard } from "../../team-execution/assignment-store.js";
import {
  openSqliteDualForWorkspaceStatus,
  readWorkspaceStatusSnapshotFromDual
} from "../persistence/workspace-status-store.js";
import { buildDashboardDependencyOverview } from "./dashboard-dependency-overview.js";
import { TRANSCRIPT_CHURN_TASK_TYPE } from "../transcript-churn.js";
import {
  parseDashboardIncludeWishlist,
  parseDashboardWishlistPaging,
  buildDashboardOverview,
  buildDashboardPlanArtifactSummary
} from "./build-dashboard-base.js";
import type { DashboardSummaryTracer } from "./dashboard-summary-trace.js";
import { buildDashboardIdeasSummary } from "./build-dashboard-ideas-summary.js";

function getTerminalCount(
  status: "completed" | "cancelled",
  tasks: TaskEntity[],
  sqliteDual: SqliteDualPlanningStore | undefined
): number {
  if (sqliteDual && sqliteDual.relationalTasksEnabled) {
    try {
      const db = sqliteDual.getDatabase();
      const row = db
        .prepare(`SELECT COUNT(*) as count FROM ${TASK_ENGINE_TASKS_TABLE} WHERE status = ? AND archived = 0`)
        .get(status) as { count: number } | undefined;
      if (row && typeof row.count === "number") {
        return row.count;
      }
    } catch {
      // fallback
    }
  }
  return tasks.filter((t) => t.status === status).length;
}

/** 1. buildDashboardOverviewSlice: Minimal startup-safe data. */
export async function buildDashboardOverviewSlice(
  ctx: ModuleLifecycleContext,
  store: TaskStore,
  planningGeneration: number,
  sqliteDual: SqliteDualPlanningStore | undefined,
  commandArgs?: Record<string, unknown>,
  tracer?: DashboardSummaryTracer
): Promise<DashboardSummaryData> {
  // Directly delegate to existing buildDashboardOverview implementation which perfectly meets these rules
  return buildDashboardOverview(ctx, store, planningGeneration, sqliteDual, commandArgs, tracer);
}

/** 2. buildDashboardQueueSlice: Active queue rows/counts only, stubs slow status elements. */
export async function buildDashboardQueueSlice(
  ctx: ModuleLifecycleContext,
  store: TaskStore,
  planningGeneration: number,
  sqliteDual: SqliteDualPlanningStore | undefined,
  commandArgs?: Record<string, unknown>,
  tracer?: DashboardSummaryTracer
): Promise<DashboardSummaryData> {
  const includeWishlist = parseDashboardIncludeWishlist(
    commandArgs,
    ctx.effectiveConfig as Record<string, unknown> | undefined
  );

  const allTasks = tracer?.span("getActiveTasks", () => store.getActiveTasks()) ?? store.getActiveTasks();

  const { dualForStatus, workspaceStatus } =
    tracer?.span("readWorkspaceStatus", () => {
      const dual = sqliteDual ?? openSqliteDualForWorkspaceStatus(ctx);
      return {
        dualForStatus: dual,
        workspaceStatus: readWorkspaceStatusSnapshotFromDual(dual)
      };
    }) ?? (() => {
      const dual = sqliteDual ?? openSqliteDualForWorkspaceStatus(ctx);
      return {
        dualForStatus: dual,
        workspaceStatus: readWorkspaceStatusSnapshotFromDual(dual)
      };
    })();

  const currentPhase = workspaceStatus?.currentKitPhase != null ? String(workspaceStatus.currentKitPhase).trim() : "";
  const activeNonTerminal = allTasks.filter(t => t.status !== "completed" && t.status !== "cancelled");
  const neededCompletedIds = new Set<string>();
  for (const t of activeNonTerminal) {
    if (t.dependsOn) {
      for (const depId of t.dependsOn) {
        neededCompletedIds.add(depId);
      }
    }
  }

  const tasks = allTasks.filter(t => {
    if (t.status !== "completed" && t.status !== "cancelled") {
      return true;
    }
    const taskPhase = t.phaseKey != null ? String(t.phaseKey).trim() : "";
    if (currentPhase !== "" && taskPhase === currentPhase) {
      return true;
    }
    if (t.status === "completed" && neededCompletedIds.has(t.id)) {
      return true;
    }
    return false;
  });

  const suggestion = tracer?.span("getNextActions", () =>
    getNextActions(tasks, {
      workspacePhaseFocus: {
        currentKitPhase: workspaceStatus?.currentKitPhase ?? null,
        nextKitPhase: workspaceStatus?.nextKitPhase ?? null
      }
    })
  ) ?? getNextActions(tasks, {
    workspacePhaseFocus: {
      currentKitPhase: workspaceStatus?.currentKitPhase ?? null,
      nextKitPhase: workspaceStatus?.nextKitPhase ?? null
    }
  });

  const readyQueue = suggestion.readyQueue;
  const readyImprovementCount = readyQueue.filter(isImprovementLikeTask).length;
  const readyImprovements = readyQueue.filter(isImprovementLikeTask);
  const readyExecution = readyQueue.filter((t) => !isImprovementLikeTask(t));
  const enrich = sqliteDual ? buildFeatureEnrichmentBySlug(sqliteDual.getDatabase()) : new Map();
  const toReadyRow = (t: (typeof readyQueue)[0]) => projectDashboardTaskRow(t, enrich);

  const readyTop = readyQueue.slice(0, 15).map(toReadyRow);
  const readyImprovementsTop = readyImprovements.slice(0, 15).map(toReadyRow);
  const readyExecutionTop = readyExecution.slice(0, 15).map(toReadyRow);
  const readyQueueTop = readyTop;


  let wishlistOpenCount = 0;
  let wishlistItemsLength = 0;
  let wishlistSafePage = 0;
  let wishlistPageSize = 10;
  let wishlistTotalPages = 0;
  let wishlistOpenTop: DashboardSummaryData["wishlist"]["openTop"] = [];

  if (includeWishlist) {
    const allStoreTasks = store.getAllTasks();
    const wishlistItems = listWishlistIntakeTasksAsItems(allStoreTasks);
    const wishlistOpenItems = wishlistItems.filter((i) => i.status === "open");
    wishlistOpenCount = wishlistOpenItems.length;
    wishlistItemsLength = wishlistItems.length;
    const { page: wishlistPageReq, pageSize } = parseDashboardWishlistPaging(commandArgs);
    wishlistPageSize = pageSize;
    wishlistTotalPages = wishlistOpenCount === 0 ? 0 : Math.ceil(wishlistOpenCount / wishlistPageSize);
    wishlistSafePage = wishlistTotalPages === 0 ? 0 : Math.min(wishlistPageReq, wishlistTotalPages - 1);
    const wishlistSliceStart = wishlistSafePage * wishlistPageSize;
    wishlistOpenTop = wishlistOpenItems.slice(wishlistSliceStart, wishlistSliceStart + wishlistPageSize).map((i) => {
      const task = findWishlistIntakeTaskByLegacyOrTaskId(allStoreTasks, i.id);
      const taskId = task?.id ?? i.id;
      return {
        id: i.id,
        title: i.title,
        taskId
      };
    });
  }

  const ideas = buildDashboardIdeasSummary(ctx, sqliteDual, true);

  const slimListRow = (t: (typeof tasks)[0]) => projectDashboardTaskRow(t, enrich, { includePriority: false });
  const blockedTasks = tasks
    .filter((t) => t.status === "blocked" && !isWishlistIntakeTask(t))
    .sort((a, b) => a.id.localeCompare(b.id));
  const blockedTop = blockedTasks.slice(0, 15).map(slimListRow);

  const proposedImprovements = tasks
    .filter((t) => t.status === "proposed" && isImprovementLikeTask(t))
    .sort((a, b) => a.id.localeCompare(b.id));
  const proposedImprovementsTop = proposedImprovements.slice(0, 15).map(slimListRow);

  const proposedExecution = tasks
    .filter((t) => t.status === "proposed" && !isImprovementLikeTask(t) && !isWishlistIntakeTask(t))
    .sort((a, b) => a.id.localeCompare(b.id));
  const proposedExecutionTop = proposedExecution.slice(0, 15).map(slimListRow);

  const dashboardPhaseTop = 15;
  const toProposedRow = (t: (typeof tasks)[0]) => projectDashboardTaskRow(t, enrich, { includePriority: false });
  const readyImprovementsPhaseBuckets = buildDashboardPhaseBucketsForTasks(
    readyImprovements,
    workspaceStatus,
    toReadyRow,
    dashboardPhaseTop
  );
  const readyExecutionPhaseBuckets = buildDashboardPhaseBucketsForTasks(
    readyExecution,
    workspaceStatus,
    toReadyRow,
    dashboardPhaseTop
  );
  const proposedImprovementsPhaseBuckets = buildDashboardPhaseBucketsForTasks(
    proposedImprovements,
    workspaceStatus,
    toProposedRow,
    dashboardPhaseTop,
    { includeAllTaskIds: true }
  );
  const proposedExecutionPhaseBuckets = buildDashboardPhaseBucketsForTasks(
    proposedExecution,
    workspaceStatus,
    toProposedRow,
    dashboardPhaseTop,
    { includeAllTaskIds: true }
  );

  const transcriptChurnResearch = tasks
    .filter((t) => t.status === "research" && t.type === TRANSCRIPT_CHURN_TASK_TYPE)
    .sort((a, b) => a.id.localeCompare(b.id));
  const transcriptChurnResearchTop = transcriptChurnResearch.slice(0, 15).map(slimListRow);
  const transcriptChurnResearchPhaseBuckets = buildDashboardPhaseBucketsForTasks(
    transcriptChurnResearch,
    workspaceStatus,
    toProposedRow,
    dashboardPhaseTop
  );

  const blockedPhaseBuckets = buildDashboardPhaseBucketsForTasks(
    blockedTasks,
    workspaceStatus,
    slimListRow,
    dashboardPhaseTop,
    { includeAllTaskIds: true }
  );

  const completedCount = getTerminalCount("completed", allTasks, sqliteDual);
  const cancelledCount = getTerminalCount("cancelled", allTasks, sqliteDual);

  const dependencyOverview = buildDashboardDependencyOverview(tasks);

  const planningSession = toDashboardPlanningSession(
    await readBuildPlanSession(
      ctx.workspacePath,
      ctx.effectiveConfig as Record<string, unknown> | undefined
    )
  );
  const planArtifact = buildDashboardPlanArtifactSummary(ctx, allTasks);

  // Use fast/overview helpers as required: "Queue slice does not call full system status/task-state projection"
  const systemStatus = await buildDashboardSystemStatusOverview(ctx, store, dualForStatus);
  const taskStateProjection = await buildDashboardTaskStateProjectionOverview(
    ctx,
    sqliteDual?.getDatabase() ?? dualForStatus?.getDatabase()
  );

  const humanGatesSummary = buildDashboardHumanGatesSummary(
    tasks,
    workspaceStatus?.currentKitPhase != null ? String(workspaceStatus.currentKitPhase) : null,
    new Map()
  );
  const approvalQueue = buildDashboardApprovalQueueSummary(tasks);
  const taskMutationIntents = summarizePendingTaskMutationIntents(ctx.workspacePath, 15);

  const currentPhaseDelivery = buildDashboardCurrentPhaseDelivery({
    tasks,
    workspaceStatus: {
      currentKitPhase: workspaceStatus?.currentKitPhase ?? null,
      nextKitPhase: workspaceStatus?.nextKitPhase ?? null
    },
    db: dualForStatus?.getDatabase() ?? null,
    effectiveConfig: ctx.effectiveConfig as Record<string, unknown> | undefined
  });

  const phaseJournalStats = buildDashboardPhaseJournalStats({
    db: sqliteDual?.getDatabase() ?? null,
    currentKitPhase: workspaceStatus?.currentKitPhase != null ? String(workspaceStatus.currentKitPhase) : null,
    completedDeliveryTaskCount: currentPhaseDelivery.segments.completed
  });

  const phaseDeliveryFields = collectPhaseDeliveryDashboardFields(
    dualForStatus?.getDatabase() ?? null,
    tasks,
    ctx.effectiveConfig as Record<string, unknown> | undefined
  );

  const systemStatusPhaseCatalog = systemStatus.phase?.phaseCatalog?.phases ?? [];
  const pastPhaseNotes = buildDashboardPastPhaseNotes({
    db: sqliteDual?.getDatabase() ?? null,
    phaseCatalogPhases: systemStatusPhaseCatalog,
    currentKitPhase: workspaceStatus?.currentKitPhase != null ? String(workspaceStatus.currentKitPhase) : null
  });


  const suggestedNext = suggestion.suggestedNext
    ? {
        ...projectDashboardTaskRow(suggestion.suggestedNext, enrich),
        id: suggestion.suggestedNext.id,
        status: suggestion.suggestedNext.status,
        title: suggestion.suggestedNext.title,
        type: suggestion.suggestedNext.type
      }
    : null;

  return {
    schemaVersion: 7 as const,
    dashboardProjection: "queue",
    planningGeneration,
    planningGenerationPolicy: getPlanningGenerationPolicy({
      effectiveConfig: ctx.effectiveConfig as Record<string, unknown> | undefined
    }),
    taskStoreLastUpdated: store.getLastUpdated(),
    workspaceStatus,
    planningSession,
    planArtifact,
    stateSummary: suggestion.stateSummary,
    transcriptChurnResearchSummary: {
      schemaVersion: 1 as const,
      count: transcriptChurnResearch.length,
      top: transcriptChurnResearchTop,
      phaseBuckets: transcriptChurnResearchPhaseBuckets
    },
    proposedImprovementsSummary: {
      schemaVersion: 1 as const,
      count: proposedImprovements.length,
      top: proposedImprovementsTop,
      phaseBuckets: proposedImprovementsPhaseBuckets
    },
    proposedExecutionSummary: {
      schemaVersion: 1 as const,
      count: proposedExecution.length,
      top: proposedExecutionTop,
      phaseBuckets: proposedExecutionPhaseBuckets
    },
    readyImprovementsSummary: {
      schemaVersion: 1 as const,
      count: readyImprovements.length,
      top: readyImprovementsTop,
      phaseBuckets: readyImprovementsPhaseBuckets
    },
    readyExecutionSummary: {
      schemaVersion: 1 as const,
      count: readyExecution.length,
      top: readyExecutionTop,
      phaseBuckets: readyExecutionPhaseBuckets
    },
    readyQueueTop,
    readyQueueCount: readyQueue.length,
    readyQueueBreakdown: {
      schemaVersion: 1,
      improvement: readyImprovementCount,
      other: readyQueue.length - readyImprovementCount
    },
    executionPlanningScope: "tasks-only" as const,
    wishlist: {
      schemaVersion: 1,
      enabled: includeWishlist,
      openCount: wishlistOpenCount,
      totalCount: wishlistItemsLength,
      openPage: wishlistSafePage,
      openPageSize: wishlistPageSize,
      openTotalPages: wishlistTotalPages,
      openTop: wishlistOpenTop
    },
    ideas,
    blockedSummary: {
      count: blockedTasks.length,
      top: blockedTop,
      phaseBuckets: blockedPhaseBuckets
    },
    humanGatesSummary,
    approvalQueue,
    taskMutationIntents,
    phaseJournalStats,
    completedSummary: {
      schemaVersion: 1 as const,
      count: completedCount,
      top: [],
      phaseBuckets: [],
      lazy: true
    },
    cancelledSummary: {
      schemaVersion: 1 as const,
      count: cancelledCount,
      top: [],
      phaseBuckets: [],
      lazy: true
    },
    suggestedNext,
    dependencyOverview,
    blockingAnalysis: suggestion.blockingAnalysis,
    agentGuidance: null,
    teamExecution: {
      schemaVersion: 1,
      available: false,
      totalCount: 0,
      activeCount: 0,
      byStatus: { assigned: 0, submitted: 0, blocked: 0, reconciled: 0, cancelled: 0 },
      topActive: []
    },
    subagentRegistry: {
      schemaVersion: 1,
      available: false,
      definitionsCount: 0,
      retiredDefinitionsCount: 0,
      openSessionsCount: 0,
      topOpenSessions: []
    },
    agentRegistrySessions: {
      schemaVersion: 1,
      available: false,
      definitionsCount: 0,
      orchestrationReadyDefinitionsCount: 0,
      retiredDefinitionsCount: 0,
      openSessionsCount: 0,
      activeAssignmentsCount: 0,
      linkedOpenSessionsCount: 0,
      hostAvailability: { cursor: 0, vscode: 0, cli: 0, manual: 0, unknown: 0 },
      capabilityAvailability: { required: [], optional: [] },
      currentPointers: { assignment: 0, task: 0, activity: 0 },
      topOpenSessions: []
    },
    taskCheckpoints: {
      schemaVersion: 1,
      available: false,
      totalCount: 0,
      topRecent: []
    },
    systemStatus,
    taskStateProjection,
    agentStatus: {
      schemaVersion: 1,
      source: "derived",
      kind: "awaiting_instruction",
      label: "Awaiting Instruction",
      confidence: "low",
      updatedAt: dualForStatus?.getDatabase() ? new Date().toISOString() : "unknown",
      taskId: null,
      phaseKey: null
    },
    currentPhaseDelivery,
    ...phaseDeliveryFields,
    pastPhaseNotes
  };
}

/** 3. buildDashboardStatusSlice: Full status/drifts diagnostic slice, stubs queue rows. */
export async function buildDashboardStatusSlice(
  ctx: ModuleLifecycleContext,
  store: TaskStore,
  planningGeneration: number,
  sqliteDual: SqliteDualPlanningStore | undefined,
  commandArgs?: Record<string, unknown>,
  tracer?: DashboardSummaryTracer
): Promise<DashboardSummaryData> {
  const generatedAt = new Date().toISOString();
  const dualForStatus = sqliteDual ?? openSqliteDualForWorkspaceStatus(ctx);
  const db = dualForStatus.getDatabase();

  const systemStatus = await buildDashboardSystemStatus(ctx, store, dualForStatus);
  const taskStateProjection = await buildDashboardTaskStateProjectionSummary(ctx, db);
  const workspaceStatus = readWorkspaceStatusSnapshotFromDual(dualForStatus);

  const planningSession = toDashboardPlanningSession(
    await readBuildPlanSession(
      ctx.workspacePath,
      ctx.effectiveConfig as Record<string, unknown> | undefined
    )
  );
  const tasks = store.getActiveTasks();
  const planArtifact = buildDashboardPlanArtifactSummary(ctx, tasks);

  const effCfg =
    ctx.effectiveConfig && typeof ctx.effectiveConfig === "object" && !Array.isArray(ctx.effectiveConfig)
      ? (ctx.effectiveConfig as Record<string, unknown>)
      : {};

  const guidanceResolved = resolveAgentGuidanceFromEffectiveConfig(effCfg);
  const behaviorState = await loadBehaviorWorkspaceState(ctx);
  const behaviorStore = new BehaviorProfileStore(behaviorState);
  const { effective: behaviorEffective } = behaviorStore.resolveEffectiveWithProvenance();
  const agentPresentation = resolveAgentPresentationPolicy({
    effectiveConfig: effCfg,
    guidance: guidanceResolved,
    behaviorProfile: {
      id: behaviorEffective.id,
      label: behaviorEffective.label,
      dimensions: behaviorEffective.dimensions
    }
  });

  const agentGuidance = {
    schemaVersion: 1 as const,
    profileSetId: guidanceResolved.profileSetId,
    tier: guidanceResolved.tier,
    displayLabel: guidanceResolved.displayLabel,
    usingDefaultTier: guidanceResolved.usingDefaultTier,
    temperamentProfileId: behaviorEffective.id,
    temperamentLabel: dashboardOnboardingTemperamentLabel(behaviorEffective),
    agentPresentation
  };

  const phaseDeliveryFields = collectPhaseDeliveryDashboardFields(
    db,
    tasks,
    ctx.effectiveConfig as Record<string, unknown> | undefined
  );

  const teamExecution = db
    ? (summarizeTeamAssignmentsForDashboard(db, (id) => store.getTask(id)?.title ?? null) as DashboardTeamExecutionSummary)
    : {
        schemaVersion: 1 as const,
        available: false,
        totalCount: 0,
        activeCount: 0,
        byStatus: { assigned: 0, submitted: 0, blocked: 0, reconciled: 0, cancelled: 0 },
        topActive: []
      };

  const subagentRegistry = db
    ? (summarizeSubagentsForDashboard(db) as DashboardSubagentRegistrySummary)
    : {
        schemaVersion: 1 as const,
        available: false,
        definitionsCount: 0,
        retiredDefinitionsCount: 0,
        openSessionsCount: 0,
        topOpenSessions: []
      };


  const agentRegistrySessions = summarizeAgentRegistrySessions(db, dualForStatus.dbPath);
  const taskCheckpoints = summarizeCheckpointsForDashboard(db);

  const humanGatesSummary = buildDashboardHumanGatesSummary(
    tasks,
    workspaceStatus?.currentKitPhase != null ? String(workspaceStatus.currentKitPhase) : null,
    new Map()
  );
  const approvalQueue = buildDashboardApprovalQueueSummary(tasks);

  const suggestion = getNextActions(tasks, {
    workspacePhaseFocus: {
      currentKitPhase: workspaceStatus?.currentKitPhase ?? null,
      nextKitPhase: workspaceStatus?.nextKitPhase ?? null
    }
  });

  const derivedAgentStatus = buildDashboardAgentStatus({
    now: generatedAt,
    tasks,
    planningSession,
    suggestion,
    teamExecution,
    subagentRegistry,
    systemStatus
  });

  const liveActivity = db ? readCurrentAgentActivityLease(db, generatedAt) : null;
  const agentStatus = liveActivity
    ? agentActivityLeaseToDashboardStatus(liveActivity, generatedAt)
    : derivedAgentStatus;

  const completedCount = getTerminalCount("completed", tasks, sqliteDual);
  const cancelledCount = getTerminalCount("cancelled", tasks, sqliteDual);

  const emptyListSummary = () =>
    ({ schemaVersion: 1 as const, count: 0, top: [], phaseBuckets: [] });

  const includeWishlist = parseDashboardIncludeWishlist(
    commandArgs,
    ctx.effectiveConfig as Record<string, unknown> | undefined
  );

  return {
    schemaVersion: 7 as const,
    dashboardProjection: "status",
    planningGeneration,
    planningGenerationPolicy: getPlanningGenerationPolicy({
      effectiveConfig: ctx.effectiveConfig as Record<string, unknown> | undefined
    }),
    taskStoreLastUpdated: store.getLastUpdated(),
    workspaceStatus,
    planningSession,
    planArtifact,
    stateSummary: suggestion.stateSummary,
    transcriptChurnResearchSummary: emptyListSummary(),
    proposedImprovementsSummary: emptyListSummary(),
    proposedExecutionSummary: emptyListSummary(),
    readyImprovementsSummary: emptyListSummary(),
    readyExecutionSummary: emptyListSummary(),
    readyQueueTop: [],
    readyQueueCount: 0,
    readyQueueBreakdown: { schemaVersion: 1, improvement: 0, other: 0 },
    executionPlanningScope: "tasks-only" as const,
    wishlist: {
      schemaVersion: 1,
      enabled: includeWishlist,
      openCount: 0,
      totalCount: 0,
      openPage: 0,
      openPageSize: 10,
      openTotalPages: 0,
      openTop: []
    },
    ideas: {
      schemaVersion: 1,
      available: false,
      totalCount: 0,
      openCount: 0,
      planningCount: 0,
      plannedCount: 0,
      top: []
    },
    blockedSummary: { count: 0, top: [], phaseBuckets: [] },
    humanGatesSummary,
    approvalQueue,
    phaseJournalStats: {
      schemaVersion: 1,
      available: false,
      phases: [],
      currentPhase: {
        phaseKey: null,
        activeNoteCount: 0,
        completedDeliveryTaskCount: 0,
        silenceWarning: false
      }
    },
    completedSummary: {
      schemaVersion: 1 as const,
      count: completedCount,
      top: [],
      phaseBuckets: [],
      lazy: true
    },
    cancelledSummary: {
      schemaVersion: 1 as const,
      count: cancelledCount,
      top: [],
      phaseBuckets: [],
      lazy: true
    },
    suggestedNext: suggestion.suggestedNext
      ? {
          ...projectDashboardTaskRow(suggestion.suggestedNext, new Map()),
          id: suggestion.suggestedNext.id,
          status: suggestion.suggestedNext.status,
          title: suggestion.suggestedNext.title,
          type: suggestion.suggestedNext.type
        }
      : null,
    dependencyOverview: {
      schemaVersion: 1,
      activeTaskCount: 0,
      includedTaskCount: 0,
      edgeCount: 0,
      truncated: false,
      perfNote: "status projection",
      nodes: [],
      edges: [],
      mermaidFlowchart: "",
      criticalPathReady: []
    },
    blockingAnalysis: [],
    agentGuidance,
    teamExecution,
    subagentRegistry,
    agentRegistrySessions,
    taskCheckpoints,
    systemStatus,
    taskStateProjection,
    agentStatus,
    currentPhaseDelivery: {
      schemaVersion: 2,
      phaseKey: workspaceStatus?.currentKitPhase != null ? String(workspaceStatus.currentKitPhase) : null,
      closeoutPassed: false,
      released: false,
      remainingCount: 0,
      terminalCount: 0,
      checkedTaskCount: 0,
      queue: { ready: 0, proposed: 0, blocked: 0, inProgress: 0, research: 0 },
      segments: { completed: 0, cancelled: 0, inProgress: 0, ready: 0, proposed: 0, blocked: 0, research: 0 },
      progressPercent: 0,
      releaseReadyPercent: 0,
      deliveryEvidenceViolationCount: 0
    },
    ...phaseDeliveryFields,
    pastPhaseNotes: []
  };
}

/** 4. buildDashboardAgentActivitySlice: Lean activity-only slice for independent refresh. */
export async function buildDashboardAgentActivitySlice(
  ctx: ModuleLifecycleContext,
  store: TaskStore,
  planningGeneration: number,
  sqliteDual: SqliteDualPlanningStore | undefined,
  commandArgs?: Record<string, unknown>,
  tracer?: DashboardSummaryTracer
): Promise<DashboardSummaryData> {
  const generatedAt = new Date().toISOString();
  const db = sqliteDual?.getDatabase();
  const liveActivityLeases = db ? listCurrentAgentActivityLeases(db, generatedAt) : [];

  const teamExecution = db
    ? (summarizeTeamAssignmentsForDashboard(db, (id) => store.getTask(id)?.title ?? null) as DashboardTeamExecutionSummary)
    : {
        schemaVersion: 1 as const,
        available: false,
        totalCount: 0,
        activeCount: 0,
        byStatus: { assigned: 0, submitted: 0, blocked: 0, reconciled: 0, cancelled: 0 },
        topActive: []
      };

  const subagentRegistry = db
    ? (summarizeSubagentsForDashboard(db) as DashboardSubagentRegistrySummary)
    : {
        schemaVersion: 1 as const,
        available: false,
        definitionsCount: 0,
        retiredDefinitionsCount: 0,
        openSessionsCount: 0,
        topOpenSessions: []
      };


  const tasks = store.getActiveTasks();

  const suggestion = getNextActions(tasks, {
    workspacePhaseFocus: {
      currentKitPhase: null,
      nextKitPhase: null
    }
  });

  const systemStatusEmpty: DashboardSystemStatus = {
    schemaVersion: 2,
    generatedAt,
    phase: {
      schemaVersion: 1,
      ok: true,
      canonicalPhaseKey: null,
      source: null,
      currentKitPhase: null,
      nextKitPhase: null,
      configPhaseKey: null,
      workspaceStatusPhaseKey: null,
      configMatchesWorkspaceStatus: null,
      exportStale: null,
      exportReason: "deferred for agentActivity slice",
      driftMessages: [],
      remediationSuggestions: []
    },
    doctor: { schemaVersion: 1, ok: true, issueCount: 0, issues: [] },
    modules: { schemaVersion: 1, enabledModuleIds: [], disabledModuleIds: [] },
    caeLines: []
  };

  const derivedAgentStatus = buildDashboardAgentStatus({
    now: generatedAt,
    tasks,
    planningSession: null,
    suggestion,
    teamExecution,
    subagentRegistry,
    systemStatus: systemStatusEmpty
  });

  const agentRegistrySessions =
    db && sqliteDual
      ? summarizeAgentRegistrySessions(db, sqliteDual.dbPath)
      : summarizeAgentRegistrySessions(undefined, "");

  const agentActivitySummary = buildDashboardAgentActivitySummary({
    now: generatedAt,
    tasks,
    liveActivityLeases,
    derivedAgentStatus,
    teamExecution,
    subagentRegistry,
    agentRegistrySessions
  });

  return {
    schemaVersion: 7 as const,
    dashboardProjection: "agentActivity",
    planningGeneration,
    planningGenerationPolicy: getPlanningGenerationPolicy({
      effectiveConfig: ctx.effectiveConfig as Record<string, unknown> | undefined
    }),
    taskStoreLastUpdated: store.getLastUpdated(),
    agentActivitySummary
  } as DashboardSummaryData;
}

/** 5. buildDashboardAgentTypesSlice: Definitions & sessions context without queue/status checks. */
export async function buildDashboardAgentTypesSlice(
  ctx: ModuleLifecycleContext,
  store: TaskStore,
  planningGeneration: number,
  sqliteDual: SqliteDualPlanningStore | undefined,
  commandArgs?: Record<string, unknown>,
  tracer?: DashboardSummaryTracer
): Promise<DashboardSummaryData> {
  const db = sqliteDual?.getDatabase();
  const dbPath = sqliteDual?.dbPath ?? "";

  const subagentRegistry = db
    ? (summarizeSubagentsForDashboard(db) as DashboardSubagentRegistrySummary)
    : {
        schemaVersion: 1,
        available: false,
        definitionsCount: 0,
        retiredDefinitionsCount: 0,
        openSessionsCount: 0,
        topOpenSessions: []
      };

  const agentRegistrySessions = summarizeAgentRegistrySessions(db, dbPath);

  return {
    schemaVersion: 7 as const,
    dashboardProjection: "agentTypes",
    planningGeneration,
    planningGenerationPolicy: getPlanningGenerationPolicy({
      effectiveConfig: ctx.effectiveConfig as Record<string, unknown> | undefined
    }),
    taskStoreLastUpdated: store.getLastUpdated(),
    subagentRegistry,
    agentRegistrySessions
  } as DashboardSummaryData;
}

/** 6. buildDashboardTerminalTasksPage: Paginated completed/cancelled tasks, SQLite + memory. */
export function buildDashboardTerminalTasksPage(
  store: TaskStore,
  sqliteDual: SqliteDualPlanningStore | undefined,
  options: {
    status: "completed" | "cancelled";
    limit: number;
    cursor?: string;
    phaseKey?: string;
  }
): { tasks: any[]; count: number; nextCursor?: string } {
  const { status, limit, cursor, phaseKey } = options;
  let pageTasks: TaskEntity[] = [];
  let hasMore = false;

  if (sqliteDual && sqliteDual.relationalTasksEnabled) {
    try {
      const db = sqliteDual.getDatabase();
      let query = `SELECT * FROM ${TASK_ENGINE_TASKS_TABLE} WHERE status = ? AND archived = 0`;
      const params: any[] = [status];
      if (phaseKey && phaseKey !== "__no_phase__") {
        query += ` AND phase_key = ?`;
        params.push(phaseKey);
      } else if (phaseKey === "__no_phase__") {
        query += ` AND (phase_key IS NULL OR phase_key = '')`;
      }
      const cursorDecoded = cursor ? decodeListTasksCursor(cursor) : null;
      if (cursorDecoded) {
        query += ` AND (updated_at < ? OR (updated_at = ? AND CAST(SUBSTR(id, 2) AS INTEGER) > CAST(SUBSTR(?, 2) AS INTEGER)))`;
        params.push(cursorDecoded.u, cursorDecoded.u, cursorDecoded.i);
      }
      query += ` ORDER BY updated_at DESC, CAST(SUBSTR(id, 2) AS INTEGER) ASC LIMIT ?`;
      params.push(limit + 1);

      const rows = db.prepare(query).all(...params) as TaskEngineTaskRow[];
      const linkMap = loadTaskFeatureLinkMap(db);
      const mapped = rows.map((r) => rowToTaskEntity(r, { taskFeatureLinkMap: linkMap }));
      if (mapped.length > limit) {
        pageTasks = mapped.slice(0, limit);
        hasMore = true;
      } else {
        pageTasks = mapped;
      }
    } catch {
      // Fallback
    }
  }

  if (pageTasks.length === 0) {
    let filtered = store.getActiveTasks().filter((t) => t.status === status);
    if (phaseKey && phaseKey !== "__no_phase__") {
      filtered = filtered.filter((t) => inferTaskPhaseKey(t) === phaseKey);
    } else if (phaseKey === "__no_phase__") {
      filtered = filtered.filter((t) => inferTaskPhaseKey(t) === null);
    }
    filtered.sort(listTasksComparator);
    const cursorDecoded = cursor ? decodeListTasksCursor(cursor) : null;
    if (cursorDecoded) {
      filtered = filtered.filter((t) => listTaskIsAfterCursor(t, cursorDecoded));
    }
    if (filtered.length > limit) {
      pageTasks = filtered.slice(0, limit);
      hasMore = true;
    } else {
      pageTasks = filtered;
    }
  }

  const nextCursor = hasMore && pageTasks.length > 0 ? encodeListTasksCursor(pageTasks[pageTasks.length - 1]!) : undefined;
  const enrich = sqliteDual ? buildFeatureEnrichmentBySlug(sqliteDual.getDatabase()) : new Map();
  const projectedPage = pageTasks.map((task) => projectTaskReadEntity(task, enrich));

  return {
    tasks: projectedPage,
    count: projectedPage.length,
    ...(nextCursor !== undefined ? { nextCursor } : {})
  };
}
