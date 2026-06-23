import type {
  DashboardAgentActivityRow,
  DashboardAgentActivitySummary,
  DashboardAgentStatusSummary,
  DashboardSubagentRegistrySummary,
  DashboardTeamAssignmentRow,
  DashboardTeamExecutionSummary
} from "../../../contracts/dashboard-summary-run.js";
import type { AgentActivityLease, AgentActivityLifecycle } from "../agent-activity-store.js";
import { agentActivityLeaseToDashboardStatus, agentActivityLifecycleConfidence, deriveAgentActivityLifecycle } from "../agent-activity-store.js";
import type { TaskEntity } from "../types.js";

export type BuildDashboardAgentActivitySummaryInput = {
  now: string;
  tasks: TaskEntity[];
  liveActivityLeases: AgentActivityLease[];
  derivedAgentStatus: DashboardAgentStatusSummary;
  teamExecution: DashboardTeamExecutionSummary;
  subagentRegistry: DashboardSubagentRegistrySummary;
};

type RowSource = DashboardAgentActivityRow["source"];

type RowCandidate = DashboardAgentActivityRow & {
  sourceRank: number;
  mergeKey: string;
  freshnessRank: number;
  attentionRank: number;
  sourceUpdatedAtMs: number;
};

const SOURCE_RANK: Record<RowSource, number> = {
  live_activity: 0,
  team_execution: 1,
  subagent_registry: 2,
  derived: 3,
  future_runtime: 4
};

const DISPLAY_NAME_PRIORITY = {
  live: 0,
  task: 1,
  label: 2,
  agent: 3
} as const;

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function titleCase(value: string): string {
  return value
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

const MODEL_TIER_LABELS: Record<string, string> = {
  cheap_fast: "Fast",
  balanced: "Balanced",
  high_reasoning: "High reasoning",
  specialist: "Specialist",
  human_review: "Human review"
};

function modelTierThinkingLabel(modelTier: string | null | undefined): string | null {
  const tier = cleanText(modelTier);
  if (!tier) {
    return null;
  }
  return MODEL_TIER_LABELS[tier] ?? titleCase(tier);
}

/** Extract Cursor-style thinking/reasoning level from a model slug when present. */
export function parseThinkingLevelFromModelHint(modelHint: string | null | undefined): string | null {
  const hint = cleanText(modelHint);
  if (!hint) {
    return null;
  }
  const thinkingMatch = hint.match(/-thinking(?:-([a-z0-9-]+))?$/i);
  if (thinkingMatch) {
    const suffix = cleanText(thinkingMatch[1]);
    return suffix ? titleCase(suffix) : "Thinking";
  }
  const levelMatch = hint.match(/-(high|medium|low|max)$/i);
  if (levelMatch) {
    return titleCase(levelMatch[1]!);
  }
  return null;
}

function resolveAgentTypeLabel(args: {
  agentDefinitionId?: string | null;
  subagentDefinitionId?: string | null;
  role: DashboardAgentActivityRow["role"];
}): string | null {
  const definitionId = cleanText(args.agentDefinitionId) || cleanText(args.subagentDefinitionId);
  if (definitionId) {
    return titleCase(definitionId);
  }
  switch (args.role) {
    case "orchestrator":
      return "Orchestrator";
    case "task_worker":
      return "Task worker";
    case "subagent":
      return "Subagent";
    default:
      return null;
  }
}

function buildAgentProfile(args: {
  agentDefinitionId?: string | null;
  subagentDefinitionId?: string | null;
  role: DashboardAgentActivityRow["role"];
  agentId?: string | null;
  displayName?: string | null;
  modelTier?: string | null;
  modelHint?: string | null;
  details?: Record<string, unknown> | null;
}): DashboardAgentActivityRow["agentProfile"] {
  const model = cleanText(args.modelHint) || null;
  const thinkingFromHint = parseThinkingLevelFromModelHint(model);
  const thinkingFromDetails = readDetailText(args.details, ["thinkingLevel", "thinking_level"]);
  const thinkingLevel =
    thinkingFromHint ||
    (thinkingFromDetails ? titleCase(thinkingFromDetails) : null) ||
    modelTierThinkingLabel(args.modelTier);
  const agentNameOrId =
    cleanText(args.displayName) ||
    cleanText(readDetailText(args.details, ["agentDisplayName", "customAgentName"])) ||
    cleanText(args.agentId) ||
    null;
  const agentType = resolveAgentTypeLabel(args);
  if (!agentType && !model && !thinkingLevel && !agentNameOrId) {
    return undefined;
  }
  return {
    agentType,
    model,
    thinkingLevel,
    agentNameOrId
  };
}

function mergeAgentProfile(
  winner: DashboardAgentActivityRow["agentProfile"] | undefined,
  loser: DashboardAgentActivityRow["agentProfile"] | undefined
): DashboardAgentActivityRow["agentProfile"] | undefined {
  if (!winner && !loser) {
    return undefined;
  }
  return {
    agentType: winner?.agentType ?? loser?.agentType ?? null,
    model: winner?.model ?? loser?.model ?? null,
    thinkingLevel: winner?.thinkingLevel ?? loser?.thinkingLevel ?? null,
    agentNameOrId: winner?.agentNameOrId ?? loser?.agentNameOrId ?? null
  };
}

function isoMillis(value: string | null): number {
  return value ? Date.parse(value) : Number.NaN;
}

function taskMap(tasks: TaskEntity[]): Map<string, TaskEntity> {
  return new Map(tasks.map((task) => [task.id, task] as const));
}

function taskTitle(taskId: string | null, byId: Map<string, TaskEntity>): string | null {
  if (!taskId) {
    return null;
  }
  const task = byId.get(taskId);
  return task ? task.title : null;
}

function taskPhaseKey(taskId: string | null, byId: Map<string, TaskEntity>): string | null {
  if (!taskId) {
    return null;
  }
  return byId.get(taskId)?.phaseKey ?? null;
}

function taskStatus(taskId: string | null, byId: Map<string, TaskEntity>): string | null {
  if (!taskId) {
    return null;
  }
  return byId.get(taskId)?.status ?? null;
}

function taskDisplayName(taskId: string | null, byId: Map<string, TaskEntity>): string | null {
  if (!taskId) {
    return null;
  }
  const task = byId.get(taskId);
  if (!task) {
    return taskId;
  }
  const title = cleanText(task.title);
  return title ? `${taskId} · ${title}` : taskId;
}

function readDetailText(details: Record<string, unknown> | null | undefined, keys: string[]): string {
  if (!details || typeof details !== "object" || Array.isArray(details)) {
    return "";
  }
  for (const key of keys) {
    const value = cleanText(details[key]);
    if (value) {
      return value;
    }
  }
  return "";
}

function readKnownDetailMetadata(
  details: Record<string, unknown> | null | undefined
): DashboardAgentActivityRow["metadata"] | undefined {
  if (!details || typeof details !== "object" || Array.isArray(details)) {
    return undefined;
  }
  const metadata: NonNullable<DashboardAgentActivityRow["metadata"]> = {};
  const agentDisplayName = readDetailText(details, ["agentDisplayName"]);
  const customAgentName = readDetailText(details, ["customAgentName"]);
  if (agentDisplayName) {
    metadata.agentDisplayName = agentDisplayName;
  }
  if (customAgentName) {
    metadata.customAgentName = customAgentName;
  }
  return Object.keys(metadata).length > 0 ? metadata : undefined;
}

function mergeMetadata(
  winner: DashboardAgentActivityRow["metadata"] | undefined,
  loser: DashboardAgentActivityRow["metadata"] | undefined
): DashboardAgentActivityRow["metadata"] | undefined {
  const metadata = {
    ...(loser ?? {}),
    ...(winner ?? {})
  };
  return Object.keys(metadata).length > 0 ? metadata : undefined;
}

function freshnessState(lifecycle: AgentActivityLifecycle | "unknown"): DashboardAgentActivityRow["freshness"]["state"] {
  return lifecycle;
}

function freshnessRank(value: DashboardAgentActivityRow["freshness"]["state"]): number {
  switch (value) {
    case "fresh":
      return 0;
    case "aging":
      return 1;
    case "unknown":
      return 2;
    case "stale":
      return 3;
    case "expired":
      return 4;
  }
}

function attentionRank(value: DashboardAgentActivityRow["attention"]["state"]): number {
  switch (value) {
    case "blocked":
      return 0;
    case "needs_policy":
      return 1;
    case "needs_human":
      return 2;
    case "stale":
      return 3;
    case "failed":
      return 4;
    case "unavailable":
      return 5;
    case "none":
    default:
      return 6;
  }
}

function roleRank(value: DashboardAgentActivityRow["role"]): number {
  switch (value) {
    case "orchestrator":
      return 0;
    case "task_worker":
      return 1;
    case "subagent":
      return 2;
    case "unknown":
    default:
      return 3;
  }
}

function displayNameRank(value: string, source: DashboardAgentActivityRow["source"]): number {
  if (source === "live_activity" && value) {
    return DISPLAY_NAME_PRIORITY.live;
  }
  if (source === "team_execution" && value) {
    return DISPLAY_NAME_PRIORITY.task;
  }
  if (source === "subagent_registry" && value) {
    return DISPLAY_NAME_PRIORITY.label;
  }
  return value ? DISPLAY_NAME_PRIORITY.agent : DISPLAY_NAME_PRIORITY.agent;
}

function displayNameBest(existing: RowCandidate, candidate: RowCandidate): RowCandidate {
  const existingRank = displayNameRank(existing.displayName, existing.source);
  const candidateRank = displayNameRank(candidate.displayName, candidate.source);
  if (candidateRank < existingRank) {
    return candidate;
  }
  if (candidateRank > existingRank) {
    return existing;
  }
  if (candidate.sourceRank < existing.sourceRank) {
    return candidate;
  }
  if (candidate.sourceRank > existing.sourceRank) {
    return existing;
  }
  return candidate.sourceUpdatedAtMs > existing.sourceUpdatedAtMs ? candidate : existing;
}

function roleBest(existing: RowCandidate, candidate: RowCandidate): RowCandidate {
  if (roleRank(candidate.role) < roleRank(existing.role)) {
    return candidate;
  }
  if (roleRank(candidate.role) > roleRank(existing.role)) {
    return existing;
  }
  return candidate.sourceRank < existing.sourceRank
    ? candidate
    : candidate.sourceRank > existing.sourceRank
      ? existing
      : candidate.sourceUpdatedAtMs > existing.sourceUpdatedAtMs
        ? candidate
        : existing;
}

function attentionBest(existing: RowCandidate, candidate: RowCandidate): RowCandidate {
  if (attentionRank(candidate.attention.state) < attentionRank(existing.attention.state)) {
    return candidate;
  }
  if (attentionRank(candidate.attention.state) > attentionRank(existing.attention.state)) {
    return existing;
  }
  if (candidate.sourceRank < existing.sourceRank) {
    return candidate;
  }
  if (candidate.sourceRank > existing.sourceRank) {
    return existing;
  }
  return candidate.sourceUpdatedAtMs > existing.sourceUpdatedAtMs ? candidate : existing;
}

function freshnessBest(existing: RowCandidate, candidate: RowCandidate): RowCandidate {
  const existingLive = existing.source === "live_activity";
  const candidateLive = candidate.source === "live_activity";
  if (candidateLive && !existingLive) {
    return candidate;
  }
  if (!candidateLive && existingLive) {
    return existing;
  }
  const existingMs = isoMillis(existing.freshness.updatedAt);
  const candidateMs = isoMillis(candidate.freshness.updatedAt);
  if (Number.isFinite(candidateMs) && Number.isFinite(existingMs)) {
    return candidateMs > existingMs ? candidate : existing;
  }
  if (Number.isFinite(candidateMs)) {
    return candidate;
  }
  if (Number.isFinite(existingMs)) {
    return existing;
  }
  return candidate.sourceRank < existing.sourceRank
    ? candidate
    : candidate.sourceRank > existing.sourceRank
      ? existing
      : candidate.sourceUpdatedAtMs > existing.sourceUpdatedAtMs
        ? candidate
        : existing;
}

function attentionFromStatus(
  status: DashboardAgentActivityRow["status"],
  freshness: DashboardAgentActivityRow["freshness"]["state"]
): DashboardAgentActivityRow["attention"] {
  switch (status) {
    case "blocked":
      return { state: "blocked", message: "Blocking work" };
    case "awaiting_policy_approval":
      return { state: "needs_policy", message: "Awaiting policy approval" };
    case "awaiting_human_gate":
    case "reviewing_item":
      return { state: "needs_human", message: "Awaiting human review" };
    case "unavailable":
      return { state: "unavailable", message: "Agent activity unavailable" };
    default:
      if (freshness === "stale") {
        return { state: "stale", message: "Heartbeat overdue" };
      }
      return { state: "none", message: null };
  }
}

function roleFromAgentId(agentId: string | null, kind: DashboardAgentActivityRow["status"]): DashboardAgentActivityRow["role"] {
  const value = cleanText(agentId).toLowerCase();
  if (value.includes("orchestrator") || value.includes("supervisor")) {
    return "orchestrator";
  }
  if (value.includes("worker") || kind === "working_task" || kind === "delegating_task") {
    return "task_worker";
  }
  return "unknown";
}

function normalizeRowId(parts: string[]): string {
  return `row:${parts.map((part) => cleanText(part) || "unknown").join(":")}`;
}

function sourceUpdatedAtMs(value: string): number {
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : Number.NEGATIVE_INFINITY;
}

function makeRow(
  row: Omit<RowCandidate, "sourceRank" | "mergeKey" | "freshnessRank" | "attentionRank" | "sourceUpdatedAtMs">,
  source: RowSource,
  keyParts: string[]
): RowCandidate {
  const sourceRank = SOURCE_RANK[source];
  return {
    ...row,
    sourceRank,
    mergeKey: keyParts.join("|"),
    freshnessRank: freshnessRank(row.freshness.state),
    attentionRank: attentionRank(row.attention.state),
    sourceUpdatedAtMs: sourceUpdatedAtMs(row.freshness.updatedAt ?? "")
  };
}

function mergeRow(existing: RowCandidate | undefined, candidate: RowCandidate): RowCandidate {
  if (!existing) {
    return candidate;
  }
  const winner =
    candidate.sourceRank < existing.sourceRank
      ? candidate
      : candidate.sourceRank > existing.sourceRank
        ? existing
        : candidate.sourceUpdatedAtMs > existing.sourceUpdatedAtMs
          ? candidate
          : existing;
  const loser = winner === candidate ? existing : candidate;
    return {
      ...winner,
      displayName: displayNameBest(winner, loser).displayName,
      role: roleBest(winner, loser).role,
      statusLabel: cleanText(winner.statusLabel) || cleanText(loser.statusLabel) || winner.statusLabel,
      work: {
        taskId: winner.work.taskId ?? loser.work.taskId,
        title: cleanText(winner.work.title) || loser.work.title,
        command: cleanText(winner.work.command) || loser.work.command,
        phaseKey: winner.work.phaseKey ?? loser.work.phaseKey,
        taskStatus: winner.work.taskStatus ?? loser.work.taskStatus,
        assignmentId: winner.work.assignmentId ?? loser.work.assignmentId,
        sessionId: winner.work.sessionId ?? loser.work.sessionId,
        currentStep: cleanText(winner.work.currentStep) || loser.work.currentStep
      },
    refs: {
      activityId: winner.refs.activityId ?? loser.refs.activityId,
      agentId: winner.refs.agentId ?? loser.refs.agentId,
      sessionId: winner.refs.sessionId ?? loser.refs.sessionId,
      assignmentId: winner.refs.assignmentId ?? loser.refs.assignmentId,
      agentDefinitionId: winner.refs.agentDefinitionId ?? loser.refs.agentDefinitionId,
      subagentDefinitionId: winner.refs.subagentDefinitionId ?? loser.refs.subagentDefinitionId,
      taskId: winner.refs.taskId ?? loser.refs.taskId,
      prNumber: winner.refs.prNumber ?? loser.refs.prNumber
    },
    freshness: freshnessBest(winner, loser).freshness,
    attention: attentionBest(winner, loser).attention,
    metadata: mergeMetadata(winner.metadata, loser.metadata),
    agentProfile: mergeAgentProfile(winner.agentProfile, loser.agentProfile)
  };
}

function sortRows(rows: RowCandidate[]): DashboardAgentActivityRow[] {
  return rows
    .sort((a, b) => {
      const freshnessDelta = a.freshnessRank - b.freshnessRank;
      if (freshnessDelta !== 0) {
        return freshnessDelta;
      }
      const attentionDelta = a.attentionRank - b.attentionRank;
      if (attentionDelta !== 0) {
        return attentionDelta;
      }
      const updatedA = isoMillis(a.freshness.updatedAt);
      const updatedB = isoMillis(b.freshness.updatedAt);
      if (Number.isFinite(updatedA) && Number.isFinite(updatedB) && updatedA !== updatedB) {
        return updatedB - updatedA;
      }
      return a.rowId.localeCompare(b.rowId);
    })
    .map(({ sourceRank, mergeKey, freshnessRank: _freshnessRank, attentionRank: _attentionRank, sourceUpdatedAtMs, ...row }) => row);
}

function sortAttentionRows(rows: DashboardAgentActivityRow[]): DashboardAgentActivityRow[] {
  return rows
    .sort((a, b) => {
      const attentionDelta = attentionRank(a.attention.state) - attentionRank(b.attention.state);
      if (attentionDelta !== 0) {
        return attentionDelta;
      }
      const updatedA = isoMillis(a.freshness.updatedAt);
      const updatedB = isoMillis(b.freshness.updatedAt);
      if (Number.isFinite(updatedA) && Number.isFinite(updatedB) && updatedA !== updatedB) {
        return updatedB - updatedA;
      }
      return a.rowId.localeCompare(b.rowId);
    })
    .map((row) => row);
}

function buildLiveActivityRows(
  input: BuildDashboardAgentActivitySummaryInput,
  byTaskId: Map<string, TaskEntity>
): RowCandidate[] {
  const byKey = new Map<string, RowCandidate>();
  for (const lease of input.liveActivityLeases) {
    const lifecycle = deriveAgentActivityLifecycle(lease, input.now);
    if (lifecycle === "expired") {
      continue;
    }
    const status = agentActivityLeaseToDashboardStatus(lease, input.now);
    const displayName =
      cleanText(taskDisplayName(lease.taskId, byTaskId)) ||
      cleanText(readDetailText(lease.details, ["agentDisplayName", "customAgentName", "displayName"])) ||
      cleanText(lease.label) ||
      cleanText(lease.agentId) ||
      titleCase(lease.agentId);
    const taskTitleValue = taskTitle(lease.taskId, byTaskId);
    const keyParts = lease.assignmentId
      ? [lease.assignmentId]
      : lease.sessionId
        ? [lease.agentId, lease.sessionId]
        : lease.taskId
          ? [lease.agentId, lease.taskId]
          : [lease.activityId];
    const rowId = normalizeRowId(keyParts);
    const freshness = {
      updatedAt: lease.updatedAt,
      startedAt: lease.startedAt,
      expiresAt: lease.expiresAt,
      state: freshnessState(lifecycle)
    };
    const candidate = makeRow(
      {
        schemaVersion: 1 as const,
        rowId,
        displayName,
        role: roleFromAgentId(lease.agentId, status.kind),
        source: "live_activity",
        sourceConfidence: agentActivityLifecycleConfidence(lifecycle),
        status: status.kind,
        statusLabel: status.label,
        work: {
          taskId: lease.taskId,
          title: taskTitleValue ?? lease.label,
          command: lease.command,
          phaseKey: lease.phaseKey ?? taskPhaseKey(lease.taskId, byTaskId),
          taskStatus: taskStatus(lease.taskId, byTaskId),
          assignmentId: lease.assignmentId,
          sessionId: lease.sessionId,
          currentStep: lease.currentStep
        },
        refs: {
          activityId: lease.activityId,
          agentId: lease.agentId,
          sessionId: lease.sessionId,
          assignmentId: lease.assignmentId,
          agentDefinitionId: lease.agentDefinitionId,
          subagentDefinitionId: null,
          taskId: lease.taskId,
          prNumber: lease.prNumber
        },
        freshness,
        attention: attentionFromStatus(status.kind, freshness.state),
        metadata: readKnownDetailMetadata(lease.details),
        agentProfile: buildAgentProfile({
          agentDefinitionId: lease.agentDefinitionId,
          role: roleFromAgentId(lease.agentId, status.kind),
          agentId: lease.agentId,
          displayName,
          modelTier: lease.modelTier,
          modelHint: lease.modelHint,
          details: lease.details
        })
      },
      "live_activity",
      keyParts
    );
    const current = byKey.get(candidate.mergeKey);
    if (!current || candidate.sourceUpdatedAtMs > current.sourceUpdatedAtMs) {
      byKey.set(candidate.mergeKey, candidate);
    }
  }
  return [...byKey.values()];
}

function assignmentToStatus(assignment: DashboardTeamAssignmentRow): DashboardAgentActivityRow["status"] {
  switch (assignment.status) {
    case "blocked":
      return "blocked";
    case "submitted":
      return "validating";
    case "assigned":
    default:
      return "working_task";
  }
}

function assignmentToLabel(assignment: DashboardTeamAssignmentRow): string {
  switch (assignment.status) {
    case "blocked":
      return `Blocked · ${assignment.executionTaskId}`;
    case "submitted":
      return `Submitted · ${assignment.executionTaskId}`;
    case "assigned":
    default:
      return `Assigned · ${assignment.executionTaskId}`;
  }
}

function buildAssignmentRows(
  input: BuildDashboardAgentActivitySummaryInput,
  byTaskId: Map<string, TaskEntity>
): RowCandidate[] {
  const byKey = new Map<string, RowCandidate>();
  for (const assignment of input.teamExecution.topActive) {
    const taskTitleValue = taskTitle(assignment.executionTaskId, byTaskId);
    const freshness = {
      updatedAt: assignment.updatedAt,
      startedAt: null,
      expiresAt: null,
      state: "unknown" as const
    };
    const status = assignmentToStatus(assignment);
    const keyParts = [assignment.id];
    const candidate = makeRow(
      {
        schemaVersion: 1 as const,
        rowId: normalizeRowId(keyParts),
        displayName:
          cleanText(taskDisplayName(assignment.executionTaskId, byTaskId)) ||
          cleanText(assignment.executionTaskTitle) ||
          cleanText(assignment.executionTaskId) ||
          cleanText(assignment.workerId) ||
          titleCase(assignment.workerId),
        role: "task_worker",
        source: "team_execution",
        sourceConfidence: "medium",
        status,
        statusLabel: assignmentToLabel(assignment),
        work: {
          taskId: assignment.executionTaskId,
          title: taskTitleValue,
          command: null,
          phaseKey: taskPhaseKey(assignment.executionTaskId, byTaskId),
          taskStatus: taskStatus(assignment.executionTaskId, byTaskId),
          assignmentId: assignment.id,
          sessionId: null,
          currentStep: null
        },
        refs: {
          activityId: null,
          agentId: assignment.workerId,
          sessionId: null,
          assignmentId: assignment.id,
          agentDefinitionId: null,
          subagentDefinitionId: null,
          taskId: assignment.executionTaskId,
          prNumber: null
        },
        freshness,
        attention: attentionFromStatus(status, freshness.state),
        agentProfile: buildAgentProfile({
          role: "task_worker",
          agentId: assignment.workerId,
          displayName:
            cleanText(taskDisplayName(assignment.executionTaskId, byTaskId)) ||
            cleanText(assignment.executionTaskTitle) ||
            cleanText(assignment.workerId)
        })
      },
      "team_execution",
      keyParts
    );
    const current = byKey.get(candidate.mergeKey);
    if (!current || candidate.sourceUpdatedAtMs > current.sourceUpdatedAtMs) {
      byKey.set(candidate.mergeKey, candidate);
    }
  }
  return [...byKey.values()];
}

function buildSubagentRows(
  input: BuildDashboardAgentActivitySummaryInput,
  byTaskId: Map<string, TaskEntity>
): RowCandidate[] {
  const byKey = new Map<string, RowCandidate>();
  for (const session of input.subagentRegistry.topOpenSessions) {
    const taskTitleValue = taskTitle(session.executionTaskId, byTaskId);
    const freshness = {
      updatedAt: session.updatedAt,
      startedAt: null,
      expiresAt: null,
      state: "unknown" as const
    };
    const status: DashboardAgentActivityRow["status"] = session.executionTaskId ? "delegating_task" : "awaiting_instruction";
    const candidate = makeRow(
      {
        schemaVersion: 1 as const,
        rowId: normalizeRowId([session.definitionId, session.sessionId]),
        displayName:
          cleanText(taskDisplayName(session.executionTaskId, byTaskId)) ||
          titleCase(session.definitionId) ||
          cleanText(session.definitionId) ||
          cleanText(session.sessionId),
        role: "subagent",
        source: "subagent_registry",
        sourceConfidence: "medium",
        status,
        statusLabel: session.status === "open" ? "Open session" : titleCase(session.status),
        work: {
          taskId: session.executionTaskId,
          title: taskTitleValue,
          command: null,
          phaseKey: taskPhaseKey(session.executionTaskId, byTaskId),
          taskStatus: taskStatus(session.executionTaskId, byTaskId),
          assignmentId: null,
          sessionId: session.sessionId,
          currentStep: null
        },
        refs: {
          activityId: null,
          agentId: session.definitionId,
          sessionId: session.sessionId,
          assignmentId: null,
          agentDefinitionId: session.definitionId,
          subagentDefinitionId: session.definitionId,
          taskId: session.executionTaskId,
          prNumber: null
        },
        freshness,
        attention: attentionFromStatus(status, freshness.state),
        agentProfile: buildAgentProfile({
          agentDefinitionId: session.definitionId,
          subagentDefinitionId: session.definitionId,
          role: "subagent",
          agentId: session.definitionId,
          displayName:
            cleanText(taskDisplayName(session.executionTaskId, byTaskId)) ||
            titleCase(session.definitionId)
        })
      },
      "subagent_registry",
      [session.definitionId, session.sessionId]
    );
    const current = byKey.get(candidate.mergeKey);
    if (!current || candidate.sourceUpdatedAtMs > current.sourceUpdatedAtMs) {
      byKey.set(candidate.mergeKey, candidate);
    }
  }
  return [...byKey.values()];
}

function buildDerivedFallbackRow(
  input: BuildDashboardAgentActivitySummaryInput
): DashboardAgentActivitySummary["inferredFallback"] {
  return input.derivedAgentStatus;
}

function toRows(candidates: RowCandidate[]): DashboardAgentActivityRow[] {
  const buckets = new Map<string, RowCandidate[]>();
  for (const candidate of candidates) {
    const bucket = candidate.mergeKey;
    const bucketRows = buckets.get(bucket) ?? [];
    bucketRows.push(candidate);
    buckets.set(bucket, bucketRows);
  }

  const merged: RowCandidate[] = [];
  for (const bucketRows of buckets.values()) {
    bucketRows.sort((a, b) => {
      if (a.sourceRank !== b.sourceRank) {
        return a.sourceRank - b.sourceRank;
      }
      if (a.sourceUpdatedAtMs !== b.sourceUpdatedAtMs) {
        return b.sourceUpdatedAtMs - a.sourceUpdatedAtMs;
      }
      return a.rowId.localeCompare(b.rowId);
    });
    let current = bucketRows[0]!;
    for (let index = 1; index < bucketRows.length; index++) {
      current = mergeRow(current, bucketRows[index]!);
    }
    merged.push(current);
  }
  return sortRows(merged);
}

function selectMainRow(rows: DashboardAgentActivityRow[]): DashboardAgentActivityRow | null {
  if (rows.length === 0) {
    return null;
  }
  const activeRows = rows.filter((row) => row.freshness.state === "fresh" || row.freshness.state === "aging");
  const liveOrchestrator = activeRows.find(
    (row) =>
      row.source === "live_activity" &&
      (row.role === "orchestrator") &&
      (row.freshness.state === "fresh" || row.freshness.state === "aging")
  );
  if (liveOrchestrator) {
    return liveOrchestrator;
  }
  const liveFresh = activeRows.find((row) => row.source === "live_activity");
  if (liveFresh) {
    return liveFresh;
  }
  const attention = rows
    .slice()
    .sort((a, b) => {
      const rankDelta = attentionRank(a.attention.state) - attentionRank(b.attention.state);
      if (rankDelta !== 0) {
        return rankDelta;
      }
      const updatedA = isoMillis(a.freshness.updatedAt);
      const updatedB = isoMillis(b.freshness.updatedAt);
      if (Number.isFinite(updatedA) && Number.isFinite(updatedB) && updatedA !== updatedB) {
        return updatedB - updatedA;
      }
      return a.rowId.localeCompare(b.rowId);
    })[0];
  if (attention && attention.attention.state !== "none") {
    return attention;
  }
  const activeByUpdatedAt = activeRows.slice().sort((a, b) => {
    const updatedA = isoMillis(a.freshness.updatedAt);
    const updatedB = isoMillis(b.freshness.updatedAt);
    if (Number.isFinite(updatedA) && Number.isFinite(updatedB) && updatedA !== updatedB) {
      return updatedB - updatedA;
    }
    return a.rowId.localeCompare(b.rowId);
  });
  return activeByUpdatedAt[0] ?? null;
}

export function buildDashboardAgentActivitySummary(
  input: BuildDashboardAgentActivitySummaryInput
): DashboardAgentActivitySummary {
  const byTaskId = taskMap(input.tasks);
  const rawRows = [
    ...buildLiveActivityRows(input, byTaskId),
    ...buildAssignmentRows(input, byTaskId),
    ...buildSubagentRows(input, byTaskId)
  ];
  const rows = toRows(rawRows);
  const active = rows.filter((row) => row.freshness.state !== "expired");
  const needsAttention = rows.filter(
    (row) => row.attention.state !== "none"
  );
  const source =
    rows.some((row) => row.source === "live_activity") && rows.some((row) => row.source !== "live_activity")
      ? "mixed"
      : rows.some((row) => row.source === "live_activity")
        ? "live_activity"
        : "derived_only";
  return {
    schemaVersion: 1,
    generatedAt: input.now,
    source,
    activeCount: rows.filter((row) => row.freshness.state === "fresh" || row.freshness.state === "aging").length,
    staleCount: rows.filter((row) => row.freshness.state === "stale").length,
    needsAttentionCount: needsAttention.length,
    main: selectMainRow(rows),
    active,
    needsAttention: sortAttentionRows(needsAttention),
    inferredFallback: rows.length === 0 ? buildDerivedFallbackRow(input) : null,
    sourceMap: {
      liveActivityCount: input.liveActivityLeases.length,
      teamExecutionCount: input.teamExecution.topActive.length,
      subagentSessionCount: input.subagentRegistry.topOpenSessions.length,
      derivedFallbackUsed: rows.length === 0
    }
  };
}
