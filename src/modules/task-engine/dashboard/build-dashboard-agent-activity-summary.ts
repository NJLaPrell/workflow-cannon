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
};

const SOURCE_RANK: Record<RowSource, number> = {
  live_activity: 0,
  team_execution: 1,
  subagent_registry: 2,
  derived: 3,
  future_runtime: 4
};

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

function freshnessState(lifecycle: AgentActivityLifecycle | "unknown"): DashboardAgentActivityRow["freshness"]["state"] {
  return lifecycle;
}

function attentionFromStatus(
  status: DashboardAgentActivityRow["status"],
  freshness: DashboardAgentActivityRow["freshness"]["state"]
): DashboardAgentActivityRow["attention"] {
  if (freshness === "stale") {
    return { state: "stale", message: "Lease is stale but still visible" };
  }
  if (freshness === "expired") {
    return { state: "stale", message: "Lease has expired" };
  }
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

function baseRow(candidate: Omit<RowCandidate, "sourceRank">, rank: RowSource): RowCandidate {
  return { ...candidate, sourceRank: SOURCE_RANK[rank] };
}

function mergeRow(existing: RowCandidate | undefined, candidate: RowCandidate): RowCandidate {
  if (!existing) {
    return candidate;
  }
  const winner = candidate.sourceRank <= existing.sourceRank ? candidate : existing;
  const loser = candidate.sourceRank <= existing.sourceRank ? existing : candidate;
  return {
    ...winner,
    displayName: cleanText(winner.displayName) || loser.displayName,
    statusLabel: cleanText(winner.statusLabel) || loser.statusLabel,
    work: {
      taskId: winner.work.taskId ?? loser.work.taskId,
      title: winner.work.title ?? loser.work.title,
      command: winner.work.command ?? loser.work.command,
      phaseKey: winner.work.phaseKey ?? loser.work.phaseKey,
      assignmentId: winner.work.assignmentId ?? loser.work.assignmentId,
      sessionId: winner.work.sessionId ?? loser.work.sessionId,
      currentStep: winner.work.currentStep ?? loser.work.currentStep
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
    freshness: winner.sourceRank <= existing.sourceRank ? winner.freshness : existing.freshness,
    attention: winner.sourceRank <= existing.sourceRank ? winner.attention : existing.attention
  };
}

function sortRows(rows: RowCandidate[]): DashboardAgentActivityRow[] {
  return rows
    .sort((a, b) => {
      const freshnessRank = (value: DashboardAgentActivityRow["freshness"]["state"]): number => {
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
      };
      const attentionRank = (value: DashboardAgentActivityRow["attention"]["state"]): number => {
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
      };
      const freshnessDelta = freshnessRank(a.freshness.state) - freshnessRank(b.freshness.state);
      if (freshnessDelta !== 0) {
        return freshnessDelta;
      }
      const attentionDelta = attentionRank(a.attention.state) - attentionRank(b.attention.state);
      if (attentionDelta !== 0) {
        return attentionDelta;
      }
      const updatedA = Date.parse(a.freshness.updatedAt ?? "");
      const updatedB = Date.parse(b.freshness.updatedAt ?? "");
      if (Number.isFinite(updatedA) && Number.isFinite(updatedB) && updatedA !== updatedB) {
        return updatedB - updatedA;
      }
      return a.rowId.localeCompare(b.rowId);
    })
    .map(({ sourceRank, ...row }) => row);
}

function attentionSeverityRank(value: DashboardAgentActivityRow["attention"]["state"]): number {
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

function buildLiveActivityRows(
  input: BuildDashboardAgentActivitySummaryInput,
  byTaskId: Map<string, TaskEntity>
): RowCandidate[] {
  return input.liveActivityLeases.map((lease) => {
    const lifecycle = deriveAgentActivityLifecycle(lease, input.now);
    const status = agentActivityLeaseToDashboardStatus(lease, input.now);
    const rowId = lease.assignmentId
      ? `assignment:${lease.assignmentId}`
      : lease.sessionId
        ? `session:${lease.sessionId}`
        : `activity:${lease.activityId}`;
    const taskTitleValue = taskTitle(lease.taskId, byTaskId) ?? lease.label;
    const displayName = cleanText(taskTitleValue) || lease.label;
    const freshness = {
      updatedAt: lease.updatedAt,
      startedAt: lease.startedAt,
      expiresAt: lease.expiresAt,
      state: freshnessState(lifecycle)
    };
    return baseRow(
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
          title: taskTitleValue,
          command: lease.command,
          phaseKey: lease.phaseKey,
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
        attention: attentionFromStatus(status.kind, freshness.state)
      },
      "live_activity"
    );
  });
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
  return input.teamExecution.topActive.map((assignment) => {
    const taskTitleValue = taskTitle(assignment.executionTaskId, byTaskId);
    const freshness = {
      updatedAt: assignment.updatedAt,
      startedAt: null,
      expiresAt: null,
      state: "unknown" as const
    };
    const status = assignmentToStatus(assignment);
    return baseRow(
      {
        schemaVersion: 1 as const,
        rowId: `assignment:${assignment.id}`,
        displayName: cleanText(taskTitleValue) || assignment.executionTaskId,
        role: "task_worker",
        source: "team_execution",
        sourceConfidence: "medium",
        status,
        statusLabel: assignmentToLabel(assignment),
        work: {
          taskId: assignment.executionTaskId,
          title: taskTitleValue,
          command: null,
          phaseKey: byTaskId.get(assignment.executionTaskId)?.phaseKey ?? null,
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
        attention: attentionFromStatus(status, freshness.state)
      },
      "team_execution"
    );
  });
}

function buildSubagentRows(
  input: BuildDashboardAgentActivitySummaryInput,
  byTaskId: Map<string, TaskEntity>
): RowCandidate[] {
  return input.subagentRegistry.topOpenSessions.map((session) => {
    const taskTitleValue = taskTitle(session.executionTaskId, byTaskId);
    const freshness = {
      updatedAt: session.updatedAt,
      startedAt: null,
      expiresAt: null,
      state: "unknown" as const
    };
    const status: DashboardAgentActivityRow["status"] = session.executionTaskId ? "delegating_task" : "awaiting_instruction";
    return baseRow(
      {
        schemaVersion: 1 as const,
        rowId: `session:${session.sessionId}`,
        displayName: cleanText(taskTitleValue) || session.definitionId,
        role: "subagent",
        source: "subagent_registry",
        sourceConfidence: "medium",
        status,
        statusLabel: session.status === "open" ? "Open session" : titleCase(session.status),
        work: {
          taskId: session.executionTaskId,
          title: taskTitleValue,
          command: null,
          phaseKey: byTaskId.get(session.executionTaskId ?? "")?.phaseKey ?? null,
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
        attention: attentionFromStatus(status, freshness.state)
      },
      "subagent_registry"
    );
  });
}

function buildDerivedFallbackRow(
  input: BuildDashboardAgentActivitySummaryInput
): DashboardAgentActivitySummary["inferredFallback"] {
  return input.derivedAgentStatus;
}

function rowBucket(row: RowCandidate): string {
  if (row.refs.assignmentId) {
    return `assignment:${row.refs.assignmentId}`;
  }
  if (row.refs.sessionId) {
    return `session:${row.refs.sessionId}`;
  }
  if (row.refs.activityId) {
    return `activity:${row.refs.activityId}`;
  }
  if (row.refs.taskId) {
    return `task:${row.refs.taskId}`;
  }
  return row.rowId;
}

function toRows(candidates: RowCandidate[]): DashboardAgentActivityRow[] {
  const buckets = new Map<string, RowCandidate[]>();
  for (const candidate of candidates) {
    const bucket = rowBucket(candidate);
    const bucketRows = buckets.get(bucket) ?? [];
    bucketRows.push(candidate);
    buckets.set(bucket, bucketRows);
  }

  const merged: RowCandidate[] = [];
  for (const bucketRows of buckets.values()) {
    bucketRows.sort((a, b) => a.sourceRank - b.sourceRank);
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
  const liveFresh = rows.find((row) => row.source === "live_activity" && (row.freshness.state === "fresh" || row.freshness.state === "aging"));
  if (liveFresh) {
    return liveFresh;
  }
  const fresh = rows.find((row) => row.freshness.state === "fresh" || row.freshness.state === "aging");
  if (fresh) {
    return fresh;
  }
  const attention = rows.slice().sort((a, b) => attentionSeverityRank(a.attention.state) - attentionSeverityRank(b.attention.state))[0];
  if (attention && attention.attention.state !== "none") {
    return attention;
  }
  return rows[0] ?? null;
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
  const active = rows.filter((row) => row.freshness.state === "fresh" || row.freshness.state === "aging");
  const needsAttention = rows.filter(
    (row) => row.attention.state !== "none" || row.freshness.state === "stale" || row.freshness.state === "expired"
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
    activeCount: active.length,
    staleCount: rows.filter((row) => row.freshness.state === "stale").length,
    needsAttentionCount: needsAttention.length,
    main: selectMainRow(rows),
    active,
    needsAttention,
    inferredFallback: rows.length === 0 ? buildDerivedFallbackRow(input) : null,
    sourceMap: {
      liveActivityCount: input.liveActivityLeases.length,
      teamExecutionCount: input.teamExecution.topActive.length,
      subagentSessionCount: input.subagentRegistry.topOpenSessions.length,
      derivedFallbackUsed: rows.length === 0
    }
  };
}