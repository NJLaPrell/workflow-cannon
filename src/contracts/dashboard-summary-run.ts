/**
 * Shared contract for `workspace-kit run dashboard-summary` success payloads.
 * Consumed by the Cursor extension webview renderer; keep aligned with `src/modules/task-engine/commands/task-engine-dashboard-on-command.ts`.
 */

import type { WorkspaceCoordinationStatusV1 } from "./workspace-coordination-status.js";

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
  /** Task severity label promoted from stable read metadata when present. */
  severity?: string | null;
  phase?: string | null;
  /** Component labels for queue-grouping and chip renderers. */
  components?: string[] | null;
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
  agentPresentation?: {
    schemaVersion: 1;
    mode: "derived" | "explicit";
    workLog: "off" | "minimal" | "normal" | "frequent";
    rationale: "none" | "simple" | "technical";
    technicality: "plain" | "balanced" | "technical";
    finalAnswerDetail: "concise" | "normal" | "detailed";
    privateReasoning: "never_disclose";
  };
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

/** Doctor contract slice for status dashboards (paths under repo root are relative). */
export type DashboardDoctorSummary = {
  schemaVersion: 1;
  ok: boolean;
  issueCount: number;
  issues: Array<{ path: string; reason: string }>;
};

/** Phase / export / drift slice aligned with `phase-status` (bounded; read-only). */
export type DashboardPhaseSystemSlice = {
  schemaVersion: 1;
  ok: boolean;
  code?: string;
  message?: string;
  canonicalPhaseKey: string | null;
  source: string | null;
  currentKitPhase: string | null;
  nextKitPhase: string | null;
  configPhaseKey: string | null;
  workspaceStatusPhaseKey: string | null;
  configMatchesWorkspaceStatus: boolean | null;
  exportStale: boolean | null;
  exportReason: string | null;
  driftMessages: string[];
  remediationSuggestions: string[];
  /** Ordered phase keys + optional short descriptions (`list-phase-catalog` contract; includes task-assigned keys, all statuses). Future-phase rows with no catalog line may include a **derived** one-line title from task titles/summaries (see `enrichFuturePhaseCatalogWithTaskSummaries`). */
  phaseCatalog?: {
    schemaVersion: 1;
    supported: boolean;
    phases: Array<{ phaseKey: string; shortDescription: string | null; inCatalog: boolean }>;
  };
};

export type DashboardModuleActivationSlice = {
  schemaVersion: 1;
  enabledModuleIds: string[];
  disabledModuleIds: string[];
};

/** Repo / kit naming — from generated project context, root package.json, installed workspace-kit. */
export type DashboardWorkspaceIdentity = {
  schemaVersion: 1;
  /** From `.workspace-kit/generated/project-context.json` when present. */
  projectName: string | null;
  /** Root `package.json` `name` when present. */
  packageName: string | null;
  /** Installed `@workflow-cannon/workspace-kit` version from `node_modules`, when resolvable. */
  workspaceKitVersion: string | null;
  /** Root `package.json` `version` when present. */
  rootPackageVersion: string | null;
};

/** Where tasks / planning SQLite live (runtime is SQLite-only). */
export type DashboardPlanningStoreSummary = {
  schemaVersion: 1;
  backend: "sqlite";
  /** Repo-relative path from effective config defaulting to `.workspace-kit/tasks/workspace-kit.db`. */
  databaseRelativePath: string;
};

/**
 * Composed workspace posture for Editor status tab + CLI consumers — one read alongside other dashboard fields.
 * CAE trace hints remain on the merged CLI envelope (`data.cae`); `caeLines` mirrors `doctor` CAE posture text.
 */
export type DashboardSystemStatus = {
  /** **`2`** adds **`identity`** + **`planningStore`** slices. **`1`** omitted those blocks. */
  schemaVersion: 1 | 2;
  generatedAt: string;
  identity?: DashboardWorkspaceIdentity;
  planningStore?: DashboardPlanningStoreSummary;
  phase: DashboardPhaseSystemSlice;
  doctor: DashboardDoctorSummary;
  modules: DashboardModuleActivationSlice;
  caeLines: string[];
  coordination?: WorkspaceCoordinationStatusV1;
};

export type DashboardAgentStatusKind =
  | "unavailable"
  | "planning"
  | "blocked"
  | "working_task"
  | "delegating_task"
  | "ready_task"
  | "awaiting_instruction"
  | "reviewing_item"
  | "reviewing_pr"
  | "validating"
  | "releasing"
  | "awaiting_policy_approval"
  | "awaiting_human_gate";

export type DashboardAgentStatusSummary = {
  schemaVersion: 1;
  /** `derived` is read-only inference; `live_activity` is a fresh expiring lease. */
  source: "derived" | "live_activity";
  kind: DashboardAgentStatusKind;
  label: string;
  confidence: "high" | "medium" | "low";
  updatedAt: string;
  taskId?: string | null;
  phaseKey?: string | null;
  command?: string | null;
  prNumber?: number | null;
  version?: string | null;
  detail?: string | null;
};

export type DashboardSummaryData = {
  schemaVersion: 7;
  /** Monotonic optimistic-lock generation for the unified planning SQLite row. */
  planningGeneration: number;
  /** Effective `tasks.planningGenerationPolicy` for mutating commands. */
  planningGenerationPolicy: PlanningGenerationPolicy;
  taskStoreLastUpdated: string;
  workspaceStatus: Record<string, unknown> | null;
  planningSession: unknown;
  stateSummary: Record<string, unknown>;
  /** `transcript_churn` tasks in **`research`** (pipeline intake before **`synthesize-transcript-churn`**). */
  transcriptChurnResearchSummary: DashboardListSummary;
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
    /** Current page of open wishlist rows (0-based). */
    openPage: number;
    /** Page size for `openTop` (default **10** in kit; extension passes explicitly). */
    openPageSize: number;
    /** `Math.ceil(openCount / openPageSize)` when `openCount > 0`, else **0**. */
    openTotalPages: number;
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
    severity?: string | null;
    phase?: string | null;
    components?: string[] | null;
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
  /** Phase/drift, doctor contract, module activation, CAE lines — status tab aggregate (Phase 79+). */
  systemStatus: DashboardSystemStatus;
  /** Conservative, read-only WC Agent status derived from dashboard/task state (Phase 81+). */
  agentStatus: DashboardAgentStatusSummary;
};

/** Success envelope for `dashboard-summary` (extension + tooling). */
export type DashboardSummaryCommandSuccess = {
  ok: true;
  code: "dashboard-summary";
  message: string;
  data: DashboardSummaryData;
};
