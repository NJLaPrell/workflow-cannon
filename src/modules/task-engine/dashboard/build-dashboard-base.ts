import type { ModuleLifecycleContext } from "../../../contracts/module-contract.js";
import type {
  DashboardSubagentRegistrySummary,
  DashboardSummaryData,
  DashboardTaskCheckpointsSummary,
  DashboardTeamExecutionSummary
} from "../../../contracts/dashboard-summary-run.js";
import { listIdeas } from "../../ideas/idea-store.js";
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
import { buildDashboardDependencyOverview } from "./dashboard-dependency-overview.js";
import { buildDashboardPhaseBucketsForTasks } from "./dashboard-phase-buckets.js";
import { readBuildPlanSession, toDashboardPlanningSession } from "../../../core/planning/build-plan-session-file.js";
import { listPlanArtifactSummaries } from "../../../core/planning/plan-artifact-storage.js";
import { dashboardOnboardingTemperamentLabel } from "../../agent-behavior/onboarding-temperament-label.js";
import { loadBehaviorWorkspaceState } from "../../agent-behavior/persistence.js";
import { BehaviorProfileStore } from "../../agent-behavior/store.js";
import { listPlanningChatSessions } from "../../ideas/planning-chat-session.js";
import {
  findWishlistIntakeTaskByLegacyOrTaskId,
  isWishlistIntakeTask,
  listWishlistIntakeTasksAsItems
} from "../wishlist/wishlist-intake.js";
import type { TaskStore } from "../persistence/store.js";
import type { SqliteDualPlanningStore } from "../persistence/sqlite-dual-planning.js";
import { buildFeatureEnrichmentBySlug } from "../persistence/feature-registry-queries.js";
import { buildDashboardSystemStatus } from "./build-dashboard-system-status.js";
import { buildDashboardAgentStatus } from "./dashboard-agent-status.js";
import {
  agentActivityLeaseToDashboardStatus,
  readCurrentAgentActivityLease
} from "../agent-activity-store.js";
import { projectDashboardTaskRow } from "../task-read-projections.js";
import {
  buildDashboardCurrentPhaseDelivery,
  collectDeliveredPhaseKeys,
  collectPhaseKeysWithActiveQueueWork,
  collectRolledOutPhaseKeys,
  collectPhaseReleaseDatesByKey
} from "./phase-delivery-status.js";
import { resolveLegacyDeliveredMaxOrdinal } from "../phase-resolution.js";
import { buildDashboardPastPhaseNotes } from "./build-dashboard-past-phase-notes.js";
import { buildDashboardApprovalQueueSummary } from "./build-dashboard-approval-queue.js";
import { buildPhaseFocusDashboard } from "./build-phase-focus-dashboard.js";
import type { OpenedPlanningStores } from "../persistence/planning-open.js";
import { buildDashboardHumanGatesSummary } from "./build-dashboard-human-gates.js";
import { buildDashboardPhaseJournalStats } from "./build-dashboard-phase-journal-stats.js";
import {
  dashboardSummaryNeedsPastPhaseNotes,
  dashboardSummaryNeedsPhaseJournalStats,
  dashboardSummaryNeedsQueueRollups,
  dashboardSummaryNeedsStatusRollups,
  parseDashboardSummaryProjection,
  type DashboardSummaryProjection
} from "./dashboard-summary-projection.js";
import { buildDashboardTaskStateProjectionSummary } from "./build-dashboard-task-state-projection.js";

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

function buildDashboardPlanArtifactSummary(ctx: ModuleLifecycleContext): DashboardSummaryData["planArtifact"] {
  const summaries = listPlanArtifactSummaries(
    ctx.workspacePath,
    ctx.effectiveConfig as Record<string, unknown> | undefined
  );
  if (summaries.length === 0) {
    return null;
  }
  const rows = summaries.slice(0, 5).map((summary) => ({
    planId: summary.planId,
    planRef: summary.planRef,
    version: summary.currentVersion,
    status: summary.status,
    title: summary.title,
    planningType: summary.planningType,
    updatedAt: summary.updatedAt,
    wbsRowCount: summary.wbsRowCount,
    openQuestionCount: summary.openQuestionCount
  }));
  return {
    schemaVersion: 1,
    count: summaries.length,
    current: rows[0]!,
    recent: rows
  };
}

function buildDashboardIdeasSummary(
  sqliteDual: SqliteDualPlanningStore | undefined,
  needsQueueRollups: boolean
): DashboardSummaryData["ideas"] {
  if (!needsQueueRollups || !sqliteDual) {
    return {
      schemaVersion: 1,
      available: false,
      totalCount: 0,
      openCount: 0,
      planningCount: 0,
      plannedCount: 0,
      top: []
    };
  }
  try {
    const ideas = listIdeas(sqliteDual.getDatabase());
    const sessions = new Map(listPlanningChatSessions(sqliteDual.getDatabase()).map((session) => [session.ideaId, session]));
    return {
      schemaVersion: 1,
      available: true,
      totalCount: ideas.length,
      openCount: ideas.filter((idea) => idea.status === "open").length,
      planningCount: ideas.filter((idea) => idea.status === "planning").length,
      plannedCount: ideas.filter((idea) => idea.status === "planned").length,
      top: ideas.slice(0, 15).map((idea) => {
        const session = sessions.get(idea.id);
        if (!session) {
          return idea;
        }
        return {
          ...idea,
          planningChatSession: {
            schemaVersion: 1,
            ideaId: session.ideaId,
            status: session.status,
            updatedAt: session.updatedAt,
            ...(session.resumePrompt ? { resumePrompt: session.resumePrompt } : {})
          }
        };
      })
    };
  } catch {
    return {
      schemaVersion: 1,
      available: false,
      totalCount: 0,
      openCount: 0,
      planningCount: 0,
      plannedCount: 0,
      top: []
    };
  }
}

const emptyDependencyOverviewStub = (activeTaskCount: number): DashboardSummaryData["dependencyOverview"] => ({
  schemaVersion: 1 as const,
  activeTaskCount,
  includedTaskCount: 0,
  edgeCount: 0,
  truncated: false,
  perfNote: "overview projection",
  nodes: [],
  edges: [],
  mermaidFlowchart: "",
  criticalPathReady: []
});

export type DashboardBuildBase = {
  projection: DashboardSummaryProjection;
  needsQueueRollups: boolean;
  needsStatusRollups: boolean;
  planningGeneration: number;
  commandArgs?: Record<string, unknown>;
  data: DashboardSummaryData;
};

/** Shared dashboard build with projection-aware guards before assembly. */
export async function buildDashboardBase(
  ctx: ModuleLifecycleContext,
  store: TaskStore,
  planningGeneration: number,
  sqliteDual: SqliteDualPlanningStore | undefined,
  commandArgs?: Record<string, unknown>
): Promise<DashboardBuildBase> {
  const projection = parseDashboardSummaryProjection(commandArgs);
  const needsQueueRollups = dashboardSummaryNeedsQueueRollups(projection);
  const needsStatusRollups = dashboardSummaryNeedsStatusRollups(projection);
  const skipPlanningSessionRead = projection === "overview";
  const skipAgentGuidanceBuild = projection === "queue";

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
  const readyTop = needsQueueRollups ? readyQueue.slice(0, 15).map(toReadyRow) : [];
  const readyImprovementsTop = needsQueueRollups ? readyImprovements.slice(0, 15).map(toReadyRow) : [];
  const readyExecutionTop = needsQueueRollups ? readyExecution.slice(0, 15).map(toReadyRow) : [];

  let wishlistOpenCount = 0;
  let wishlistItemsLength = 0;
  let wishlistSafePage = 0;
  let wishlistPageSize = 10;
  let wishlistTotalPages = 0;
  let wishlistOpenTop: DashboardSummaryData["wishlist"]["openTop"] = [];

  if (needsQueueRollups) {
    const wishlistItems = listWishlistIntakeTasksAsItems(store.getAllTasks());
    const wishlistOpenItems = wishlistItems.filter((i) => i.status === "open");
    wishlistOpenCount = wishlistOpenItems.length;
    wishlistItemsLength = wishlistItems.length;
    const { page: wishlistPageReq, pageSize } = parseDashboardWishlistPaging(commandArgs);
    wishlistPageSize = pageSize;
    wishlistTotalPages = wishlistOpenCount === 0 ? 0 : Math.ceil(wishlistOpenCount / wishlistPageSize);
    wishlistSafePage = wishlistTotalPages === 0 ? 0 : Math.min(wishlistPageReq, wishlistTotalPages - 1);
    const wishlistSliceStart = wishlistSafePage * wishlistPageSize;
    wishlistOpenTop = wishlistOpenItems.slice(wishlistSliceStart, wishlistSliceStart + wishlistPageSize).map((i) => {
      const task = findWishlistIntakeTaskByLegacyOrTaskId(store.getAllTasks(), i.id);
      const taskId = task?.id ?? i.id;
      return {
        id: i.id,
        title: i.title,
        taskId
      };
    });
  }

  const ideas = buildDashboardIdeasSummary(sqliteDual, needsQueueRollups);

  const slimListRow = (t: (typeof tasks)[0]) => projectDashboardTaskRow(t, enrich, { includePriority: false });
  const blockedTasks = needsQueueRollups
    ? tasks
        .filter((t) => t.status === "blocked" && !isWishlistIntakeTask(t))
        .sort((a, b) => a.id.localeCompare(b.id))
    : [];
  const blockedTop = needsQueueRollups ? blockedTasks.slice(0, 15).map(slimListRow) : [];
  const proposedImprovements = needsQueueRollups
    ? tasks
        .filter((t) => t.status === "proposed" && isImprovementLikeTask(t))
        .sort((a, b) => a.id.localeCompare(b.id))
    : [];
  const proposedImprovementsTop = needsQueueRollups ? proposedImprovements.slice(0, 15).map(slimListRow) : [];

  const proposedExecution = needsQueueRollups
    ? tasks
        .filter((t) => t.status === "proposed" && !isImprovementLikeTask(t) && !isWishlistIntakeTask(t))
        .sort((a, b) => a.id.localeCompare(b.id))
    : [];
  const proposedExecutionTop = needsQueueRollups ? proposedExecution.slice(0, 15).map(slimListRow) : [];

  const planningSession = skipPlanningSessionRead
    ? null
    : toDashboardPlanningSession(
        await readBuildPlanSession(
          ctx.workspacePath,
          ctx.effectiveConfig as Record<string, unknown> | undefined
        )
      );
  const planArtifact = buildDashboardPlanArtifactSummary(ctx);

  const dashboardPhaseTop = 15;
  const toProposedRow = (t: (typeof tasks)[0]) => projectDashboardTaskRow(t, enrich, { includePriority: false });
  const readyImprovementsPhaseBuckets = needsQueueRollups
    ? buildDashboardPhaseBucketsForTasks(
        readyImprovements,
        workspaceStatus,
        toReadyRow,
        dashboardPhaseTop
      )
    : [];
  const readyExecutionPhaseBuckets = needsQueueRollups
    ? buildDashboardPhaseBucketsForTasks(
        readyExecution,
        workspaceStatus,
        toReadyRow,
        dashboardPhaseTop
      )
    : [];
  const proposedImprovementsPhaseBuckets = needsQueueRollups
    ? buildDashboardPhaseBucketsForTasks(
        proposedImprovements,
        workspaceStatus,
        toProposedRow,
        dashboardPhaseTop,
        { includeAllTaskIds: true }
      )
    : [];
  const proposedExecutionPhaseBuckets = needsQueueRollups
    ? buildDashboardPhaseBucketsForTasks(
        proposedExecution,
        workspaceStatus,
        toProposedRow,
        dashboardPhaseTop,
        { includeAllTaskIds: true }
      )
    : [];

  const transcriptChurnResearch = needsQueueRollups
    ? tasks
        .filter((t) => t.status === "research" && t.type === TRANSCRIPT_CHURN_TASK_TYPE)
        .sort((a, b) => a.id.localeCompare(b.id))
    : [];
  const transcriptChurnResearchTop = needsQueueRollups ? transcriptChurnResearch.slice(0, 15).map(slimListRow) : [];
  const transcriptChurnResearchPhaseBuckets = needsQueueRollups
    ? buildDashboardPhaseBucketsForTasks(
        transcriptChurnResearch,
        workspaceStatus,
        toProposedRow,
        dashboardPhaseTop
      )
    : [];

  const blockedPhaseBuckets = needsQueueRollups
    ? buildDashboardPhaseBucketsForTasks(
        blockedTasks,
        workspaceStatus,
        slimListRow,
        dashboardPhaseTop,
        { includeAllTaskIds: true }
      )
    : [];

  const completedTasks = needsQueueRollups
    ? tasks.filter((t) => t.status === "completed").sort((a, b) => a.id.localeCompare(b.id))
    : [];
  const cancelledTasks = needsQueueRollups
    ? tasks.filter((t) => t.status === "cancelled").sort((a, b) => a.id.localeCompare(b.id))
    : [];
  const completedTop = needsQueueRollups ? completedTasks.slice(0, 15).map(toProposedRow) : [];
  const cancelledTop = needsQueueRollups ? cancelledTasks.slice(0, 15).map(toProposedRow) : [];
  const completedPhaseBuckets = needsQueueRollups
    ? buildDashboardPhaseBucketsForTasks(completedTasks, workspaceStatus, toProposedRow, 0)
    : [];
  const cancelledPhaseBuckets = needsQueueRollups
    ? buildDashboardPhaseBucketsForTasks(cancelledTasks, workspaceStatus, toProposedRow, 0)
    : [];

  const dependencyOverview = needsQueueRollups
    ? buildDashboardDependencyOverview(tasks)
    : emptyDependencyOverviewStub(tasks.length);

  const effCfg =
    ctx.effectiveConfig && typeof ctx.effectiveConfig === "object" && !Array.isArray(ctx.effectiveConfig)
      ? (ctx.effectiveConfig as Record<string, unknown>)
      : {};

  let agentGuidance: DashboardSummaryData["agentGuidance"] = null;
  if (!skipAgentGuidanceBuild) {
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
    agentGuidance = {
      schemaVersion: 1 as const,
      profileSetId: guidanceResolved.profileSetId,
      tier: guidanceResolved.tier,
      displayLabel: guidanceResolved.displayLabel,
      usingDefaultTier: guidanceResolved.usingDefaultTier,
      temperamentProfileId: behaviorEffective.id,
      temperamentLabel: dashboardOnboardingTemperamentLabel(behaviorEffective),
      agentPresentation
    };
  }

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
  const taskStateProjection = await buildDashboardTaskStateProjectionSummary(
    ctx,
    sqliteDual?.getDatabase() ?? dualForStatus?.getDatabase()
  );
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
  const deliveredPhaseKeys =
    dualForStatus != null
      ? collectDeliveredPhaseKeys(dualForStatus.getDatabase(), tasks)
      : [];
  const rolledOutPhaseKeys =
    dualForStatus != null ? collectRolledOutPhaseKeys(dualForStatus.getDatabase()) : [];
  const phaseReleaseDates =
    dualForStatus != null ? collectPhaseReleaseDatesByKey(dualForStatus.getDatabase()) : {};
  const legacyDeliveredMaxOrdinal = resolveLegacyDeliveredMaxOrdinal(
    ctx.effectiveConfig as Record<string, unknown> | undefined
  );
  const phaseKeysWithActiveQueueWork = collectPhaseKeysWithActiveQueueWork(tasks);

  const phaseCatalogPhases =
    systemStatus.phase?.phaseCatalog?.phases ?? [];
  const pastPhaseNotes = dashboardSummaryNeedsPastPhaseNotes(projection)
    ? buildDashboardPastPhaseNotes({
        db: dualForStatus?.getDatabase() ?? null,
        phaseCatalogPhases,
        currentKitPhase: systemStatus.phase?.currentKitPhase ?? workspaceStatus?.currentKitPhase ?? null
      })
    : [];

  const currentKitPhase =
    systemStatus.phase?.currentKitPhase ?? workspaceStatus?.currentKitPhase ?? null;
  const humanGatesSummary = buildDashboardHumanGatesSummary(
    tasks,
    typeof currentKitPhase === "string" ? currentKitPhase : null,
    enrich
  );
  const approvalQueue = buildDashboardApprovalQueueSummary(tasks);

  const phaseJournalStats = dashboardSummaryNeedsPhaseJournalStats(projection)
    ? buildDashboardPhaseJournalStats({
        db: dualForStatus?.getDatabase() ?? null,
        currentKitPhase: typeof currentKitPhase === "string" ? currentKitPhase : null,
        completedDeliveryTaskCount: currentPhaseDelivery.segments.completed
      })
    : {
        schemaVersion: 1 as const,
        available: false,
        phases: [],
        currentPhase: {
          phaseKey: null,
          activeNoteCount: 0,
          completedDeliveryTaskCount: currentPhaseDelivery.segments.completed,
          silenceWarning: false
        }
      };

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
    taskStateProjection,
    agentStatus,
    currentPhaseDelivery,
    deliveredPhaseKeys,
    rolledOutPhaseKeys,
    phaseReleaseDates,
    legacyDeliveredMaxOrdinal,
    phaseKeysWithActiveQueueWork,
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
    projection,
    needsQueueRollups,
    needsStatusRollups,
    planningGeneration,
    commandArgs,
    data
  };
}

export function buildDashboardFullProjection(base: DashboardBuildBase): DashboardSummaryData {
  return base.data;
}

export function buildDashboardOverviewProjection(base: DashboardBuildBase): DashboardSummaryData {
  return base.data;
}

export function buildDashboardQueueProjection(base: DashboardBuildBase): DashboardSummaryData {
  return base.data;
}

export function buildDashboardStatusProjection(base: DashboardBuildBase): DashboardSummaryData {
  return base.data;
}
