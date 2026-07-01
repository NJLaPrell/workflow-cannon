import type { ModuleLifecycleContext } from "../../../contracts/module-contract.js";
import type {
  DashboardPlanArtifactWbsRow,
  DashboardSubagentRegistrySummary,
  DashboardSummaryData,
  DashboardPhaseKickoffSummary,
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
import { buildDashboardDependencyOverview } from "./dashboard-dependency-overview.js";
import { buildDashboardPhaseBucketsForTasks } from "./dashboard-phase-buckets.js";
import { readBuildPlanSession, toDashboardPlanningSession } from "../../../core/planning/build-plan-session-file.js";
import { listPlanArtifactSummaries, readLatestPlanArtifact } from "../../../core/planning/plan-artifact-storage.js";
import type { PlanArtifactWbsItem } from "../../../core/planning/plan-artifact-v1.js";
import { dashboardOnboardingTemperamentLabel } from "../../agent-behavior/onboarding-temperament-label.js";
import { loadBehaviorWorkspaceState } from "../../agent-behavior/persistence.js";
import { BehaviorProfileStore } from "../../agent-behavior/store.js";
import {
  findWishlistIntakeTaskByLegacyOrTaskId,
  isWishlistIntakeTask,
  listWishlistIntakeTasksAsItems
} from "../wishlist-intake.js";
import type { TaskStore } from "../persistence/store.js";
import type { TaskEntity } from "../types.js";
import type { SqliteDualPlanningStore } from "../persistence/sqlite-dual-planning.js";
import { buildFeatureEnrichmentBySlug } from "../persistence/feature-registry-queries.js";
import { buildDashboardSystemStatus, buildDashboardSystemStatusOverview } from "./build-dashboard-system-status.js";
import { buildDashboardAgentStatus } from "./dashboard-agent-status.js";
import {
  agentActivityLeaseToDashboardStatus,
  readCurrentAgentActivityLease,
  listCurrentAgentActivityLeases
} from "../agent-activity-store.js";
import { projectDashboardTaskRow } from "../task-read-projections.js";
import {
  buildDashboardCurrentPhaseDelivery,
  collectDeliveredPhaseKeys,
  collectPhaseDeliveryHistoryRows,
  collectPhaseKeysWithActiveQueueWork,
  collectRolledOutPhaseKeys,
  collectPhaseReleaseDatesByKey
} from "./phase-delivery-status.js";
import { resolveLegacyDeliveredMaxOrdinal, parseKitPhaseNumberFromYaml } from "../phase-resolution.js";
import { buildDashboardPastPhaseNotes } from "./build-dashboard-past-phase-notes.js";
import { buildDashboardApprovalQueueSummary } from "./build-dashboard-approval-queue.js";
import { buildPhaseFocusDashboard } from "./build-phase-focus-dashboard.js";
import { buildDashboardPhaseKickoffSlice } from "../phase-kickoff-policy.js";
import type { OpenedPlanningStores } from "../persistence/planning-open.js";
import { buildDashboardHumanGatesSummary } from "./build-dashboard-human-gates.js";
import { buildDashboardPhaseJournalStats } from "./build-dashboard-phase-journal-stats.js";
import {
  dashboardSummaryNeedsPastPhaseNotes,
  dashboardSummaryNeedsAgentActivityRollups,
  dashboardSummaryNeedsPhaseJournalStats,
  dashboardSummaryNeedsQueueRollups,
  dashboardSummaryNeedsStatusRollups,
  parseDashboardSummaryProjection,
  type DashboardSummaryProjection
} from "./dashboard-summary-projection.js";
import {
  buildDashboardTaskStateProjectionSummary,
  buildDashboardTaskStateProjectionOverview
} from "./build-dashboard-task-state-projection.js";
import { buildDashboardAgentActivitySummary } from "./build-dashboard-agent-activity-summary.js";
import { summarizeAgentRegistrySessions } from "../agent-registry-session-summary.js";
import type { DashboardSummaryTracer } from "./dashboard-summary-trace.js";
import { TASK_ENGINE_TASKS_TABLE } from "../../../core/state/kit-sqlite/planning-sqlite-kernel.js";
import { buildDashboardIdeasSummary } from "./build-dashboard-ideas-summary.js";

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

export function parseDashboardIncludeWishlist(
  args?: Record<string, unknown>,
  effectiveConfig?: Record<string, unknown>
): boolean {
  if (args?.includeWishlist === true || args?.includeWishlist === "true") {
    return true;
  }
  const tasksConfig = effectiveConfig?.tasks;
  return (
    !!tasksConfig &&
    typeof tasksConfig === "object" &&
    !Array.isArray(tasksConfig) &&
    ((tasksConfig as Record<string, unknown>).includeWishlist === true ||
      (tasksConfig as Record<string, unknown>).includeWishlist === "true")
  );
}

/** Tasks minted from a plan's WBS carry `metadata.planRef` back to the originating PlanArtifact (see normalize-wbs-to-task-draft.ts). */
function buildPlanRefToTasksIndex(allTasks: readonly TaskEntity[]): Map<string, TaskEntity[]> {
  const index = new Map<string, TaskEntity[]>();
  for (const task of allTasks) {
    const planRef = typeof task.metadata?.planRef === "string" ? task.metadata.planRef.trim() : "";
    if (!planRef) {
      continue;
    }
    const list = index.get(planRef);
    if (list) {
      list.push(task);
    } else {
      index.set(planRef, [task]);
    }
  }
  return index;
}

const PLAN_ARTIFACT_WBS_DESCRIPTION_MAX_LENGTH = 140;

function humanizeWbsSizingConfidence(value: unknown): string {
  const raw = typeof value === "string" ? value.trim().toLowerCase() : "";
  switch (raw) {
    case "high":
      return "High";
    case "medium":
      return "Medium";
    case "low":
      return "Low";
    default:
      return raw.length > 0 ? raw.charAt(0).toUpperCase() + raw.slice(1) : "—";
  }
}

function truncatePlanArtifactWbsText(text: string, maxLength: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= maxLength) {
    return trimmed;
  }
  return trimmed.slice(0, maxLength - 3).trimEnd() + "...";
}

function buildDashboardPlanArtifactWbsRows(wbs: readonly PlanArtifactWbsItem[]): DashboardPlanArtifactWbsRow[] {
  if (wbs.length === 0) {
    return [];
  }
  const titleById = new Map<string, string>();
  for (const row of wbs) {
    const wbsId = row.wbsId.trim();
    if (wbsId.length === 0) {
      continue;
    }
    const title = row.title.trim() || row.suggestedTaskTitle.trim() || wbsId;
    titleById.set(wbsId, title);
  }
  const blocksById = new Map<string, string[]>();
  for (const row of wbs) {
    const wbsId = row.wbsId.trim();
    for (const dependency of row.dependsOn ?? []) {
      const depId = typeof dependency === "string" ? dependency.trim() : "";
      if (depId.length === 0) {
        continue;
      }
      const list = blocksById.get(depId) ?? [];
      list.push(wbsId.length > 0 ? wbsId : "row");
      blocksById.set(depId, list);
    }
  }
  const formatLinkedTitles = (ids: string[]): string => {
    const labels = ids
      .map((id) => titleById.get(id) ?? id)
      .filter((label) => label.length > 0);
    return labels.length > 0 ? labels.join(", ") : "—";
  };
  return wbs.map((row) => {
    const wbsId = row.wbsId.trim();
    const title = row.title.trim() || row.suggestedTaskTitle.trim() || wbsId || "Work item";
    const descriptionRaw = row.approach.trim() || row.doneMeans.trim() || row.suggestedTaskTitle.trim();
    const description = truncatePlanArtifactWbsText(descriptionRaw, PLAN_ARTIFACT_WBS_DESCRIPTION_MAX_LENGTH);
    const dependsOnIds = (row.dependsOn ?? [])
      .map((value) => (typeof value === "string" ? value.trim() : ""))
      .filter((value) => value.length > 0);
    return {
      wbsId: wbsId || title,
      title,
      description: description.length > 0 ? description : "—",
      dependsOn: dependsOnIds.length > 0 ? formatLinkedTitles(dependsOnIds) : "—",
      blocks: formatLinkedTitles(blocksById.get(wbsId) ?? []),
      size: humanizeWbsSizingConfidence(row.sizingConfidence)
    };
  });
}

export function buildDashboardPlanArtifactSummary(
  ctx: ModuleLifecycleContext,
  allTasks: readonly TaskEntity[]
): DashboardSummaryData["planArtifact"] {
  const summaries = listPlanArtifactSummaries(
    ctx.workspacePath,
    ctx.effectiveConfig as Record<string, unknown> | undefined
  );
  if (summaries.length === 0) {
    return null;
  }
  const planRefToTasks = buildPlanRefToTasksIndex(allTasks);
  const PLAN_ARTIFACT_SUMMARY_TEXT_MAX_LENGTH = 160;
  const rows = summaries.slice(0, 20).map((summary) => {
    const latestArtifact = readLatestPlanArtifact(ctx.workspacePath, summary.planId);
    const latestReview =
      summary.latestReview &&
      summary.latestReview.planRef === summary.planRef &&
      summary.latestReview.reviewedVersion === summary.currentVersion
        ? summary.latestReview
        : undefined;
    const phaseRecommendations = Array.isArray(latestArtifact?.phaseRecommendations)
      ? latestArtifact.phaseRecommendations
      : [];
    const primaryPhase = phaseRecommendations.find((row) => row?.isPrimary === true) ?? phaseRecommendations[0];
    const phaseRecommendation = primaryPhase
      ? [primaryPhase.label?.trim(), primaryPhase.phaseKey?.trim()].filter((value) => !!value).join(" · ")
      : "";
    const phaseKey = typeof primaryPhase?.phaseKey === "string" ? primaryPhase.phaseKey.trim() : "";
    const sourceIdeaId =
      typeof latestArtifact?.provenance?.sourceIdeaId === "string" ? latestArtifact.provenance.sourceIdeaId.trim() : "";
    const summaryTextRaw =
      typeof latestArtifact?.identity?.summary === "string" ? latestArtifact.identity.summary.trim() : "";
    const summaryText =
      summaryTextRaw.length > PLAN_ARTIFACT_SUMMARY_TEXT_MAX_LENGTH
        ? summaryTextRaw.slice(0, PLAN_ARTIFACT_SUMMARY_TEXT_MAX_LENGTH - 3).trimEnd() + "..."
        : summaryTextRaw;
    const riskCount = Array.isArray(latestArtifact?.riskAssessment) ? latestArtifact.riskAssessment.length : 0;
    const wbsPreviewRows = Array.isArray(latestArtifact?.wbs)
      ? buildDashboardPlanArtifactWbsRows(latestArtifact.wbs)
      : [];
    const linkedTasks = planRefToTasks.get(summary.planRef) ?? [];
    const tasksGenerated = linkedTasks.length > 0;
    // Cancelled tasks don't block "executed"; only count them if that's all there is (avoids reporting
    // "executed" for a plan whose entire WBS was cancelled rather than delivered).
    const nonCancelledTasks = linkedTasks.filter((task) => task.status !== "cancelled");
    const deliveryConsideredTasks = nonCancelledTasks.length > 0 ? nonCancelledTasks : linkedTasks;
    const executed =
      tasksGenerated &&
      deliveryConsideredTasks.length > 0 &&
      deliveryConsideredTasks.every((task) => task.status === "completed");
    const blockerCount = latestReview?.blockerCount ?? 0;
    const warningCount = latestReview?.warningCount ?? 0;
    const lifecycleStatus =
      summary.status === "reviewed"
        ? blockerCount > 0 || latestReview?.passed === false
          ? "needs_revision"
          : "approval_ready"
        : summary.status;
    return {
      planId: summary.planId,
      planRef: summary.planRef,
      version: summary.currentVersion,
      status: summary.status,
      lifecycleStatus,
      title: summary.title,
      planningType: summary.planningType,
      updatedAt: summary.updatedAt,
      wbsRowCount: summary.wbsRowCount,
      openQuestionCount: summary.openQuestionCount,
      blockerCount,
      warningCount,
      ...(summaryText.length > 0 ? { summary: summaryText } : {}),
      ...(riskCount > 0 ? { riskCount } : {}),
      ...(latestReview?.profile ? { profile: latestReview.profile } : {}),
      ...(latestReview?.reviewSummary ? { reviewSummary: latestReview.reviewSummary } : {}),
      ...(phaseRecommendation.length > 0 ? { phaseRecommendation } : {}),
      ...(phaseKey.length > 0 ? { phaseKey } : {}),
      ...(sourceIdeaId.length > 0 ? { sourceIdeaId } : {}),
      tasksGenerated,
      executed,
      ...(wbsPreviewRows.length > 0 ? { wbsRows: wbsPreviewRows } : {})
    };
  });
  return {
    schemaVersion: 1,
    count: summaries.length,
    current: rows[0]!,
    recent: rows
  };
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
  commandArgs?: Record<string, unknown>,
  tracer?: DashboardSummaryTracer
): Promise<DashboardBuildBase> {
  const projection = parseDashboardSummaryProjection(commandArgs);
  if (tracer) {
    tracer.projection = projection;
  }
  const needsQueueRollups = dashboardSummaryNeedsQueueRollups(projection);
  const needsStatusRollups = dashboardSummaryNeedsStatusRollups(projection);
  const needsAgentActivityRollups = dashboardSummaryNeedsAgentActivityRollups(projection);
  const includeWishlist = parseDashboardIncludeWishlist(
    commandArgs,
    ctx.effectiveConfig as Record<string, unknown> | undefined
  );
  const skipPlanningSessionRead = projection === "overview" || projection === "agentActivity";
  const skipAgentGuidanceBuild = projection === "queue" || projection === "agentActivity";

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
    // 1. Active non-terminal tasks
    if (t.status !== "completed" && t.status !== "cancelled") {
      return true;
    }
    // 2. Terminal tasks in the current phase
    const taskPhase = t.phaseKey != null ? String(t.phaseKey).trim() : "";
    if (currentPhase !== "" && taskPhase === currentPhase) {
      return true;
    }
    // 3. Completed tasks that are dependencies of active non-terminal tasks
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
  const enrich = tracer?.span("buildFeatureEnrichmentBySlug", () =>
    sqliteDual ? buildFeatureEnrichmentBySlug(sqliteDual.getDatabase()) : new Map()
  ) ?? (sqliteDual ? buildFeatureEnrichmentBySlug(sqliteDual.getDatabase()) : new Map());
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
  let ideas = buildDashboardIdeasSummary(ctx, undefined, false);

  const buildWishlistAndIdeas = () => {
    if (needsQueueRollups && includeWishlist) {
      const allTasks = store.getAllTasks();
      const wishlistItems = listWishlistIntakeTasksAsItems(allTasks);
      const wishlistOpenItems = wishlistItems.filter((i) => i.status === "open");
      wishlistOpenCount = wishlistOpenItems.length;
      wishlistItemsLength = wishlistItems.length;
      const { page: wishlistPageReq, pageSize } = parseDashboardWishlistPaging(commandArgs);
      wishlistPageSize = pageSize;
      wishlistTotalPages = wishlistOpenCount === 0 ? 0 : Math.ceil(wishlistOpenCount / wishlistPageSize);
      wishlistSafePage = wishlistTotalPages === 0 ? 0 : Math.min(wishlistPageReq, wishlistTotalPages - 1);
      const wishlistSliceStart = wishlistSafePage * wishlistPageSize;
      wishlistOpenTop = wishlistOpenItems.slice(wishlistSliceStart, wishlistSliceStart + wishlistPageSize).map((i) => {
        const task = findWishlistIntakeTaskByLegacyOrTaskId(allTasks, i.id);
        const taskId = task?.id ?? i.id;
        return {
          id: i.id,
          title: i.title,
          taskId
        };
      });
    }
    ideas = buildDashboardIdeasSummary(ctx, sqliteDual, needsQueueRollups);
  };
  if (tracer) {
    tracer.span("wishlist/ideas", buildWishlistAndIdeas);
  } else {
    buildWishlistAndIdeas();
  }

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

  const planningSession = await (tracer?.spanAsync("planningSession", async () =>
    skipPlanningSessionRead
      ? null
      : toDashboardPlanningSession(
          await readBuildPlanSession(
            ctx.workspacePath,
            ctx.effectiveConfig as Record<string, unknown> | undefined
          )
        )
  ) ?? (skipPlanningSessionRead
    ? Promise.resolve(null)
    : readBuildPlanSession(
        ctx.workspacePath,
        ctx.effectiveConfig as Record<string, unknown> | undefined
      ).then(toDashboardPlanningSession)));
  const planArtifact =
    tracer?.span("planArtifact", () => buildDashboardPlanArtifactSummary(ctx, allTasks)) ??
    buildDashboardPlanArtifactSummary(ctx, allTasks);

  const dashboardPhaseTop = 15;
  const toProposedRow = (t: (typeof tasks)[0]) => projectDashboardTaskRow(t, enrich, { includePriority: false });
  const {
    readyImprovementsPhaseBuckets,
    readyExecutionPhaseBuckets,
    proposedImprovementsPhaseBuckets,
    proposedExecutionPhaseBuckets
  } = tracer?.span("phaseBuckets", () => ({
    readyImprovementsPhaseBuckets: needsQueueRollups
      ? buildDashboardPhaseBucketsForTasks(
          readyImprovements,
          workspaceStatus,
          toReadyRow,
          dashboardPhaseTop
        )
      : [],
    readyExecutionPhaseBuckets: needsQueueRollups
      ? buildDashboardPhaseBucketsForTasks(
          readyExecution,
          workspaceStatus,
          toReadyRow,
          dashboardPhaseTop
        )
      : [],
    proposedImprovementsPhaseBuckets: needsQueueRollups
      ? buildDashboardPhaseBucketsForTasks(
          proposedImprovements,
          workspaceStatus,
          toProposedRow,
          dashboardPhaseTop,
          { includeAllTaskIds: true }
        )
      : [],
    proposedExecutionPhaseBuckets: needsQueueRollups
      ? buildDashboardPhaseBucketsForTasks(
          proposedExecution,
          workspaceStatus,
          toProposedRow,
          dashboardPhaseTop,
          { includeAllTaskIds: true }
        )
      : []
  })) ?? {
    readyImprovementsPhaseBuckets: needsQueueRollups
      ? buildDashboardPhaseBucketsForTasks(
          readyImprovements,
          workspaceStatus,
          toReadyRow,
          dashboardPhaseTop
        )
      : [],
    readyExecutionPhaseBuckets: needsQueueRollups
      ? buildDashboardPhaseBucketsForTasks(
          readyExecution,
          workspaceStatus,
          toReadyRow,
          dashboardPhaseTop
        )
      : [],
    proposedImprovementsPhaseBuckets: needsQueueRollups
      ? buildDashboardPhaseBucketsForTasks(
          proposedImprovements,
          workspaceStatus,
          toProposedRow,
          dashboardPhaseTop,
          { includeAllTaskIds: true }
        )
      : [],
    proposedExecutionPhaseBuckets: needsQueueRollups
      ? buildDashboardPhaseBucketsForTasks(
          proposedExecution,
          workspaceStatus,
          toProposedRow,
          dashboardPhaseTop,
          { includeAllTaskIds: true }
        )
      : []
  };

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

  const completedCount = getTerminalCount("completed", allTasks, sqliteDual);
  const cancelledCount = getTerminalCount("cancelled", allTasks, sqliteDual);

  const dependencyOverview = tracer?.span("dependencyOverview", () =>
    needsQueueRollups
      ? buildDashboardDependencyOverview(tasks)
      : emptyDependencyOverviewStub(tasks.length)
  ) ?? (needsQueueRollups
    ? buildDashboardDependencyOverview(tasks)
    : emptyDependencyOverviewStub(tasks.length));

  const effCfg =
    ctx.effectiveConfig && typeof ctx.effectiveConfig === "object" && !Array.isArray(ctx.effectiveConfig)
      ? (ctx.effectiveConfig as Record<string, unknown>)
      : {};

  let agentGuidance: DashboardSummaryData["agentGuidance"] = null;
  await (tracer?.spanAsync("agentGuidance/behavior", async () => {
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
  }) ?? (async () => {
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
  })());

  const taskTitleById = new Map(tasks.map((t) => [t.id, t.title] as const));
  const teamExecutionEmpty: DashboardTeamExecutionSummary = {
    schemaVersion: 1,
    available: false,
    totalCount: 0,
    activeCount: 0,
    byStatus: { assigned: 0, submitted: 0, blocked: 0, reconciled: 0, cancelled: 0 },
    topActive: []
  };
  const teamExecution = tracer?.span("teamExecution", () =>
    sqliteDual
      ? summarizeTeamAssignmentsForDashboard(sqliteDual.getDatabase(), (id) => taskTitleById.get(id) ?? null)
      : teamExecutionEmpty
  ) ?? (sqliteDual
    ? summarizeTeamAssignmentsForDashboard(sqliteDual.getDatabase(), (id) => taskTitleById.get(id) ?? null)
    : teamExecutionEmpty);

  const subagentRegistryEmpty: DashboardSubagentRegistrySummary = {
    schemaVersion: 1,
    available: false,
    definitionsCount: 0,
    retiredDefinitionsCount: 0,
    openSessionsCount: 0,
    topOpenSessions: []
  };
  const subagentRegistry: DashboardSubagentRegistrySummary = tracer?.span("subagentRegistry", () =>
    sqliteDual
      ? (summarizeSubagentsForDashboard(sqliteDual.getDatabase()) as DashboardSubagentRegistrySummary)
      : subagentRegistryEmpty
  ) ?? (sqliteDual
    ? (summarizeSubagentsForDashboard(sqliteDual.getDatabase()) as DashboardSubagentRegistrySummary)
    : subagentRegistryEmpty);
  const agentRegistrySessions = tracer?.span("agentRegistrySessions", () =>
    sqliteDual
      ? summarizeAgentRegistrySessions(sqliteDual.getDatabase(), sqliteDual.dbPath)
      : summarizeAgentRegistrySessions(undefined, "")
  ) ?? (sqliteDual
    ? summarizeAgentRegistrySessions(sqliteDual.getDatabase(), sqliteDual.dbPath)
    : summarizeAgentRegistrySessions(undefined, ""));

  const taskCheckpointsEmpty: DashboardTaskCheckpointsSummary = {
    schemaVersion: 1,
    available: false,
    totalCount: 0,
    topRecent: []
  };
  const taskCheckpoints: DashboardTaskCheckpointsSummary = tracer?.span("checkpoints", () =>
    sqliteDual
      ? (summarizeCheckpointsForDashboard(sqliteDual.getDatabase()) as DashboardTaskCheckpointsSummary)
      : taskCheckpointsEmpty
  ) ?? (sqliteDual
    ? (summarizeCheckpointsForDashboard(sqliteDual.getDatabase()) as DashboardTaskCheckpointsSummary)
    : taskCheckpointsEmpty);

  const useLightweightStatus =
    projection === "overview" || projection === "queue" || projection === "agentActivity";
  const systemStatus = await (tracer?.spanAsync("systemStatus", () => {
    if (useLightweightStatus) {
      return buildDashboardSystemStatusOverview(ctx, store, dualForStatus);
    }
    return buildDashboardSystemStatus(ctx, store, dualForStatus);
  }) ?? (useLightweightStatus
    ? buildDashboardSystemStatusOverview(ctx, store, dualForStatus)
    : buildDashboardSystemStatus(ctx, store, dualForStatus)));
  const taskStateProjection = await (tracer?.spanAsync("taskStateProjection", () => {
    if (useLightweightStatus) {
      return buildDashboardTaskStateProjectionOverview(
        ctx,
        sqliteDual?.getDatabase() ?? dualForStatus?.getDatabase()
      );
    }
    return buildDashboardTaskStateProjectionSummary(
      ctx,
      sqliteDual?.getDatabase() ?? dualForStatus?.getDatabase()
    );
  }) ?? (useLightweightStatus
    ? buildDashboardTaskStateProjectionOverview(
        ctx,
        sqliteDual?.getDatabase() ?? dualForStatus?.getDatabase()
      )
    : buildDashboardTaskStateProjectionSummary(
        ctx,
        sqliteDual?.getDatabase() ?? dualForStatus?.getDatabase()
      )));
  const { agentStatus, agentActivitySummary } = tracer?.span("agentStatus", () => {
    const derived = buildDashboardAgentStatus({
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
    const liveLeases = sqliteDual
      ? listCurrentAgentActivityLeases(sqliteDual.getDatabase(), systemStatus.generatedAt)
      : [];
    const status = liveActivity
      ? agentActivityLeaseToDashboardStatus(liveActivity, systemStatus.generatedAt)
      : derived;
    const activitySummary = needsAgentActivityRollups
      ? buildDashboardAgentActivitySummary({
          now: systemStatus.generatedAt,
          tasks,
          liveActivityLeases: liveLeases,
          derivedAgentStatus: derived,
          teamExecution,
          subagentRegistry,
          agentRegistrySessions
        })
      : null;
    return {
      derivedAgentStatus: derived,
      liveActivityLeases: liveLeases,
      agentStatus: status,
      agentActivitySummary: activitySummary
    };
  }) ?? (() => {
    const derived = buildDashboardAgentStatus({
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
    const liveLeases = sqliteDual
      ? listCurrentAgentActivityLeases(sqliteDual.getDatabase(), systemStatus.generatedAt)
      : [];
    const status = liveActivity
      ? agentActivityLeaseToDashboardStatus(liveActivity, systemStatus.generatedAt)
      : derived;
    const activitySummary = needsAgentActivityRollups
      ? buildDashboardAgentActivitySummary({
          now: systemStatus.generatedAt,
          tasks,
          liveActivityLeases: liveLeases,
          derivedAgentStatus: derived,
          teamExecution,
          subagentRegistry,
          agentRegistrySessions
        })
      : null;
    return {
      derivedAgentStatus: derived,
      liveActivityLeases: liveLeases,
      agentStatus: status,
      agentActivitySummary: activitySummary
    };
  })();

  const wsForDelivery =
    workspaceStatus && typeof workspaceStatus === "object"
      ? (workspaceStatus as { currentKitPhase?: string | null; nextKitPhase?: string | null })
      : null;
  const currentPhaseDelivery = tracer?.span("currentPhaseDelivery", () =>
    buildDashboardCurrentPhaseDelivery({
      tasks,
      workspaceStatus: wsForDelivery,
      db: dualForStatus?.getDatabase() ?? null,
      effectiveConfig: ctx.effectiveConfig as Record<string, unknown> | undefined
    })
  ) ?? buildDashboardCurrentPhaseDelivery({
    tasks,
    workspaceStatus: wsForDelivery,
    db: dualForStatus?.getDatabase() ?? null,
    effectiveConfig: ctx.effectiveConfig as Record<string, unknown> | undefined
  });
  const { deliveredPhaseKeys, rolledOutPhaseKeys, phaseReleaseDates, phaseDeliveryHistory } =
    tracer?.span("phaseDeliveryHistory", () => ({
      deliveredPhaseKeys:
        dualForStatus != null
          ? collectDeliveredPhaseKeys(dualForStatus.getDatabase(), tasks)
          : [],
      rolledOutPhaseKeys:
        dualForStatus != null ? collectRolledOutPhaseKeys(dualForStatus.getDatabase()) : [],
      phaseReleaseDates:
        dualForStatus != null ? collectPhaseReleaseDatesByKey(dualForStatus.getDatabase()) : {},
      phaseDeliveryHistory:
        dualForStatus != null ? collectPhaseDeliveryHistoryRows(dualForStatus.getDatabase()) : []
    })) ?? {
      deliveredPhaseKeys:
        dualForStatus != null
          ? collectDeliveredPhaseKeys(dualForStatus.getDatabase(), tasks)
          : [],
      rolledOutPhaseKeys:
        dualForStatus != null ? collectRolledOutPhaseKeys(dualForStatus.getDatabase()) : [],
      phaseReleaseDates:
        dualForStatus != null ? collectPhaseReleaseDatesByKey(dualForStatus.getDatabase()) : {},
      phaseDeliveryHistory:
        dualForStatus != null ? collectPhaseDeliveryHistoryRows(dualForStatus.getDatabase()) : []
    };
  const lastDeliveredPhase = phaseDeliveryHistory.find((row) => row.status === "delivered") ?? null;
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
  const humanGatesSummary = tracer?.span("humanGates", () =>
    buildDashboardHumanGatesSummary(
      tasks,
      typeof currentKitPhase === "string" ? currentKitPhase : null,
      enrich
    )
  ) ?? buildDashboardHumanGatesSummary(
    tasks,
    typeof currentKitPhase === "string" ? currentKitPhase : null,
    enrich
  );
  const approvalQueue =
    tracer?.span("approvalQueue", () => buildDashboardApprovalQueueSummary(tasks))
    ?? buildDashboardApprovalQueueSummary(tasks);

  const phaseJournalStats = tracer?.span("phaseJournalStats", () =>
    dashboardSummaryNeedsPhaseJournalStats(projection)
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
        }
  ) ?? (dashboardSummaryNeedsPhaseJournalStats(projection)
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
      });

  const includePhaseFocus =
    commandArgs?.includePhaseFocus === true || commandArgs?.includePhaseFocus === "true";
  const phaseFocusPhaseKey =
    typeof commandArgs?.phaseKey === "string" && commandArgs.phaseKey.trim().length > 0
      ? commandArgs.phaseKey.trim()
      : undefined;
  const includePhaseKickoff =
    commandArgs?.includePhaseKickoff === true || commandArgs?.includePhaseKickoff === "true";
  const phaseKickoffPhaseKey =
    typeof commandArgs?.phaseKey === "string" && commandArgs.phaseKey.trim().length > 0
      ? commandArgs.phaseKey.trim()
      : parseKitPhaseNumberFromYaml(workspaceStatus?.currentKitPhase ?? null);

  let phaseKickoff: DashboardPhaseKickoffSummary | null = null;
  if (includePhaseKickoff && sqliteDual && phaseKickoffPhaseKey) {
    phaseKickoff = await buildDashboardPhaseKickoffSlice(
      ctx,
      { taskStore: store, sqliteDual } satisfies OpenedPlanningStores,
      phaseKickoffPhaseKey,
      { includeValidationPlans: commandArgs?.includeKickoffValidationPlans === true }
    );
  }

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
    agentRegistrySessions,
    taskCheckpoints,
    systemStatus,
    taskStateProjection,
    agentStatus,
    ...(agentActivitySummary ? { agentActivitySummary } : {}),
    currentPhaseDelivery,
    deliveredPhaseKeys,
    rolledOutPhaseKeys,
    phaseReleaseDates,
    phaseDeliveryHistory,
    lastDeliveredPhase,
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
      : {}),
    ...(phaseKickoff ? { phaseKickoff } : {})
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

/** Dedicated lightweight builder for the overview dashboard startup projection. */
export async function buildDashboardOverview(
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
  const tasks = tracer?.span("getActiveTasks", () => store.getActiveTasks()) ?? store.getActiveTasks();
  const dualForStatus = sqliteDual ?? openSqliteDualForWorkspaceStatus(ctx);
  const workspaceStatus = readWorkspaceStatusSnapshotFromDual(dualForStatus);

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

  const systemStatus = await (tracer?.spanAsync("systemStatus", () =>
    buildDashboardSystemStatusOverview(ctx, store, dualForStatus)
  ) ?? buildDashboardSystemStatusOverview(ctx, store, dualForStatus));

  const taskStateProjection = await (tracer?.spanAsync("taskStateProjection", () =>
    buildDashboardTaskStateProjectionOverview(
      ctx,
      sqliteDual?.getDatabase() ?? dualForStatus?.getDatabase()
    )
  ) ?? buildDashboardTaskStateProjectionOverview(
    ctx,
    sqliteDual?.getDatabase() ?? dualForStatus?.getDatabase()
  ));

  const liveActivity = sqliteDual
    ? readCurrentAgentActivityLease(sqliteDual.getDatabase(), systemStatus.generatedAt)
    : null;
  const liveLeases = sqliteDual
    ? listCurrentAgentActivityLeases(sqliteDual.getDatabase(), systemStatus.generatedAt)
    : [];

  const teamExecutionEmpty: DashboardTeamExecutionSummary = {
    schemaVersion: 1,
    available: false,
    totalCount: 0,
    activeCount: 0,
    byStatus: { assigned: 0, submitted: 0, blocked: 0, reconciled: 0, cancelled: 0 },
    topActive: []
  };

  const subagentRegistryEmpty: DashboardSubagentRegistrySummary = {
    schemaVersion: 1,
    available: false,
    definitionsCount: 0,
    retiredDefinitionsCount: 0,
    openSessionsCount: 0,
    topOpenSessions: []
  };

  const agentRegistrySessionsEmpty: DashboardSummaryData["agentRegistrySessions"] = {
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
  };

  const taskCheckpointsEmpty: DashboardTaskCheckpointsSummary = {
    schemaVersion: 1,
    available: false,
    totalCount: 0,
    topRecent: []
  };

  const agentRegistrySessions = sqliteDual
    ? summarizeAgentRegistrySessions(sqliteDual.getDatabase(), sqliteDual.dbPath)
    : summarizeAgentRegistrySessions(dualForStatus.getDatabase(), dualForStatus.dbPath);

  const derivedAgentStatus = buildDashboardAgentStatus({
    now: systemStatus.generatedAt,
    tasks,
    planningSession: null,
    suggestion,
    teamExecution: teamExecutionEmpty,
    subagentRegistry: subagentRegistryEmpty,
    systemStatus
  });

  const agentStatus = liveActivity
    ? agentActivityLeaseToDashboardStatus(liveActivity, systemStatus.generatedAt)
    : derivedAgentStatus;

  const agentActivitySummary = buildDashboardAgentActivitySummary({
    now: systemStatus.generatedAt,
    tasks,
    liveActivityLeases: liveLeases,
    derivedAgentStatus,
    teamExecution: teamExecutionEmpty,
    subagentRegistry: subagentRegistryEmpty,
    agentRegistrySessions
  });

  const currentPhaseDelivery = buildDashboardCurrentPhaseDelivery({
    tasks,
    workspaceStatus: {
      currentKitPhase: workspaceStatus?.currentKitPhase ?? null,
      nextKitPhase: workspaceStatus?.nextKitPhase ?? null
    },
    db: dualForStatus?.getDatabase() ?? null,
    effectiveConfig: ctx.effectiveConfig as Record<string, unknown> | undefined
  });

  const legacyDeliveredMaxOrdinal = resolveLegacyDeliveredMaxOrdinal(
    ctx.effectiveConfig as Record<string, unknown> | undefined
  );
  const phaseKeysWithActiveQueueWork = collectPhaseKeysWithActiveQueueWork(tasks);
  const { deliveredPhaseKeys, rolledOutPhaseKeys, phaseReleaseDates, phaseDeliveryHistory } = {
    deliveredPhaseKeys: collectDeliveredPhaseKeys(dualForStatus.getDatabase(), tasks),
    rolledOutPhaseKeys: collectRolledOutPhaseKeys(dualForStatus.getDatabase()),
    phaseReleaseDates: collectPhaseReleaseDatesByKey(dualForStatus.getDatabase()),
    phaseDeliveryHistory: collectPhaseDeliveryHistoryRows(dualForStatus.getDatabase())
  };
  const lastDeliveredPhase = phaseDeliveryHistory.find((row) => row.status === "delivered") ?? null;

  const effCfg =
    ctx.effectiveConfig && typeof ctx.effectiveConfig === "object" && !Array.isArray(ctx.effectiveConfig)
      ? (ctx.effectiveConfig as Record<string, unknown>)
      : {};

  let agentGuidance: DashboardSummaryData["agentGuidance"] = null;
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

  const humanGatesSummary = buildDashboardHumanGatesSummary(
    tasks,
    workspaceStatus?.currentKitPhase != null ? String(workspaceStatus.currentKitPhase) : null,
    new Map()
  );
  const approvalQueue = buildDashboardApprovalQueueSummary(tasks);

  const emptyListSummary = () =>
    ({ schemaVersion: 1 as const, count: 0, top: [], phaseBuckets: [] });

  const emptyWishlist = (pageSize: number, enabled?: boolean) =>
    ({
      schemaVersion: 1 as const,
      enabled: enabled === true,
      openCount: 0,
      totalCount: 0,
      openPage: 0,
      openPageSize: pageSize,
      openTotalPages: 0,
      openTop: []
    });

  const emptyIdeas = (): DashboardSummaryData["ideas"] => ({
    schemaVersion: 1,
    available: false,
    totalCount: 0,
    openCount: 0,
    planningCount: 0,
    plannedCount: 0,
    top: []
  });

  const emptyPhaseJournalStats = (): DashboardSummaryData["phaseJournalStats"] => ({
    schemaVersion: 1,
    available: false,
    phases: [],
    currentPhase: {
      phaseKey: null,
      activeNoteCount: 0,
      completedDeliveryTaskCount: 0,
      silenceWarning: false
    }
  });

  const suggestedNext = suggestion.suggestedNext
    ? {
        ...projectDashboardTaskRow(suggestion.suggestedNext, new Map()),
        id: suggestion.suggestedNext.id,
        status: suggestion.suggestedNext.status,
        title: suggestion.suggestedNext.title,
        type: suggestion.suggestedNext.type
      }
    : null;

  const includePhaseKickoff =
    commandArgs?.includePhaseKickoff === true || commandArgs?.includePhaseKickoff === "true";
  const phaseKickoffPhaseKey =
    typeof commandArgs?.phaseKey === "string" && commandArgs.phaseKey.trim().length > 0
      ? commandArgs.phaseKey.trim()
      : parseKitPhaseNumberFromYaml(workspaceStatus?.currentKitPhase ?? null);
  let phaseKickoff: DashboardPhaseKickoffSummary | null = null;
  if (includePhaseKickoff && sqliteDual && phaseKickoffPhaseKey) {
    phaseKickoff = await buildDashboardPhaseKickoffSlice(
      ctx,
      { taskStore: store, sqliteDual } satisfies OpenedPlanningStores,
      phaseKickoffPhaseKey,
      { includeValidationPlans: false }
    );
  }

  return {
    schemaVersion: 7 as const,
    dashboardProjection: "overview",
    planningGeneration,
    planningGenerationPolicy: getPlanningGenerationPolicy({
      effectiveConfig: ctx.effectiveConfig as Record<string, unknown> | undefined
    }),
    taskStoreLastUpdated: store.getLastUpdated(),
    workspaceStatus,
    planningSession: null,
    planArtifact: null,
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
    wishlist: emptyWishlist(10, includeWishlist),
    ideas: emptyIdeas(),
    blockedSummary: { count: 0, top: [], phaseBuckets: [] },
    humanGatesSummary,
    approvalQueue,
    phaseJournalStats: emptyPhaseJournalStats(),
    completedSummary: {
      schemaVersion: 1 as const,
      count: getTerminalCount("completed", tasks, sqliteDual),
      top: [],
      phaseBuckets: [],
      lazy: true
    },
    cancelledSummary: {
      schemaVersion: 1 as const,
      count: getTerminalCount("cancelled", tasks, sqliteDual),
      top: [],
      phaseBuckets: [],
      lazy: true
    },
    suggestedNext,
    dependencyOverview: {
      schemaVersion: 1,
      activeTaskCount: 0,
      includedTaskCount: 0,
      edgeCount: 0,
      truncated: false,
      perfNote: "overview projection",
      nodes: [],
      edges: [],
      mermaidFlowchart: "",
      criticalPathReady: []
    },
    blockingAnalysis: [],
    agentGuidance,
    teamExecution: teamExecutionEmpty,
    subagentRegistry: subagentRegistryEmpty,
    agentRegistrySessions: agentRegistrySessionsEmpty,
    taskCheckpoints: taskCheckpointsEmpty,
    systemStatus,
    taskStateProjection,
    agentStatus,
    agentActivitySummary,
    currentPhaseDelivery,
    deliveredPhaseKeys,
    rolledOutPhaseKeys,
    phaseReleaseDates,
    phaseDeliveryHistory,
    lastDeliveredPhase,
    legacyDeliveredMaxOrdinal,
    phaseKeysWithActiveQueueWork,
    pastPhaseNotes: [],
    ...(phaseKickoff ? { phaseKickoff } : {})
  } satisfies DashboardSummaryData;
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

export function buildDashboardAgentActivityProjection(base: DashboardBuildBase): DashboardSummaryData {
  return base.data;
}

function getTerminalCount(
  status: "completed" | "cancelled",
  tasks: any[],
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

export {
  buildDashboardOverviewSlice,
  buildDashboardQueueSlice,
  buildDashboardStatusSlice,
  buildDashboardAgentActivitySlice,
  buildDashboardAgentTypesSlice,
  buildDashboardTerminalTasksPage
} from "./focused-slice-builders.js";

