import type {
  TaskEntity,
  TaskStatus,
  NextActionSuggestion,
  BlockingAnalysisEntry
} from "./types.js";
import { isWishlistIntakeTask } from "./wishlist/wishlist-intake.js";

/** Legacy recommendation ids (`imp-` + hex). New improvements use normal `T###` ids with `type: "improvement"`. */
const IMPROVEMENT_ID_RE = /^imp-[a-f0-9]+$/i;

export function isImprovementLikeTask(t: TaskEntity): boolean {
  if (t.type === "improvement") {
    return true;
  }
  return typeof t.id === "string" && IMPROVEMENT_ID_RE.test(t.id);
}

/** Canonical queue partition for filtered next-actions (`metadata.queueNamespace`); missing → `"default"`. */
export function getTaskQueueNamespace(task: TaskEntity): string {
  const meta = task.metadata;
  if (meta !== null && typeof meta === "object" && !Array.isArray(meta)) {
    const raw = (meta as Record<string, unknown>).queueNamespace;
    if (typeof raw === "string" && raw.trim().length > 0) {
      return raw.trim();
    }
  }
  return "default";
}

export function filterTasksByQueueNamespace(
  tasks: TaskEntity[],
  queueNamespace?: string
): TaskEntity[] {
  const ns = typeof queueNamespace === "string" ? queueNamespace.trim() : "";
  if (!ns) {
    return tasks;
  }
  return tasks.filter((t) => getTaskQueueNamespace(t) === ns);
}

const PRIORITY_ORDER: Record<string, number> = {
  P1: 0,
  P2: 1,
  P3: 2
};

function priorityRank(task: TaskEntity): number {
  return PRIORITY_ORDER[task.priority ?? ""] ?? 99;
}

/** Deterministic ordering within the ready queue: priority rank, then task id. */
function sortReadyTasks(tasks: TaskEntity[]): TaskEntity[] {
  return [...tasks].sort((a, b) => {
    const pr = priorityRank(a) - priorityRank(b);
    if (pr !== 0) {
      return pr;
    }
    return a.id.localeCompare(b.id);
  });
}

/**
 * Ready tasks whose dependsOn are all completed vs ready-but-blocked-by-deps.
 * Runnable tasks are listed first in `getNextActions.readyQueue`; `suggestedNext` is only ever runnable.
 */
function partitionReadyByDependencies(tasks: TaskEntity[]): {
  runnableReady: TaskEntity[];
  dependencyBlockedReady: TaskEntity[];
} {
  const completedIds = new Set(tasks.filter((t) => t.status === "completed").map((t) => t.id));
  const readyCandidates = tasks.filter((t) => t.status === "ready" && !isWishlistIntakeTask(t));
  const runnableReady: TaskEntity[] = [];
  const dependencyBlockedReady: TaskEntity[] = [];
  for (const t of readyCandidates) {
    const deps = t.dependsOn ?? [];
    const depsSatisfied = deps.every((depId) => completedIds.has(depId));
    if (depsSatisfied) {
      runnableReady.push(t);
    } else {
      dependencyBlockedReady.push(t);
    }
  }
  return {
    runnableReady: sortReadyTasks(runnableReady),
    dependencyBlockedReady: sortReadyTasks(dependencyBlockedReady)
  };
}

function buildStateSummary(tasks: TaskEntity[]): NextActionSuggestion["stateSummary"] {
  const counts: Record<TaskStatus, number> = {
    proposed: 0,
    ready: 0,
    in_progress: 0,
    blocked: 0,
    completed: 0,
    cancelled: 0
  };
  for (const task of tasks) {
    counts[task.status]++;
  }
  return { ...counts, total: tasks.length };
}

function buildBlockingAnalysis(tasks: TaskEntity[]): BlockingAnalysisEntry[] {
  const completedIds = new Set(
    tasks.filter((t) => t.status === "completed").map((t) => t.id)
  );

  const entries: BlockingAnalysisEntry[] = [];

  for (const task of tasks) {
    if (task.status !== "blocked") continue;

    const deps = task.dependsOn ?? [];
    const blockedBy = deps.filter((depId) => !completedIds.has(depId));

    if (blockedBy.length > 0) {
      entries.push({
        taskId: task.id,
        blockedBy,
        blockingCount: blockedBy.length
      });
    }
  }

  return entries.sort((a, b) => b.blockingCount - a.blockingCount);
}

export type GetNextActionsOptions = {
  /** When set, only tasks in this namespace participate (see `getTaskQueueNamespace`). */
  queueNamespace?: string;
};

export function getNextActions(
  tasks: TaskEntity[],
  options?: GetNextActionsOptions
): NextActionSuggestion {
  const scoped = filterTasksByQueueNamespace(tasks, options?.queueNamespace);
  const { runnableReady, dependencyBlockedReady } = partitionReadyByDependencies(scoped);
  const readyQueue = [...runnableReady, ...dependencyBlockedReady];

  return {
    readyQueue,
    suggestedNext: runnableReady[0] ?? null,
    stateSummary: buildStateSummary(scoped),
    blockingAnalysis: buildBlockingAnalysis(scoped)
  };
}
