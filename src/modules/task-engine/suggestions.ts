import type {
  TaskEntity,
  TaskStatus,
  NextActionSuggestion,
  BlockingAnalysisEntry
} from "./types.js";
import { isWishlistIntakeTask } from "./wishlist-intake.js";

/** Matches transcript-backed ids from improvement ingest (`imp-` + hex). Keep in sync with `ingest.ts`. */
const IMPROVEMENT_ID_RE = /^imp-[a-f0-9]+$/i;

export function isImprovementLikeTask(t: TaskEntity): boolean {
  if (t.type === "improvement") {
    return true;
  }
  return typeof t.id === "string" && IMPROVEMENT_ID_RE.test(t.id);
}

const PRIORITY_ORDER: Record<string, number> = {
  P1: 0,
  P2: 1,
  P3: 2
};

function priorityRank(task: TaskEntity): number {
  return PRIORITY_ORDER[task.priority ?? ""] ?? 99;
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

export function getNextActions(tasks: TaskEntity[]): NextActionSuggestion {
  const readyQueue = tasks
    .filter((t) => t.status === "ready" && !isWishlistIntakeTask(t))
    .sort((a, b) => priorityRank(a) - priorityRank(b));

  return {
    readyQueue,
    suggestedNext: readyQueue[0] ?? null,
    stateSummary: buildStateSummary(tasks),
    blockingAnalysis: buildBlockingAnalysis(tasks)
  };
}
