/**
 * Versioned read-model contract for agent-facing task surfaces.
 *
 * These types describe what agents may rely on across `get-next-actions`,
 * `list-tasks`, `get-task`, `queue-health`, `dashboard-summary`, dependency
 * graph, and evidence/history reads. Runtime storage may stay relational,
 * blob-backed, or mixed; agents should consume these read models instead of
 * reaching into SQLite tables or JSON mirrors directly.
 */

export type AgentTaskReadContractVersion = 1;

export type AgentTaskStatus =
  | "research"
  | "proposed"
  | "ready"
  | "in_progress"
  | "blocked"
  | "completed"
  | "cancelled";

export type AgentTaskPriority = "P1" | "P2" | "P3";

export type AgentTaskPhaseRef = {
  /** Stable phase key, e.g. `"75"`; `null` when legacy/imported rows have no phase. */
  phaseKey: string | null;
  /** Human label, e.g. `"Phase 75"`; `null` when absent. */
  phase: string | null;
  /** Whether the row is aligned with the current workspace phase when known. */
  phaseAligned: boolean | null;
};

export type AgentTaskRoutingMetadata = {
  /** Execution ownership lane such as `task-engine`, `context-activation`, or `cursor-extension`. */
  ownership: string | null;
  /** Queue namespace used by next-action filtering; defaults to `"default"` when unset. */
  queueNamespace: string;
  /** Feature taxonomy slugs exposed through stable projections, not ad hoc metadata parsing. */
  features: string[];
  /** Optional source/provenance token when a task was generated from planning, transcript, or wishlist flows. */
  source: string | null;
  /** Raw module-specific metadata is intentionally not part of the stable routing contract. */
  hasModuleMetadata: boolean;
  /** Promoted from `metadata.category` / relational `routing_category`; filter agents use instead of JSON walks. */
  category: string | null;
  /** Promoted from `metadata.tags` / relational `routing_tags_json`. */
  tags: string[];
  /** Improvement / triage tier when present (`metadata.confidenceTier`). */
  confidenceTier: string | null;
  /** Blocked-task taxonomy bucket when present (`metadata.blockedReasonCategory`). */
  blockedReasonCategory: string | null;
};

export type AgentTaskDependencyEdge = {
  taskId: string;
  dependsOnTaskId: string;
  /** `true` when the dependency task is completed in the same task snapshot. */
  satisfied: boolean;
  dependencyStatus: AgentTaskStatus | "missing";
};

export type AgentTaskEvidencePointer = {
  kind: "delivery" | "transition" | "mutation" | "waiver";
  taskId: string;
  id: string | null;
  timestamp: string | null;
  summary: string | null;
  /**
   * Command agents can run for details when available, e.g. `get-task-history`.
   * Keep as display/copy text; consumers should not parse it for semantics.
   */
  detailCommand: string | null;
};

export type AgentTaskQueueHint = {
  blockedByDependencies: boolean;
  unmetDependencies: string[];
  blockedReason: "dependencies" | "status" | "phase_mismatch" | null;
};

export type AgentTaskListItem = {
  contractVersion: AgentTaskReadContractVersion;
  id: string;
  title: string;
  status: AgentTaskStatus;
  type: string;
  priority: AgentTaskPriority | null;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
  phase: AgentTaskPhaseRef;
  routing: AgentTaskRoutingMetadata;
  dependencies: {
    dependsOn: string[];
    unblocks: string[];
    edges: AgentTaskDependencyEdge[];
  };
  queue: AgentTaskQueueHint;
  evidence: {
    delivery: AgentTaskEvidencePointer | null;
    latestTransition: AgentTaskEvidencePointer | null;
    latestMutation: AgentTaskEvidencePointer | null;
  };
};

export type AgentTaskDetail = AgentTaskListItem & {
  summary: string | null;
  description: string | null;
  approach: string | null;
  risk: string | null;
  technicalScope: string[];
  acceptanceCriteria: string[];
  recentEvidence: AgentTaskEvidencePointer[];
};

export type AgentTaskNextActions = {
  contractVersion: AgentTaskReadContractVersion;
  readyQueue: AgentTaskListItem[];
  suggestedNext: AgentTaskListItem | null;
  stateSummary: Record<AgentTaskStatus | "total", number>;
  blockingAnalysis: Array<{
    taskId: string;
    blockedBy: string[];
    blockingCount: number;
  }>;
};

export type AgentTaskReadEnvelope<TData> = {
  ok: true;
  code: string;
  data: TData;
  /** Present on task-engine reads from stores with optimistic concurrency. */
  planningGeneration: number | null;
  planningGenerationPolicy: "off" | "warn" | "require" | null;
};
