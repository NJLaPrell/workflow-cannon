import type { ModuleCommandResult, ModuleLifecycleContext } from "../../../contracts/module-contract.js";
import type {
  DashboardSubagentRegistrySummary,
  DashboardSummaryData,
  DashboardTaskCheckpointsSummary,
  DashboardTeamExecutionSummary
} from "../../../contracts/dashboard-summary-run.js";
import { summarizeCheckpointsForDashboard } from "../../checkpoints/checkpoint-store.js";
import { summarizeSubagentsForDashboard } from "../../subagents/subagent-store.js";
import { summarizeTeamAssignmentsForDashboard } from "../../team-execution/assignment-store.js";
import { resolveAgentGuidanceFromEffectiveConfig } from "../../../core/agent-guidance-catalog.js";
import { resolveAgentPresentationPolicy } from "../../../core/agent-presentation-policy.js";
import { getPlanningGenerationPolicy } from "../planning-config.js";
import { getNextActions, isImprovementLikeTask } from "../suggestions.js";
import { TRANSCRIPT_CHURN_TASK_TYPE } from "../transcript-churn.js";
import {
  openSqliteDualForWorkspaceStatus,
  readWorkspaceStatusSnapshotFromDual
} from "../persistence/workspace-status-store.js";
import { buildDashboardDependencyOverview } from "../dashboard/dashboard-dependency-overview.js";
import {
  buildDashboardPhaseBucketsForBlocking,
  buildDashboardPhaseBucketsForTasks
} from "../dashboard/dashboard-phase-buckets.js";
import { readBuildPlanSession, toDashboardPlanningSession } from "../../../core/planning/build-plan-session-file.js";
import { dashboardOnboardingTemperamentLabel } from "../../agent-behavior/onboarding-temperament-label.js";
import { loadBehaviorWorkspaceState } from "../../agent-behavior/persistence.js";
import { BehaviorProfileStore } from "../../agent-behavior/store.js";
import {
  findWishlistIntakeTaskByLegacyOrTaskId,
  isWishlistIntakeTask,
  listWishlistIntakeTasksAsItems
} from "../wishlist/wishlist-intake.js";
import type { TaskStore } from "../persistence/store.js";
import type { SqliteDualPlanningStore } from "../persistence/sqlite-dual-planning.js";
import { buildFeatureEnrichmentBySlug } from "../persistence/feature-registry-queries.js";
import { buildDashboardSystemStatus } from "../dashboard/build-dashboard-system-status.js";
import { buildDashboardAgentStatus } from "../dashboard/dashboard-agent-status.js";
import {
  agentActivityLeaseToDashboardStatus,
  readCurrentAgentActivityLease
} from "../agent-activity-store.js";
import { projectDashboardTaskRow } from "../task-read-projections.js";
import { buildDashboardCurrentPhaseDelivery } from "../dashboard/phase-delivery-status.js";
import { buildDashboardPastPhaseNotes } from "../dashboard/build-dashboard-past-phase-notes.js";
import { buildDashboardApprovalQueueSummary } from "../dashboard/build-dashboard-approval-queue.js";
import { buildPhaseFocusDashboard } from "../dashboard/build-phase-focus-dashboard.js";
import type { OpenedPlanningStores } from "../persistence/planning-open.js";
import { buildDashboardHumanGatesSummary } from "../dashboard/build-dashboard-human-gates.js";
import { buildDashboardPhaseJournalStats } from "../dashboard/build-dashboard-phase-journal-stats.js";

/** Parse optional `dashboard-summary` argv for wishlist table paging (extension + CLI). */
export function parseDashboardWishlistPaging(args?: Record<string, unknown>): {
  page: number;
  pageSize: number;
} {
  const a = args ?? {};
  let page = 0;
  const rp = a.wishlistPage;
  if (typeof rp === "number" && Number.isInteger(rp) && rp >= 0) {
    page = rp;
  } else if (typeof rp === "string" && /^\d+$/.test(rp.trim())) {
    page = Number(rp.trim());
  }
  let pageSize = 10;
  const rs = a.wishlistPageSize;
  if (typeof rs === "number" && Number.isFinite(rs)) {
    pageSize = Math.min(100, Math.max(1, Math.floor(rs)));
  } else if (typeof rs === "string" && /^\d+$/.test(rs.trim())) {
    pageSize = Math.min(100, Math.max(1, Number(rs.trim())));
  }
  return { page, pageSize };
}

export async function runDashboardSummaryCommand(
  ctx: ModuleLifecycleContext,
  store: TaskStore,
  planningGeneration: number,
  sqliteDual?: SqliteDualPlanningStore,
  commandArgs?: Record<string, unknown>
): Promise<ModuleCommandResult> {
  const tasks = store.getActiveTasks();
  const dualForStatus = sqliteDual ?? openSqliteDualForWorkspaceStatus(ctx);
  const workspaceStatus = readWorkspaceStatusSnapshotFromDual(dualForStatus);
  const suggestion = getNextActions(tasks, {
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
  const blockedTop = suggestion.blockingAnalysis.slice(0, 15);

  const wishlistItems = listWishlistIntakeTasksAsItems(store.getAllTasks());
  const wishlistOpenItems = wishlistItems.filter((i) => i.status === "open");
  const wishlistOpenCount = wishlistOpenItems.length;
  const { page: wishlistPageReq, pageSize: wishlistPageSize } = parseDashboardWishlistPaging(commandArgs);
  const wishlistTotalPages =
    wishlistOpenCount === 0 ? 0 : Math.ceil(wishlistOpenCount / wishlistPageSize);
  const wishlistSafePage =
    wishlistTotalPages === 0 ? 0 : Math.min(wishlistPageReq, wishlistTotalPages - 1);
  const wishlistSliceStart = wishlistSafePage * wishlistPageSize;
  const wishlistOpenTop = wishlistOpenItems.slice(wishlistSliceStart, wishlistSliceStart + wishlistPageSize).map((i) => {
    const task = findWishlistIntakeTaskByLegacyOrTaskId(store.getAllTasks(), i.id);
    const taskId = task?.id ?? i.id;
    return {
      id: i.id,
      title: i.title,
      taskId
    };
  });

  const proposedImprovements = tasks
    .filter((t) => t.status === "proposed" && isImprovementLikeTask(t))
    .sort((a, b) => a.id.localeCompare(b.id));
  const slimListRow = (t: (typeof tasks)[0]) => projectDashboardTaskRow(t, enrich, { includePriority: false });
  const proposedImprovementsTop = proposedImprovements.slice(0, 15).map(slimListRow);

  const proposedExecution = tasks
    .filter((t) => t.status === "proposed" && !isImprovementLikeTask(t) && !isWishlistIntakeTask(t))
    .sort((a, b) => a.id.localeCompare(b.id));
  const proposedExecutionTop = proposedExecution.slice(0, 15).map(slimListRow);

  const planningSession = toDashboardPlanningSession(
    await readBuildPlanSession(
      ctx.workspacePath,
      ctx.effectiveConfig as Record<string, unknown> | undefined
    )
  );

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

  const blockedPhaseBuckets = buildDashboardPhaseBucketsForBlocking(
    suggestion.blockingAnalysis,
    (id) => tasks.find((x) => x.id === id),
    workspaceStatus,
    dashboardPhaseTop
  );

  const completedTasks = tasks
    .filter((t) => t.status === "completed")
    .sort((a, b) => a.id.localeCompare(b.id));
  const cancelledTasks = tasks
    .filter((t) => t.status === "cancelled")
    .sort((a, b) => a.id.localeCompare(b.id));
  const completedTop = completedTasks.slice(0, 15).map(toProposedRow);
  const cancelledTop = cancelledTasks.slice(0, 15).map(toProposedRow);
  /** Terminal buckets: counts/labels only — dashboard lazy-loads rows per phase on expand. */
  const completedPhaseBuckets = buildDashboardPhaseBucketsForTasks(
    completedTasks,
    workspaceStatus,
    toProposedRow,
    0
  );
  const cancelledPhaseBuckets = buildDashboardPhaseBucketsForTasks(
    cancelledTasks,
    workspaceStatus,
    toProposedRow,
    0
  );

  const dependencyOverview = buildDashboardDependencyOverview(tasks);

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

  const taskTitleById = new Map(tasks.map((t) => [t.id, t.title] as const));
  const teamExecutionEmpty: DashboardTeamExecutionSummary = {
    schemaVersion: 1,
    available: false,
    totalCount: 0,
    activeCount: 0,
    byStatus: { assigned: 0, submitted: 0, blocked: 0, reconciled: 0, cancelled: 0 },
    topActive: []
  };
  const teamExecution = sqliteDual
    ? summarizeTeamAssignmentsForDashboard(sqliteDual.getDatabase(), (id) => taskTitleById.get(id) ?? null)
    : teamExecutionEmpty;

  const subagentRegistryEmpty: DashboardSubagentRegistrySummary = {
    schemaVersion: 1,
    available: false,
    definitionsCount: 0,
    retiredDefinitionsCount: 0,
    openSessionsCount: 0,
    topOpenSessions: []
  };
  const subagentRegistry: DashboardSubagentRegistrySummary = sqliteDual
    ? (summarizeSubagentsForDashboard(sqliteDual.getDatabase()) as DashboardSubagentRegistrySummary)
    : subagentRegistryEmpty;

  const taskCheckpointsEmpty: DashboardTaskCheckpointsSummary = {
    schemaVersion: 1,
    available: false,
    totalCount: 0,
    topRecent: []
  };
  const taskCheckpoints: DashboardTaskCheckpointsSummary = sqliteDual
    ? (summarizeCheckpointsForDashboard(sqliteDual.getDatabase()) as DashboardTaskCheckpointsSummary)
    : taskCheckpointsEmpty;

  const systemStatus = await buildDashboardSystemStatus(ctx, store, dualForStatus);
  const derivedAgentStatus = buildDashboardAgentStatus({
    now: systemStatus.generatedAt,
    tasks,
    planningSession,
    suggestion,
    teamExecution,
    subagentRegistry,
    systemStatus
  });
  const liveActivity = sqliteDual
    ? readCurrentAgentActivityLease(sqliteDual.getDatabase(), systemStatus.generatedAt)
    : null;
  const agentStatus = liveActivity
    ? agentActivityLeaseToDashboardStatus(liveActivity)
    : derivedAgentStatus;

  const wsForDelivery =
    workspaceStatus && typeof workspaceStatus === "object"
      ? (workspaceStatus as { currentKitPhase?: string | null; nextKitPhase?: string | null })
      : null;
  const currentPhaseDelivery = buildDashboardCurrentPhaseDelivery({
    tasks,
    workspaceStatus: wsForDelivery,
    db: dualForStatus?.getDatabase() ?? null,
    effectiveConfig: ctx.effectiveConfig as Record<string, unknown> | undefined
  });

  const phaseCatalogPhases =
    systemStatus.phase?.phaseCatalog?.phases ?? [];
  const pastPhaseNotes = buildDashboardPastPhaseNotes({
    db: dualForStatus?.getDatabase() ?? null,
    phaseCatalogPhases,
    currentKitPhase: systemStatus.phase?.currentKitPhase ?? workspaceStatus?.currentKitPhase ?? null
  });

  const currentKitPhase =
    systemStatus.phase?.currentKitPhase ?? workspaceStatus?.currentKitPhase ?? null;
  const humanGatesSummary = buildDashboardHumanGatesSummary(
    tasks,
    typeof currentKitPhase === "string" ? currentKitPhase : null,
    enrich
  );
  const approvalQueue = buildDashboardApprovalQueueSummary(tasks);

  const phaseJournalStats = buildDashboardPhaseJournalStats({
    db: dualForStatus?.getDatabase() ?? null,
    currentKitPhase: typeof currentKitPhase === "string" ? currentKitPhase : null,
    completedDeliveryTaskCount: currentPhaseDelivery.segments.completed
  });

  const includePhaseFocus =
    commandArgs?.includePhaseFocus === true || commandArgs?.includePhaseFocus === "true";
  const phaseFocusPhaseKey =
    typeof commandArgs?.phaseKey === "string" && commandArgs.phaseKey.trim().length > 0
      ? commandArgs.phaseKey.trim()
      : undefined;

  const data = {
    schemaVersion: 7 as const,
    planningGeneration,
    planningGenerationPolicy: getPlanningGenerationPolicy({
      effectiveConfig: ctx.effectiveConfig as Record<string, unknown> | undefined
    }),
    taskStoreLastUpdated: store.getLastUpdated(),
    workspaceStatus,
    planningSession,
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
    readyQueueTop: readyTop,
    readyQueueCount: readyQueue.length,
    readyQueueBreakdown: {
      schemaVersion: 1 as const,
      improvement: readyImprovementCount,
      other: readyQueue.length - readyImprovementCount
    },
    executionPlanningScope: "tasks-only" as const,
    wishlist: {
      schemaVersion: 1 as const,
      openCount: wishlistOpenCount,
      totalCount: wishlistItems.length,
      openPage: wishlistSafePage,
      openPageSize: wishlistPageSize,
      openTotalPages: wishlistTotalPages,
      openTop: wishlistOpenTop
    },
    blockedSummary: {
      count: suggestion.blockingAnalysis.length,
      top: blockedTop,
      phaseBuckets: blockedPhaseBuckets
    },
    humanGatesSummary,
    approvalQueue,
    phaseJournalStats,
    completedSummary: {
      schemaVersion: 1 as const,
      count: completedTasks.length,
      top: completedTop,
      phaseBuckets: completedPhaseBuckets
    },
    cancelledSummary: {
      schemaVersion: 1 as const,
      count: cancelledTasks.length,
      top: cancelledTop,
      phaseBuckets: cancelledPhaseBuckets
    },
    suggestedNext: suggestion.suggestedNext
      ? {
          ...projectDashboardTaskRow(suggestion.suggestedNext, enrich),
          id: suggestion.suggestedNext.id,
          status: suggestion.suggestedNext.status,
          title: suggestion.suggestedNext.title,
          type: suggestion.suggestedNext.type
        }
      : null,
    dependencyOverview,
    blockingAnalysis: suggestion.blockingAnalysis,
    agentGuidance,
    teamExecution,
    subagentRegistry,
    taskCheckpoints,
    systemStatus,
    agentStatus,
    currentPhaseDelivery,
    pastPhaseNotes,
    ...(includePhaseFocus && sqliteDual
      ? {
          phaseFocus: buildPhaseFocusDashboard({
            ctx,
            planning: { taskStore: store, sqliteDual } satisfies OpenedPlanningStores,
            phaseKey: phaseFocusPhaseKey
          })
        }
      : {})
  } satisfies DashboardSummaryData;

  return {
    ok: true,
    code: "dashboard-summary",
    message: "Dashboard summary built from task store and maintainer status snapshot",
    data: data as Record<string, unknown>
  };
}
