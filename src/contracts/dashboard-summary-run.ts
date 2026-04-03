/**
 * Shared contract for `workspace-kit run dashboard-summary` success payloads.
 * Consumed by the Cursor extension webview renderer; keep aligned with `task-engine-dashboard-on-command.ts`.
 */

export type DashboardTaskRow = {
  id: string;
  title: string;
  priority?: string | null;
  phase?: string | null;
  /** Feature taxonomy slugs when present on the task (`feature-taxonomy.json`). */
  features?: string[] | null;
};

export type DashboardWishlistRow = {
  id: string;
  title: string;
};

export type DashboardBlockedRow = {
  taskId?: string;
  blockedBy?: string[];
  [key: string]: unknown;
};

export type DashboardPhaseBucket = Record<string, unknown>;

export type DashboardListSummary = {
  schemaVersion: 1;
  count: number;
  top: DashboardTaskRow[];
  phaseBuckets: DashboardPhaseBucket[];
};

export type PlanningGenerationPolicy = "off" | "warn" | "require";

/** Effective agent guidance (RPG party v1) for dashboard / extension — advisory only. */
export type DashboardAgentGuidanceSummary = {
  schemaVersion: 1;
  profileSetId: string;
  tier: number;
  displayLabel: string;
  usingDefaultTier: boolean;
};

export type DashboardSummaryData = {
  schemaVersion: 1;
  /** Monotonic optimistic-lock generation for the unified planning SQLite row. */
  planningGeneration: number;
  /** Effective `tasks.planningGenerationPolicy` for mutating commands. */
  planningGenerationPolicy: PlanningGenerationPolicy;
  taskStoreLastUpdated: string;
  workspaceStatus: Record<string, unknown> | null;
  planningSession: unknown;
  stateSummary: Record<string, unknown>;
  proposedImprovementsSummary: DashboardListSummary;
  proposedExecutionSummary: DashboardListSummary;
  readyImprovementsSummary: DashboardListSummary;
  readyExecutionSummary: DashboardListSummary;
  readyQueueTop: DashboardTaskRow[];
  readyQueueCount: number;
  readyQueueBreakdown: {
    schemaVersion: 1;
    improvement: number;
    other: number;
  };
  executionPlanningScope: "tasks-only";
  wishlist: {
    schemaVersion: 1;
    openCount: number;
    totalCount: number;
    openTop: DashboardWishlistRow[];
  };
  blockedSummary: {
    count: number;
    top: DashboardBlockedRow[];
    phaseBuckets: DashboardPhaseBucket[];
  };
  completedSummary: DashboardListSummary;
  cancelledSummary: DashboardListSummary;
  suggestedNext: {
    id: string;
    title: string;
    status: string;
    priority?: string | null;
    phase?: string | null;
    features?: string[] | null;
  } | null;
  dependencyOverview: Record<string, unknown>;
  blockingAnalysis: unknown[];
  /** Present when kit resolves agent guidance (Phase 47+). */
  agentGuidance: DashboardAgentGuidanceSummary | null;
};

/** Success envelope for `dashboard-summary` (extension + tooling). */
export type DashboardSummaryCommandSuccess = {
  ok: true;
  code: "dashboard-summary";
  message: string;
  data: DashboardSummaryData;
};
