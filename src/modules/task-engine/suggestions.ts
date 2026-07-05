import type {
  TaskEntity,
  TaskStatus,
  NextActionSuggestion,
  BlockingAnalysisEntry
} from "./types.js";
import {
  inferTaskPhaseKey,
  parseKitPhaseNumberFromYaml,
  parseLeadingPhaseOrdinal
} from "./phase-resolution.js";
import { isWishlistIntakeTask } from "./wishlist-intake.js";

/** Workspace kit phase pointers for ordering the ready queue and suggested next. */
export type WorkspacePhaseFocus = {
  currentKitPhase: string | null;
  nextKitPhase: string | null;
};

/**
 * Lower rank = sooner in the ready queue. Current phase, then next phase, then later phases, then past/unphased.
 */
export function workspacePhaseFocusRank(
  task: Pick<TaskEntity, "phaseKey" | "phase">,
  focus: WorkspacePhaseFocus | undefined
): number {
  if (!focus) {
    return 0;
  }
  const taskKey = inferTaskPhaseKey(task);
  if (!taskKey) {
    return 50;
  }
  const cur =
    parseKitPhaseNumberFromYaml(focus.currentKitPhase) ??
    (focus.currentKitPhase?.trim() || null);
  const nxt =
    parseKitPhaseNumberFromYaml(focus.nextKitPhase) ?? (focus.nextKitPhase?.trim() || null);
  if (cur && taskKey === cur) {
    return 0;
  }
  if (nxt && taskKey === nxt) {
    return 1;
  }
  const tn = parseLeadingPhaseOrdinal(taskKey);
  const nc = parseLeadingPhaseOrdinal(cur);
  const nn = parseLeadingPhaseOrdinal(nxt);
  if (tn !== null && nc !== null && tn < nc) {
    return 40;
  }
  if (tn !== null && nn !== null && tn > nn) {
    return 20;
  }
  if (tn !== null && nc !== null && nxt && tn > nc) {
    return 10;
  }
  return 30;
}

/** Legacy recommendation ids (`imp-` + hex). New improvements use normal `T###` ids with `type: "improvement"`. */
const IMPROVEMENT_ID_RE = /^imp-[a-f0-9]+$/i;

export function isImprovementLikeTask(t: TaskEntity): boolean {
  if (t.type === "improvement") {
    return true;
  }
  return typeof t.id === "string" && IMPROVEMENT_ID_RE.test(t.id);
}

/** Retro imports are phased execution backlog, not governance review items. */
export function isRetrospectiveExecutionImport(task: TaskEntity): boolean {
  const meta = task.metadata;
  if (meta === null || typeof meta !== "object" || Array.isArray(meta)) {
    return false;
  }
  const retrospectiveId = (meta as Record<string, unknown>).retrospectiveId;
  return typeof retrospectiveId === "string" && retrospectiveId.trim().length > 0;
}

/** Improvements in ready/in_progress that belong in the policy approval inbox (`review-item` queue). */
export function isReviewItemQueueCandidate(task: TaskEntity): boolean {
  const status = task.status;
  if (status !== "ready" && status !== "in_progress") {
    return false;
  }
  if (!isImprovementLikeTask(task)) {
    return false;
  }
  if (isRetrospectiveExecutionImport(task)) {
    return false;
  }
  if (getTaskQueueNamespace(task) === "execution") {
    return false;
  }
  return true;
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

/** Deterministic ordering: workspace phase focus, priority rank, then task id. */
function sortReadyTasks(tasks: TaskEntity[], options?: GetNextActionsOptions): TaskEntity[] {
  const focus = options?.workspacePhaseFocus;
  return [...tasks].sort((a, b) => {
    const phaseR = workspacePhaseFocusRank(a, focus) - workspacePhaseFocusRank(b, focus);
    if (phaseR !== 0) {
      return phaseR;
    }
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
function partitionReadyByDependencies(
  tasks: TaskEntity[],
  options?: GetNextActionsOptions
): {
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
    runnableReady: sortReadyTasks(runnableReady, options),
    dependencyBlockedReady: sortReadyTasks(dependencyBlockedReady, options)
  };
}

function buildStateSummary(tasks: TaskEntity[]): NextActionSuggestion["stateSummary"] {
  const counts: Record<TaskStatus, number> = {
    research: 0,
    proposed: 0,
    ready: 0,
    in_progress: 0,
    awaiting_review: 0,
    awaiting_policy_approval: 0,
    awaiting_external_decision: 0,
    blocked: 0,
    completed: 0,
    cancelled: 0
  };
  let total = 0;
  for (const task of tasks) {
    /** Wishlist intake (`wishlist_intake`) is ideation — tracked under the wishlist rollups, not the execution queue grid. */
    if (isWishlistIntakeTask(task)) {
      continue;
    }
    counts[task.status]++;
    total++;
  }
  return { ...counts, total };
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
  /** When set, ready ordering and `suggestedNext` prefer current kit phase, then next, then later phases. */
  workspacePhaseFocus?: WorkspacePhaseFocus;
};

export function getNextActions(
  tasks: TaskEntity[],
  options?: GetNextActionsOptions
): NextActionSuggestion {
  const scoped = filterTasksByQueueNamespace(tasks, options?.queueNamespace);
  const { runnableReady, dependencyBlockedReady } = partitionReadyByDependencies(scoped, options);
  const readyQueue = [...runnableReady, ...dependencyBlockedReady];

  return {
    readyQueue,
    suggestedNext: runnableReady[0] ?? null,
    stateSummary: buildStateSummary(scoped),
    blockingAnalysis: buildBlockingAnalysis(scoped)
  };
}
