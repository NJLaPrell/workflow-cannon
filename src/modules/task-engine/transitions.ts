import type {
  TaskEntity,
  TaskStatus,
  TransitionGuard,
  GuardResult,
  TransitionContext,
  TaskEngineErrorCode
} from "./types.js";
import { isHumanGateStatus } from "./human-gate.js";

export class TaskEngineError extends Error {
  readonly code: TaskEngineErrorCode;
  /** Optional structured fields for agent JSON (`planning-generation-mismatch`, etc.). */
  readonly details?: Record<string, unknown>;

  constructor(code: TaskEngineErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "TaskEngineError";
    this.code = code;
    this.details = details;
  }
}

type TransitionEntry = {
  action: string;
};

const ALLOWED_TRANSITIONS: Record<string, TransitionEntry> = {
  /** Type change to `improvement` + proposed body: use **`synthesize-transcript-churn`** (not `run-transition`). */
  "research->cancelled": { action: "reject" },
  "proposed->ready": { action: "accept" },
  "proposed->cancelled": { action: "reject" },
  "ready->proposed": { action: "demote" },
  "ready->in_progress": { action: "start" },
  "ready->blocked": { action: "block" },
  "ready->cancelled": { action: "cancel" },
  "in_progress->completed": { action: "complete" },
  "in_progress->cancelled": { action: "decline" },
  "in_progress->blocked": { action: "block" },
  "in_progress->ready": { action: "pause" },
  "in_progress->awaiting_review": { action: "await_review" },
  "in_progress->awaiting_policy_approval": { action: "await_policy_approval" },
  "in_progress->awaiting_external_decision": { action: "await_external_decision" },
  "ready->awaiting_review": { action: "await_review" },
  "ready->awaiting_policy_approval": { action: "await_policy_approval" },
  "ready->awaiting_external_decision": { action: "await_external_decision" },
  "awaiting_review->ready": { action: "resume_ready" },
  "awaiting_review->in_progress": { action: "resume_work" },
  "awaiting_review->blocked": { action: "block" },
  "awaiting_review->cancelled": { action: "cancel" },
  "awaiting_policy_approval->ready": { action: "resume_ready" },
  "awaiting_policy_approval->in_progress": { action: "resume_work" },
  "awaiting_policy_approval->blocked": { action: "block" },
  "awaiting_policy_approval->cancelled": { action: "cancel" },
  "awaiting_external_decision->ready": { action: "resume_ready" },
  "awaiting_external_decision->in_progress": { action: "resume_work" },
  "awaiting_external_decision->blocked": { action: "block" },
  "awaiting_external_decision->cancelled": { action: "cancel" },
  "blocked->ready": { action: "unblock" },
  "blocked->cancelled": { action: "cancel" }
};

export function listTransitionActionTable(): { from: TaskStatus; to: TaskStatus; action: string }[] {
  return Object.entries(ALLOWED_TRANSITIONS).map(([key, entry]) => {
    const [from, to] = key.split("->") as [TaskStatus, TaskStatus];
    return { from, to, action: entry.action };
  });
}

export function listTransitionActions(): string[] {
  return [...new Set(listTransitionActionTable().map((entry) => entry.action))].sort((a, b) => a.localeCompare(b));
}

export function isTransitionAllowed(from: TaskStatus, to: TaskStatus): boolean {
  return `${from}->${to}` in ALLOWED_TRANSITIONS;
}

export function getTransitionAction(from: TaskStatus, to: TaskStatus): string | undefined {
  return ALLOWED_TRANSITIONS[`${from}->${to}`]?.action;
}

export function resolveTargetState(from: TaskStatus, action: string): TaskStatus | undefined {
  for (const [key, entry] of Object.entries(ALLOWED_TRANSITIONS)) {
    if (entry.action === action && key.startsWith(`${from}->`)) {
      return key.split("->")[1] as TaskStatus;
    }
  }
  return undefined;
}

export function getAllowedTransitionsFrom(status: TaskStatus): { to: TaskStatus; action: string }[] {
  const results: { to: TaskStatus; action: string }[] = [];
  for (const [key, entry] of Object.entries(ALLOWED_TRANSITIONS)) {
    const [from, to] = key.split("->") as [TaskStatus, TaskStatus];
    if (from === status) {
      results.push({ to, action: entry.action });
    }
  }
  return results;
}

export const stateValidityGuard: TransitionGuard = {
  name: "state-validity",
  canTransition(task: TaskEntity, targetState: TaskStatus): GuardResult {
    if (isTransitionAllowed(task.status, targetState)) {
      return { allowed: true, guardName: "state-validity" };
    }
    return {
      allowed: false,
      guardName: "state-validity",
      code: "invalid-transition",
      message: `Transition from '${task.status}' to '${targetState}' is not allowed`
    };
  }
};

export const dependencyCheckGuard: TransitionGuard = {
  name: "dependency-check",
  canTransition(
    task: TaskEntity,
    targetState: TaskStatus,
    context: TransitionContext
  ): GuardResult {
    const needsDepCheck =
      (task.status === "ready" && targetState === "in_progress") ||
      (task.status === "blocked" && targetState === "ready");

    if (!needsDepCheck) {
      return { allowed: true, guardName: "dependency-check" };
    }

    const deps = task.dependsOn ?? [];
    if (deps.length === 0) {
      return { allowed: true, guardName: "dependency-check" };
    }

    const taskMap = new Map(context.allTasks.map((t) => [t.id, t]));
    const unsatisfied: string[] = [];

    for (const depId of deps) {
      const depTask = taskMap.get(depId);
      if (!depTask || depTask.status !== "completed") {
        unsatisfied.push(depId);
      }
    }

    if (unsatisfied.length > 0) {
      return {
        allowed: false,
        guardName: "dependency-check",
        code: "dependency-unsatisfied",
        message: `Dependencies not satisfied: ${unsatisfied.join(", ")}`
      };
    }

    return { allowed: true, guardName: "dependency-check" };
  }
};

export const singleTaskInProgressGuard: TransitionGuard = {
  name: "single-task-in-progress",
  canTransition(task: TaskEntity, targetState: TaskStatus, context: TransitionContext): GuardResult {
    if (!(task.status === "ready" && targetState === "in_progress")) {
      return { allowed: true, guardName: "single-task-in-progress" };
    }

    const active = context.allTasks.filter(
      (t) =>
        t.id !== task.id &&
        (t.status === "in_progress" || isHumanGateStatus(t.status)) &&
        t.archived !== true
    );
    if (active.length === 0) {
      return { allowed: true, guardName: "single-task-in-progress" };
    }

    const related = active.filter(
      (t) => (task.dependsOn ?? []).includes(t.id) || (t.dependsOn ?? []).includes(task.id)
    );
    if (related.length === active.length) {
      return { allowed: true, guardName: "single-task-in-progress", code: "single-task-related-allow" };
    }

    const blocking = active
      .filter((t) => !(task.dependsOn ?? []).includes(t.id) && !(t.dependsOn ?? []).includes(task.id))
      .map((t) => t.id)
      .slice(0, 5);
    return {
      allowed: false,
      guardName: "single-task-in-progress",
      code: "single-task-in-progress-required",
      message:
        `Cannot start '${task.id}' while unrelated task(s) already in progress: ${blocking.join(", ")}. ` +
        "Pause or complete the active task first."
    };
  }
};

export class TransitionValidator {
  private readonly guards: TransitionGuard[];

  constructor(customGuards: TransitionGuard[] = []) {
    this.guards = [stateValidityGuard, dependencyCheckGuard, singleTaskInProgressGuard, ...customGuards];
  }

  validate(
    task: TaskEntity,
    targetState: TaskStatus,
    context: TransitionContext
  ): { allowed: boolean; guardResults: GuardResult[] } {
    const guardResults: GuardResult[] = [];

    for (const guard of this.guards) {
      const result = guard.canTransition(task, targetState, context);
      guardResults.push(result);
      if (!result.allowed) {
        return { allowed: false, guardResults };
      }
    }

    return { allowed: true, guardResults };
  }

  getGuards(): TransitionGuard[] {
    return [...this.guards];
  }
}
