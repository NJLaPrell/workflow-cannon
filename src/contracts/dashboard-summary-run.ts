/**
 * Shared contract for `workspace-kit run dashboard-summary` success payloads.
 * Consumed by the Cursor extension webview renderer; keep aligned with `task-engine-dashboard-on-command.ts`.
 */

export type DashboardFeatureDetail = {
  slug: string;
  name: string;
  componentId: string;
  componentDisplayName: string;
};

export type DashboardTaskRow = {
  id: string;
  title: string;
  priority?: string | null;
  phase?: string | null;
  /** Feature taxonomy slugs when present on the task (`feature-taxonomy.json`). */
  features?: string[] | null;
  /** Resolved labels when relational feature registry is active (`user_version` 5+). */
  featureDetails?: DashboardFeatureDetail[] | null;
};

export type DashboardWishlistRow = {
  id: string;
  title: string;
  /** Backing `wishlist_intake` task id (`T###`); use for `run-transition`, not necessarily equal to `id` when legacy `W###` is shown. */
  taskId: string;
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

/**
 * Effective agent guidance (RPG party v1) + resolved agent-behavior profile for dashboard / extension.
 * `displayLabel` is the maintainer **Role** (tier catalog / `kit.agentGuidance`).
 * `temperamentLabel` is the onboarding-style temperament name (The Wary Scout, The Steady Adventurer, …),
 * derived from the effective behavior profile id / dimensions — not the raw profile `label`.
 */
export type DashboardAgentGuidanceSummary = {
  schemaVersion: 1;
  profileSetId: string;
  tier: number;
  displayLabel: string;
  usingDefaultTier: boolean;
  temperamentProfileId: string;
  temperamentLabel: string;
};

/** Read-only team execution rows for dashboard / extension (Phase 58+ visibility). */
export type DashboardTeamAssignmentRow = {
  id: string;
  executionTaskId: string;
  /** Title from task store when the execution task exists; otherwise null. */
  executionTaskTitle: string | null;
  supervisorId: string;
  workerId: string;
  status: string;
  updatedAt: string;
};

export type DashboardTeamExecutionSummary = {
  schemaVersion: 1;
  /** False when kit SQLite `user_version` is below team-execution baseline or the summary query failed. */
  available: boolean;
  totalCount: number;
  /** Rows in assigned, submitted, or blocked (work still in flight for supervisors). */
  activeCount: number;
  byStatus: {
    assigned: number;
    submitted: number;
    blocked: number;
    reconciled: number;
    cancelled: number;
  };
  /** Up to 15 most recently updated active assignments. */
  topActive: DashboardTeamAssignmentRow[];
};

/** Read-only subagent registry rollup for dashboard / extension (Phase 60+). */
export type DashboardSubagentRegistrySummary = {
  schemaVersion: 1;
  available: boolean;
  definitionsCount: number;
  retiredDefinitionsCount: number;
  openSessionsCount: number;
  topOpenSessions: Array<{
    sessionId: string;
    definitionId: string;
    executionTaskId: string | null;
    status: string;
    updatedAt: string;
  }>;
};

export type DashboardSummaryData = {
  schemaVersion: 3;
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
    featureDetails?: DashboardFeatureDetail[] | null;
  } | null;
  dependencyOverview: Record<string, unknown>;
  blockingAnalysis: unknown[];
  /** Present when kit resolves agent guidance (Phase 47+). */
  agentGuidance: DashboardAgentGuidanceSummary | null;
  /** Team execution assignments from `kit_team_assignments` (Phase 58+); stable read-only facet for operators. */
  teamExecution: DashboardTeamExecutionSummary;
  /** Subagent definitions + open sessions from `kit_subagent_*` (Phase 60+). */
  subagentRegistry: DashboardSubagentRegistrySummary;
};

/** Success envelope for `dashboard-summary` (extension + tooling). */
export type DashboardSummaryCommandSuccess = {
  ok: true;
  code: "dashboard-summary";
  message: string;
  data: DashboardSummaryData;
};
