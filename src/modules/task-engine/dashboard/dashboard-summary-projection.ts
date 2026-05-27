import type { DashboardSummaryData } from "../../../contracts/dashboard-summary-run.js";

export type DashboardSummaryProjection = "full" | "overview" | "queue" | "status";

const PROJECTIONS: readonly DashboardSummaryProjection[] = ["full", "overview", "queue", "status"];

export function parseDashboardSummaryProjection(args?: Record<string, unknown>): DashboardSummaryProjection {
  const raw = args?.projection;
  if (typeof raw === "string" && (PROJECTIONS as readonly string[]).includes(raw)) {
    return raw as DashboardSummaryProjection;
  }
  return "full";
}

export function dashboardSummaryNeedsQueueRollups(projection: DashboardSummaryProjection): boolean {
  return projection === "full" || projection === "queue";
}

export function dashboardSummaryNeedsOverviewRollups(projection: DashboardSummaryProjection): boolean {
  return projection === "full" || projection === "overview";
}

export function dashboardSummaryNeedsStatusRollups(projection: DashboardSummaryProjection): boolean {
  return projection === "full" || projection === "status";
}

export function dashboardSummaryNeedsPastPhaseNotes(projection: DashboardSummaryProjection): boolean {
  return projection === "full" || projection === "queue";
}

export function dashboardSummaryNeedsPhaseJournalStats(projection: DashboardSummaryProjection): boolean {
  return projection === "full" || projection === "queue";
}

const emptyListSummary = () =>
  ({ schemaVersion: 1 as const, count: 0, top: [], phaseBuckets: [] });

const emptyWishlist = (pageSize: number) =>
  ({
    schemaVersion: 1 as const,
    openCount: 0,
    totalCount: 0,
    openPage: 0,
    openPageSize: pageSize,
    openTotalPages: 0,
    openTop: []
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

/** Stamp `dashboardProjection` and omit fields outside the requested slice (after builders ran). */
export function finalizeDashboardSummaryProjection(
  data: DashboardSummaryData,
  projection: DashboardSummaryProjection
): DashboardSummaryData {
  if (projection === "full") {
    return { ...data, dashboardProjection: "full" };
  }

  const base = {
    schemaVersion: data.schemaVersion,
    planningGeneration: data.planningGeneration,
    planningGenerationPolicy: data.planningGenerationPolicy,
    taskStoreLastUpdated: data.taskStoreLastUpdated,
    workspaceStatus: data.workspaceStatus,
    stateSummary: data.stateSummary,
    executionPlanningScope: data.executionPlanningScope,
    taskStateProjection: data.taskStateProjection,
    dashboardProjection: projection
  } satisfies Partial<DashboardSummaryData>;

  if (projection === "overview") {
    return {
      ...base,
      planningSession: null,
      transcriptChurnResearchSummary: emptyListSummary(),
      proposedImprovementsSummary: emptyListSummary(),
      proposedExecutionSummary: emptyListSummary(),
      readyImprovementsSummary: emptyListSummary(),
      readyExecutionSummary: emptyListSummary(),
      readyQueueTop: [],
      readyQueueCount: 0,
      readyQueueBreakdown: { schemaVersion: 1, improvement: 0, other: 0 },
      wishlist: emptyWishlist(10),
      blockedSummary: { count: 0, top: [], phaseBuckets: [] },
      humanGatesSummary: data.humanGatesSummary,
      approvalQueue: data.approvalQueue,
      phaseJournalStats: emptyPhaseJournalStats(),
      completedSummary: emptyListSummary(),
      cancelledSummary: emptyListSummary(),
      suggestedNext: data.suggestedNext,
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
      agentGuidance: data.agentGuidance,
      teamExecution: data.teamExecution,
      subagentRegistry: data.subagentRegistry,
      taskCheckpoints: data.taskCheckpoints,
      systemStatus: data.systemStatus,
      taskStateProjection: data.taskStateProjection,
      agentStatus: data.agentStatus,
      currentPhaseDelivery: data.currentPhaseDelivery,
      deliveredPhaseKeys: data.deliveredPhaseKeys,
      rolledOutPhaseKeys: data.rolledOutPhaseKeys,
      phaseReleaseDates: data.phaseReleaseDates,
      legacyDeliveredMaxOrdinal: data.legacyDeliveredMaxOrdinal,
      phaseKeysWithActiveQueueWork: data.phaseKeysWithActiveQueueWork,
      pastPhaseNotes: []
    };
  }

  if (projection === "queue") {
    return {
      ...base,
      planningSession: data.planningSession,
      transcriptChurnResearchSummary: data.transcriptChurnResearchSummary,
      proposedImprovementsSummary: data.proposedImprovementsSummary,
      proposedExecutionSummary: data.proposedExecutionSummary,
      readyImprovementsSummary: data.readyImprovementsSummary,
      readyExecutionSummary: data.readyExecutionSummary,
      readyQueueTop: data.readyQueueTop,
      readyQueueCount: data.readyQueueCount,
      readyQueueBreakdown: data.readyQueueBreakdown,
      wishlist: data.wishlist,
      blockedSummary: data.blockedSummary,
      humanGatesSummary: data.humanGatesSummary,
      approvalQueue: data.approvalQueue,
      phaseJournalStats: data.phaseJournalStats,
      completedSummary: data.completedSummary,
      cancelledSummary: data.cancelledSummary,
      suggestedNext: data.suggestedNext,
      dependencyOverview: data.dependencyOverview,
      blockingAnalysis: data.blockingAnalysis,
      agentGuidance: null,
      teamExecution: data.teamExecution,
      subagentRegistry: data.subagentRegistry,
      taskCheckpoints: data.taskCheckpoints,
      systemStatus: data.systemStatus,
      taskStateProjection: data.taskStateProjection,
      agentStatus: data.agentStatus,
      currentPhaseDelivery: data.currentPhaseDelivery,
      deliveredPhaseKeys: data.deliveredPhaseKeys,
      rolledOutPhaseKeys: data.rolledOutPhaseKeys,
      phaseReleaseDates: data.phaseReleaseDates,
      legacyDeliveredMaxOrdinal: data.legacyDeliveredMaxOrdinal,
      phaseKeysWithActiveQueueWork: data.phaseKeysWithActiveQueueWork,
      pastPhaseNotes: data.pastPhaseNotes
    };
  }

  // status
  return {
    ...base,
    planningSession: data.planningSession,
    transcriptChurnResearchSummary: emptyListSummary(),
    proposedImprovementsSummary: emptyListSummary(),
    proposedExecutionSummary: emptyListSummary(),
    readyImprovementsSummary: emptyListSummary(),
    readyExecutionSummary: emptyListSummary(),
    readyQueueTop: [],
    readyQueueCount: 0,
    readyQueueBreakdown: { schemaVersion: 1, improvement: 0, other: 0 },
    wishlist: emptyWishlist(10),
    blockedSummary: { count: 0, top: [], phaseBuckets: [] },
    humanGatesSummary: data.humanGatesSummary,
    approvalQueue: data.approvalQueue,
    phaseJournalStats: emptyPhaseJournalStats(),
    completedSummary: emptyListSummary(),
    cancelledSummary: emptyListSummary(),
    suggestedNext: data.suggestedNext,
    dependencyOverview: data.dependencyOverview,
    blockingAnalysis: [],
    agentGuidance: data.agentGuidance,
    teamExecution: data.teamExecution,
    subagentRegistry: data.subagentRegistry,
    taskCheckpoints: data.taskCheckpoints,
    systemStatus: data.systemStatus,
    taskStateProjection: data.taskStateProjection,
    agentStatus: data.agentStatus,
    currentPhaseDelivery: data.currentPhaseDelivery,
    deliveredPhaseKeys: data.deliveredPhaseKeys,
    rolledOutPhaseKeys: data.rolledOutPhaseKeys,
    phaseReleaseDates: data.phaseReleaseDates,
    legacyDeliveredMaxOrdinal: data.legacyDeliveredMaxOrdinal,
    phaseKeysWithActiveQueueWork: data.phaseKeysWithActiveQueueWork,
    pastPhaseNotes: []
  };
}
