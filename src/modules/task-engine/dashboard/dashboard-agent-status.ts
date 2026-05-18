import type {
  DashboardAgentStatusSummary,
  DashboardSystemStatus,
  DashboardSubagentRegistrySummary,
  DashboardTeamExecutionSummary
} from "../../../contracts/dashboard-summary-run.js";
import { humanGateAgeMs, humanGateResumeCommand, isHumanGateStatus } from "../human-gate.js";
import type { HumanGateRecord } from "../human-gate.js";
import type { NextActionSuggestion, TaskEntity } from "../types.js";

export type BuildDashboardAgentStatusInput = {
  now: string;
  tasks: TaskEntity[];
  planningSession: unknown;
  suggestion: NextActionSuggestion;
  teamExecution: DashboardTeamExecutionSummary;
  subagentRegistry: DashboardSubagentRegistrySummary;
  systemStatus: DashboardSystemStatus;
};

function priorityRank(task: TaskEntity): number {
  if (task.priority === "P1") return 0;
  if (task.priority === "P2") return 1;
  if (task.priority === "P3") return 2;
  return 99;
}

function taskRecency(task: TaskEntity): number {
  const n = Date.parse(task.updatedAt || task.createdAt || "");
  return Number.isFinite(n) ? n : 0;
}

function pickMostRelevantTask(tasks: TaskEntity[]): TaskEntity | null {
  const sorted = [...tasks].sort((a, b) => {
    const pr = priorityRank(a) - priorityRank(b);
    if (pr !== 0) return pr;
    const recent = taskRecency(b) - taskRecency(a);
    if (recent !== 0) return recent;
    return a.id.localeCompare(b.id);
  });
  return sorted[0] ?? null;
}

function cleanString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function activePlanningLabel(planningSession: unknown): string | null {
  if (!planningSession || typeof planningSession !== "object") {
    return null;
  }
  const row = planningSession as Record<string, unknown>;
  const status = cleanString(row.status).toLowerCase();
  if (["completed", "complete", "cancelled", "canceled", "discarded"].includes(status)) {
    return null;
  }
  const planningType = cleanString(row.planningType);
  if (planningType.length > 0) {
    const words = planningType
      .split(/[_\s-]+/)
      .filter(Boolean)
      .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1).toLowerCase());
    return words.length > 0 ? `Planning ${words.join(" ")}` : "Planning Interview";
  }
  return "Planning Interview";
}

function firstActiveTeamTask(teamExecution: DashboardTeamExecutionSummary): string | null {
  const row = teamExecution.topActive.find((x) => cleanString(x.executionTaskId).length > 0);
  return row?.executionTaskId ?? null;
}

function firstOpenSubagentTask(subagentRegistry: DashboardSubagentRegistrySummary): string | null {
  const row = subagentRegistry.topOpenSessions.find((x) => cleanString(x.executionTaskId).length > 0);
  return row?.executionTaskId ?? null;
}

function taskPhaseKey(task: TaskEntity | null): string | null {
  return cleanString(task?.phaseKey).length > 0 ? cleanString(task?.phaseKey) : null;
}

function taskStatus(
  input: BuildDashboardAgentStatusInput,
  overrides: Omit<DashboardAgentStatusSummary, "schemaVersion" | "source" | "updatedAt">
): DashboardAgentStatusSummary {
  return {
    schemaVersion: 1,
    source: "derived",
    updatedAt: input.now,
    ...overrides
  };
}

export function buildDashboardAgentStatus(
  input: BuildDashboardAgentStatusInput
): DashboardAgentStatusSummary {
  if (input.systemStatus.phase.ok === false) {
    return taskStatus(input, {
      kind: "unavailable",
      label: "Unavailable",
      confidence: "high",
      detail: input.systemStatus.phase.message ?? input.systemStatus.phase.code ?? "Phase status unavailable"
    });
  }

  const planningLabel = activePlanningLabel(input.planningSession);
  if (planningLabel) {
    return taskStatus(input, {
      kind: "planning",
      label: planningLabel,
      confidence: "medium",
      command: "build-plan"
    });
  }

  const humanGated = pickMostRelevantTask(input.tasks.filter((t) => isHumanGateStatus(t.status)));
  if (humanGated) {
    const gate = humanGated.metadata?.humanGate as HumanGateRecord | undefined;
    const kind =
      humanGated.status === "awaiting_policy_approval"
        ? "awaiting_policy_approval"
        : "awaiting_human_gate";
    const label =
      humanGated.status === "awaiting_review"
        ? `Awaiting review · ${humanGated.id}`
        : humanGated.status === "awaiting_policy_approval"
          ? `Awaiting policy approval · ${humanGated.id}`
          : `Awaiting external decision · ${humanGated.id}`;
    const ageMin = gate ? Math.round(humanGateAgeMs(gate) / 60_000) : 0;
    return taskStatus(input, {
      kind,
      label,
      confidence: "high",
      taskId: humanGated.id,
      phaseKey: taskPhaseKey(humanGated),
      detail: gate?.requestedDecision
        ? `${gate.requestedDecision} (${ageMin}m) · ${humanGateResumeCommand(humanGated)}`
        : humanGateResumeCommand(humanGated)
    });
  }

  const blocked = input.suggestion.blockingAnalysis[0];
  if (blocked) {
    const task = input.tasks.find((x) => x.id === blocked.taskId) ?? null;
    return taskStatus(input, {
      kind: "blocked",
      label: `Blocked on Task ${blocked.taskId}`,
      confidence: "high",
      taskId: blocked.taskId,
      phaseKey: taskPhaseKey(task),
      detail: blocked.blockedBy.length > 0 ? `Waiting on ${blocked.blockedBy.join(", ")}` : null
    });
  }

  const inProgress = pickMostRelevantTask(input.tasks.filter((t) => t.status === "in_progress"));
  if (inProgress) {
    return taskStatus(input, {
      kind: "working_task",
      label: `Working on Task ${inProgress.id}`,
      confidence: "medium",
      taskId: inProgress.id,
      phaseKey: taskPhaseKey(inProgress)
    });
  }

  const delegatedTaskId = firstActiveTeamTask(input.teamExecution) ?? firstOpenSubagentTask(input.subagentRegistry);
  if (delegatedTaskId) {
    const task = input.tasks.find((x) => x.id === delegatedTaskId) ?? null;
    return taskStatus(input, {
      kind: "delegating_task",
      label: `Delegating Task ${delegatedTaskId}`,
      confidence: "medium",
      taskId: delegatedTaskId,
      phaseKey: taskPhaseKey(task)
    });
  }

  if (input.suggestion.suggestedNext) {
    return taskStatus(input, {
      kind: "ready_task",
      label: `Ready Task ${input.suggestion.suggestedNext.id}`,
      confidence: "low",
      taskId: input.suggestion.suggestedNext.id,
      phaseKey: taskPhaseKey(input.suggestion.suggestedNext),
      detail: "Suggested next runnable task"
    });
  }

  return taskStatus(input, {
    kind: "awaiting_instruction",
    label: "Awaiting Instruction",
    confidence: "low",
    taskId: null,
    phaseKey: null
  });
}