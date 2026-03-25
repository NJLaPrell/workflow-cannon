import type {
  TaskEntity,
  TaskStatus,
  TransitionGuard,
  GuardResult,
  TransitionContext,
  TaskEngineErrorCode
} from "./types.js";

export class TaskEngineError extends Error {
  readonly code: TaskEngineErrorCode;

  constructor(code: TaskEngineErrorCode, message: string) {
    super(message);
    this.name = "TaskEngineError";
    this.code = code;
  }
}

type TransitionEntry = {
  action: string;
};

const ALLOWED_TRANSITIONS: Record<string, TransitionEntry> = {
  "proposed->ready": { action: "accept" },
  "proposed->cancelled": { action: "reject" },
  "ready->in_progress": { action: "start" },
  "ready->blocked": { action: "block" },
  "ready->cancelled": { action: "cancel" },
  "in_progress->completed": { action: "complete" },
  "in_progress->blocked": { action: "block" },
  "in_progress->ready": { action: "pause" },
  "blocked->ready": { action: "unblock" },
  "blocked->cancelled": { action: "cancel" }
};

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

export class TransitionValidator {
  private readonly guards: TransitionGuard[];

  constructor(customGuards: TransitionGuard[] = []) {
    this.guards = [stateValidityGuard, dependencyCheckGuard, ...customGuards];
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
