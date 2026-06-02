/**
 * Shared contract for `workspace-kit run dashboard-summary` success payloads.
 * Consumed by the Cursor extension webview renderer; keep aligned with `src/modules/task-engine/commands/task-engine-dashboard-on-command.ts`.
 */

import type { AgentPhaseFocusDashboard } from "./agent-phase-focus-dashboard-contract.js";
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
  /** Stable phase bucket when known (`inferTaskPhaseKey`); used for Up next and phase rollups. */
  phaseKey?: string | null;
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

export type DashboardIdeaRow = {
  id: string;
  title: string;
  note?: string;
  status: "open" | "planning" | "planned";
  sortOrder: number;
  linkedPlanArtifact?: string;
  previousPlanArtifacts: string[];
  createdAt: string;
  updatedAt: string;
  planningChatSession?: {
    schemaVersion: 1;
    ideaId: string;
    status: "active";
    updatedAt: string;
    resumePrompt?: string;
  };
};

export type DashboardIdeasSummary = {
  schemaVersion: 1;
  available: boolean;
  totalCount: number;
  openCount: number;
  planningCount: number;
  plannedCount: number;
  top: DashboardIdeaRow[];
};

export type DashboardBlockedRow = {
  taskId?: string;
  blockedBy?: string[];
  [key: string]: unknown;
};

/** Human-gate queue row (`awaiting_review` / policy / external). */
export type DashboardHumanGateRow = DashboardTaskRow & {
  status: string;
  gateKind: string;
  ageMs: number;
  enteredAt?: string | null;
  requestedDecision?: string | null;
  owner?: string | null;
  reason?: string | null;
};

export type DashboardHumanGatesSummary = {
  schemaVersion: 1;
  /** Workspace current phase used to scope the rollup (null when unscoped). */
  phaseKey: string | null;
  count: number;
  top: DashboardHumanGateRow[];
};

/** Improvement review queue for policy / approval inbox (approvals module). */
export type DashboardApprovalQueueSummary = {
  schemaVersion: 1;
  count: number;
  top: Array<{
    id: string;
    title: string;
    status: string;
    phaseKey: string | null;
    priority: string | null;
  }>;
  policyArtifacts: Array<{ relativePath: string; role: string }>;
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

/** Read-only task-linked git checkpoint rollup for dashboard / extension (Phase 64+). */
export type DashboardTaskCheckpointsSummary = {
  schemaVersion: 1;
  available: boolean;
  totalCount: number;
  topRecent: Array<{
    id: string;
    taskId: string | null;
    label: string | null;
    refKind: "head" | "stash";
    createdAt: string;
    gitHeadSha: string;
  }>;
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

export type DashboardAgentRegistrySessionTopOpenSessionRow = {
  sessionId: string;
  agentId: string;
  hostHint: string | null;
  modelTier: string | null;
  currentAssignmentId: string | null;
  currentTaskId: string | null;
  currentActivityId: string | null;
  status: string;
  updatedAt: string;
};

/**
 * Read-only orchestration bridge summary for dashboard/status surfaces.
 * Derived from agent definitions, agent sessions, and team assignments.
 */
export type DashboardAgentRegistrySessionSummary = {
  schemaVersion: 1;
  /** False when bridge/session SQLite prerequisites are unavailable. */
  available: boolean;
  definitionsCount: number;
  orchestrationReadyDefinitionsCount: number;
  retiredDefinitionsCount: number;
  openSessionsCount: number;
  activeAssignmentsCount: number;
  linkedOpenSessionsCount: number;
  hostAvailability: {
    cursor: number;
    vscode: number;
    cli: number;
    manual: number;
    unknown: number;
  };
  capabilityAvailability: {
    required: string[];
    optional: string[];
  };
  currentPointers: {
    assignment: number;
    task: number;
    activity: number;
  };
  topOpenSessions: DashboardAgentRegistrySessionTopOpenSessionRow[];
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

/** Effective canonical sync backend (`tasks.canonicalBackend` + legacy `tasks.canonicalAuthority`). */
export type DashboardCanonicalBackendSummary = {
  schemaVersion: 1;
  type: "git" | "local-only" | "hosted";
  backendId: string;
  canonicalAuthority: "sqlite" | "git-event-log";
  configSource: "canonicalBackend" | "canonicalAuthority" | "default";
  configConflict: boolean;
  hostedImplemented: boolean;
};

/** Bounded PlanArtifact lifecycle pointer for dashboard Plan panels; full WBS stays in artifact storage. */
export type DashboardPlanArtifactSummary = {
  schemaVersion: 1;
  count: number;
  current: DashboardPlanArtifactRow;
  recent: DashboardPlanArtifactRow[];
};

export type DashboardPlanArtifactRow = {
  planId: string;
  planRef: string;
  version: number;
  status: string;
  title: string;
  planningType: string;
  updatedAt: string;
  wbsRowCount: number;
  openQuestionCount: number;
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
  canonicalBackend?: DashboardCanonicalBackendSummary;
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

export type DashboardAgentActivityRow = {
  schemaVersion: 1;
  rowId: string;
  displayName: string;
  role: "orchestrator" | "task_worker" | "subagent" | "unknown";
  source: "live_activity" | "team_execution" | "subagent_registry" | "derived" | "future_runtime";
  sourceConfidence: "high" | "medium" | "low";
  status: DashboardAgentStatusKind;
  statusLabel: string;
  work: {
    taskId: string | null;
    title: string | null;
    command: string | null;
    phaseKey: string | null;
    assignmentId: string | null;
    sessionId: string | null;
    currentStep: string | null;
  };
  refs: {
    activityId: string | null;
    agentId: string | null;
    sessionId: string | null;
    assignmentId: string | null;
    agentDefinitionId: string | null;
    subagentDefinitionId: string | null;
    taskId: string | null;
    prNumber: number | null;
  };
  freshness: {
    updatedAt: string | null;
    startedAt: string | null;
    expiresAt: string | null;
    state: "fresh" | "aging" | "stale" | "expired" | "unknown";
  };
  attention: {
    state: "none" | "blocked" | "needs_human" | "needs_policy" | "stale" | "failed" | "unavailable";
    message: string | null;
  };
};

export type DashboardAgentActivitySummary = {
  schemaVersion: 1;
  generatedAt: string;
  source: "live_activity" | "derived_only" | "mixed";
  activeCount: number;
  staleCount: number;
  needsAttentionCount: number;
  main: DashboardAgentActivityRow | null;
  active: DashboardAgentActivityRow[];
  needsAttention: DashboardAgentActivityRow[];
  inferredFallback: DashboardAgentStatusSummary | null;
  sourceMap: {
    liveActivityCount: number;
    teamExecutionCount: number;
    subagentSessionCount: number;
    derivedFallbackUsed: boolean;
  };
};

export type DashboardCurrentPhaseQueue = {
  ready: number;
  proposed: number;
  blocked: number;
  inProgress: number;
  research: number;
};

export type DashboardCurrentPhaseSegments = {
  completed: number;
  cancelled: number;
  inProgress: number;
  ready: number;
  proposed: number;
  blocked: number;
  research: number;
};

export type DashboardTaskStateDisplayState =
  | "current"
  | "syncing"
  | "behind"
  | "offline"
  | "conflict";

export type DashboardTaskStateLocalProjection =
  | "fresh"
  | "behind"
  | "conflict"
  | "rebuilding"
  | "offline";

export type DashboardTaskStateRecommendedAction =
  | "none"
  | "wait"
  | "hydrate"
  | "resolve-conflict"
  | "run-publish";

/** Canonical task-state projection cursor surfaced on dashboard-summary (read-only). */
export type DashboardTaskStateProjectionSummary = {
  schemaVersion: 1;
  /** False when `kit_task_state_projection_meta` is absent (kit SQLite user_version < 28). */
  available: boolean;
  backend: "git-event-log" | "sqlite-relational" | null;
  appliedSequence: number | null;
  sourceCommit: string | null;
  syncStatus: "empty" | "fresh" | "stale" | "rebuilding" | "corrupt" | null;
  updatedAt: string | null;
  /** Operator-facing sync posture (extension may override to `syncing` while background sync runs). */
  displayState: DashboardTaskStateDisplayState;
  /** Short remediation when not `current`; null when healthy. */
  remediation: string | null;
  /** Git alignment from read-only `task-state-status` (never fetched on this path). */
  gitSyncState: "current" | "behind" | "missing" | "conflict" | null;
  /** Local projection posture from task-state-status (accounts for queue-mode outbox). */
  localProjection: DashboardTaskStateLocalProjection;
  outbox: {
    pending: number;
    publishing: number;
    failed: number;
    conflict: number;
    oldestPendingAgeMs: number;
    latestPublishedAt: string | null;
  };
  remote: {
    branch: string;
    behind: boolean;
    remoteLatestSequence: number | null;
    remoteTipSha: string | null;
    lastPublishedAt: string | null;
  };
  recommendedAction: DashboardTaskStateRecommendedAction;
};

/** Current workspace phase queue, progress, and release markers for dashboard cards. */
export type DashboardCurrentPhaseDelivery = {
  schemaVersion: 2;
  phaseKey: string | null;
  closeoutPassed: boolean;
  released: boolean;
  remainingCount: number;
  terminalCount: number;
  checkedTaskCount: number;
  queue: DashboardCurrentPhaseQueue;
  segments: DashboardCurrentPhaseSegments;
  progressPercent: number;
  releaseReadyPercent: number;
  deliveryEvidenceViolationCount: number;
};

export type DashboardSummaryData = {
  schemaVersion: 7;
  /** When set, indicates which section slice this payload targets (`full` when omitted for legacy callers). */
  dashboardProjection?: DashboardSummaryProjection;
  /** Monotonic optimistic-lock generation for the unified planning SQLite row. */
  planningGeneration: number;
  /** Effective `tasks.planningGenerationPolicy` for mutating commands. */
  planningGenerationPolicy: PlanningGenerationPolicy;
  taskStoreLastUpdated: string;
  workspaceStatus: Record<string, unknown> | null;
  planningSession: unknown;
  /** Latest PlanArtifact lifecycle pointer, or null when no PlanArtifact has been persisted. */
  planArtifact: DashboardPlanArtifactSummary | null;
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
  /** Lightweight operator ideas from `workflow_ideas`, ordered for dashboard display. */
  ideas: DashboardIdeasSummary;
  blockedSummary: {
    count: number;
    top: DashboardBlockedRow[];
    phaseBuckets: DashboardPhaseBucket[];
  };
  /** Tasks in human-gate statuses scoped to workspace current phase. */
  humanGatesSummary: DashboardHumanGatesSummary;
  /** Improvement tasks awaiting `review-item` (ready / in_progress). */
  approvalQueue: DashboardApprovalQueueSummary;
  /** Present when `dashboard-summary` is invoked with `includePhaseFocus: true`. */
  phaseFocus?: AgentPhaseFocusDashboard;
  /** Per-phase phase-journal note counts + current-phase silence signal. */
  phaseJournalStats: DashboardPhaseJournalStats;
  completedSummary: DashboardListSummary;
  cancelledSummary: DashboardListSummary;
  suggestedNext: {
    id: string;
    title: string;
    status: string;
    type?: string | null;
    priority?: string | null;
    severity?: string | null;
    phase?: string | null;
    phaseKey?: string | null;
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
  /** Agent definition/session bridge rollup from `kit_subagent_*`, `kit_agent_sessions`, and assignments. */
  agentRegistrySessions?: DashboardAgentRegistrySessionSummary;
  /** Task-linked git checkpoints from `kit_task_checkpoints` (Phase 64+). */
  taskCheckpoints: DashboardTaskCheckpointsSummary;
  /** Phase/drift, doctor contract, module activation, CAE lines — status tab aggregate (Phase 79+). */
  systemStatus: DashboardSystemStatus;
  /** Local SQLite projection of the canonical git task-state event log (Phase 115 S4.1+). */
  taskStateProjection: DashboardTaskStateProjectionSummary;
  /** Conservative, read-only WC Agent status derived from dashboard/task state (Phase 81+). */
  agentStatus: DashboardAgentStatusSummary;
  /** Activity projection built from live leases, assignments, and subagent sessions (Phase 128+). */
  agentActivitySummary?: DashboardAgentActivitySummary;
  /** Phase Readiness Complete & Release gating — closeout audit + release/rollover detection. */
  currentPhaseDelivery: DashboardCurrentPhaseDelivery;
  /**
   * Phase keys with closeout-passed delivery evidence among phases rolled off via workspace events.
   * Drives Delivered vs Future schedule tags in queue buckets and roster.
   */
  deliveredPhaseKeys?: string[];
  /**
   * Phase keys workspace rolled off via `set_current_phase` (may lack closeout evidence).
   * Dashboard roster merges these with {@link deliveredPhaseKeys} so past phases do not appear as Future.
   */
  rolledOutPhaseKeys?: string[];
  /**
   * ISO timestamps when workspace rolled off each phase key via `set_current_phase` events.
   * Drives Queue phase-filter ordering (newest release first).
   */
  phaseReleaseDates?: Record<string, string>;
  /**
   * When set, numeric phase keys with leading ordinal in `[0, N]` are treated as delivered
   * (pre–delivery-evidence history). From `kit.phaseDelivery.legacyDeliveredMaxOrdinal`.
   */
  legacyDeliveredMaxOrdinal?: number | null;
  /**
   * Phase keys with non-terminal queue work. Roster and schedule tags keep these visible even when
   * {@link legacyDeliveredMaxOrdinal} or rollover would otherwise mark the phase delivered.
   */
  phaseKeysWithActiveQueueWork?: string[];
  /**
   * Past-phase journal rollup for dashboard (phases with ordinal before workspace current).
   * Omitted when phase journal SQLite is unavailable; empty array when no past notes exist.
   */
  pastPhaseNotes?: DashboardPastPhaseNotesEntry[];
};

export type DashboardPastPhaseNotesEntry = {
  phaseKey: string;
  notes: Array<Record<string, unknown>>;
};

export type DashboardPhaseNoteCountRow = {
  phaseKey: string;
  activeNoteCount: number;
  latestNoteAt: string | null;
};

export type DashboardPhaseJournalStats = {
  schemaVersion: 1;
  available: boolean;
  phases: DashboardPhaseNoteCountRow[];
  currentPhase: {
    phaseKey: string | null;
    activeNoteCount: number;
    completedDeliveryTaskCount: number;
    silenceWarning: boolean;
  };
};

/** Success envelope for `dashboard-summary` (extension + tooling). */
export type DashboardSummaryCommandSuccess = {
  ok: true;
  code: "dashboard-summary";
  message: string;
  data: DashboardSummaryData;
};

/** Section slice selector for lazy dashboard hydration (T100396). Default CLI path is `full`. */
export type DashboardSummaryProjection = "full" | "overview" | "queue" | "status";
