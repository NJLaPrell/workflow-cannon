import type { ModuleCommandResult, ModuleLifecycleContext } from "../../../contracts/module-contract.js";
import type { DashboardSummaryData } from "../../../contracts/dashboard-summary-run.js";
import { resolveAgentGuidanceFromEffectiveConfig } from "../../../core/agent-guidance-catalog.js";
import { getPlanningGenerationPolicy } from "../planning-config.js";
import { getNextActions, isImprovementLikeTask } from "../suggestions.js";
import { readWorkspaceStatusSnapshot } from "./dashboard-status.js";
import { buildDashboardDependencyOverview } from "./dashboard-dependency-overview.js";
import {
  buildDashboardPhaseBucketsForBlocking,
  buildDashboardPhaseBucketsForTasks
} from "./dashboard-phase-buckets.js";
import { readBuildPlanSession, toDashboardPlanningSession } from "../../../core/planning/build-plan-session-file.js";
import { isWishlistIntakeTask, listWishlistIntakeTasksAsItems } from "../wishlist/wishlist-intake.js";
import type { TaskStore } from "../persistence/store.js";

export async function runDashboardSummaryCommand(
  ctx: ModuleLifecycleContext,
  store: TaskStore,
  planningGeneration: number
): Promise<ModuleCommandResult> {
  const tasks = store.getActiveTasks();
  const suggestion = getNextActions(tasks);
  const workspaceStatus = await readWorkspaceStatusSnapshot(ctx.workspacePath);
  const readyQueue = suggestion.readyQueue;
  const readyImprovementCount = readyQueue.filter(isImprovementLikeTask).length;
  const readyImprovements = readyQueue.filter(isImprovementLikeTask);
  const readyExecution = readyQueue.filter((t) => !isImprovementLikeTask(t));
  const toReadyRow = (t: (typeof readyQueue)[0]) => ({
    id: t.id,
    title: t.title,
    priority: t.priority ?? null,
    phase: t.phase ?? null,
    features: t.features?.length ? t.features : null
  });
  const readyTop = readyQueue.slice(0, 15).map(toReadyRow);
  const readyImprovementsTop = readyImprovements.slice(0, 15).map(toReadyRow);
  const readyExecutionTop = readyExecution.slice(0, 15).map(toReadyRow);
  const blockedTop = suggestion.blockingAnalysis.slice(0, 15);

  const wishlistItems = listWishlistIntakeTasksAsItems(store.getAllTasks());
  const wishlistOpenItems = wishlistItems.filter((i) => i.status === "open");
  const wishlistOpenCount = wishlistOpenItems.length;
  const wishlistOpenTop = wishlistOpenItems.slice(0, 15).map((i) => ({
    id: i.id,
    title: i.title
  }));

  const proposedImprovements = tasks
    .filter((t) => t.status === "proposed" && isImprovementLikeTask(t))
    .sort((a, b) => a.id.localeCompare(b.id));
  const slimListRow = (t: (typeof tasks)[0]) => ({
    id: t.id,
    title: t.title,
    phase: t.phase ?? null,
    features: t.features?.length ? t.features : null
  });
  const proposedImprovementsTop = proposedImprovements.slice(0, 15).map(slimListRow);

  const proposedExecution = tasks
    .filter((t) => t.status === "proposed" && !isImprovementLikeTask(t) && !isWishlistIntakeTask(t))
    .sort((a, b) => a.id.localeCompare(b.id));
  const proposedExecutionTop = proposedExecution.slice(0, 15).map(slimListRow);

  const planningSession = toDashboardPlanningSession(await readBuildPlanSession(ctx.workspacePath));

  const dashboardPhaseTop = 15;
  const toProposedRow = (t: (typeof tasks)[0]) => ({
    id: t.id,
    title: t.title,
    phase: t.phase ?? null,
    features: t.features?.length ? t.features : null
  });
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
    dashboardPhaseTop
  );
  const proposedExecutionPhaseBuckets = buildDashboardPhaseBucketsForTasks(
    proposedExecution,
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
  const completedPhaseBuckets = buildDashboardPhaseBucketsForTasks(
    completedTasks,
    workspaceStatus,
    toProposedRow,
    dashboardPhaseTop
  );
  const cancelledPhaseBuckets = buildDashboardPhaseBucketsForTasks(
    cancelledTasks,
    workspaceStatus,
    toProposedRow,
    dashboardPhaseTop
  );

  const dependencyOverview = buildDashboardDependencyOverview(tasks);

  const effCfg =
    ctx.effectiveConfig && typeof ctx.effectiveConfig === "object" && !Array.isArray(ctx.effectiveConfig)
      ? (ctx.effectiveConfig as Record<string, unknown>)
      : {};
  const guidanceResolved = resolveAgentGuidanceFromEffectiveConfig(effCfg);
  const agentGuidance = {
    schemaVersion: 1 as const,
    profileSetId: guidanceResolved.profileSetId,
    tier: guidanceResolved.tier,
    displayLabel: guidanceResolved.displayLabel,
    usingDefaultTier: guidanceResolved.usingDefaultTier
  };

  const data = {
    schemaVersion: 1 as const,
    planningGeneration,
    planningGenerationPolicy: getPlanningGenerationPolicy({
      effectiveConfig: ctx.effectiveConfig as Record<string, unknown> | undefined
    }),
    taskStoreLastUpdated: store.getLastUpdated(),
    workspaceStatus,
    planningSession,
    stateSummary: suggestion.stateSummary,
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
      openTop: wishlistOpenTop
    },
    blockedSummary: {
      count: suggestion.blockingAnalysis.length,
      top: blockedTop,
      phaseBuckets: blockedPhaseBuckets
    },
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
          id: suggestion.suggestedNext.id,
          title: suggestion.suggestedNext.title,
          status: suggestion.suggestedNext.status,
          priority: suggestion.suggestedNext.priority ?? null,
          phase: suggestion.suggestedNext.phase ?? null,
          features: suggestion.suggestedNext.features?.length ? suggestion.suggestedNext.features : null
        }
      : null,
    dependencyOverview,
    blockingAnalysis: suggestion.blockingAnalysis,
    agentGuidance
  } satisfies DashboardSummaryData;

  return {
    ok: true,
    code: "dashboard-summary",
    message: "Dashboard summary built from task store and maintainer status snapshot",
    data: data as Record<string, unknown>
  };
}
