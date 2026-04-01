import type { WorkspaceStatusSnapshot } from "./dashboard-status.js";
import { getNextActions } from "./suggestions.js";
import { inferTaskPhaseKey, resolveCanonicalPhase, type CanonicalPhaseResolution } from "./phase-resolution.js";
import type { TaskEntity } from "./types.js";
import { isWishlistIntakeTask } from "./wishlist-intake.js";

export type ReadyTaskQueueHealthRow = {
  taskId: string;
  title: string;
  phaseAligned: boolean | null;
  /** Present when `phaseAligned` is false or null and details help operators. */
  taskPhaseKey: string | null;
  canonicalPhaseKey: string | null;
  blockedByDependencies: boolean;
  unmetDependencies: string[];
};

export type QueueHealthReport = {
  schemaVersion: 1;
  scope: "tasks-only";
  canonicalPhase: CanonicalPhaseResolution & {
    phaseLabelFromConfig: string | null;
  };
  readyTaskSummaries: ReadyTaskQueueHealthRow[];
  summary: {
    readyCount: number;
    misalignedPhaseCount: number;
    blockedByDependenciesCount: number;
    /** Ready tasks that are phase-aligned (or phase check skipped) and have no unmet deps. */
    healthyReadyCount: number;
  };
};

function phaseAlignmentForTask(
  task: TaskEntity,
  canonicalPhaseKey: string | null
): { phaseAligned: boolean | null; taskPhaseKey: string | null } {
  if (canonicalPhaseKey === null) {
    return { phaseAligned: null, taskPhaseKey: inferTaskPhaseKey(task) };
  }
  const taskPhaseKey = inferTaskPhaseKey(task);
  if (taskPhaseKey === null) {
    return { phaseAligned: null, taskPhaseKey: null };
  }
  return { phaseAligned: taskPhaseKey === canonicalPhaseKey, taskPhaseKey };
}

export function buildQueueHealthReport(args: {
  tasks: TaskEntity[];
  effectiveConfig: Record<string, unknown> | undefined;
  workspaceStatus: WorkspaceStatusSnapshot | null;
}): QueueHealthReport {
  const phaseCtx = resolveCanonicalPhase({
    effectiveConfig: args.effectiveConfig,
    workspaceStatus: args.workspaceStatus
  });
  const kit = args.effectiveConfig?.kit;
  const kitObj =
    kit !== null && typeof kit === "object" && !Array.isArray(kit) ? (kit as Record<string, unknown>) : undefined;
  const labelRaw = kitObj?.currentPhaseLabel;
  const phaseLabelFromConfig =
    typeof labelRaw === "string" && labelRaw.trim().length > 0 ? labelRaw.trim() : null;

  const suggestion = getNextActions(args.tasks);
  const completedIds = new Set(
    args.tasks.filter((t) => t.status === "completed").map((t) => t.id)
  );

  const readyTaskSummaries: ReadyTaskQueueHealthRow[] = [];
  let misalignedPhaseCount = 0;
  let blockedByDependenciesCount = 0;
  let healthyReadyCount = 0;

  for (const task of suggestion.readyQueue) {
    if (isWishlistIntakeTask(task)) {
      continue;
    }
    const deps = task.dependsOn ?? [];
    const unmetDependencies = deps.filter((depId) => !completedIds.has(depId));
    const blockedByDependencies = unmetDependencies.length > 0;
    const { phaseAligned, taskPhaseKey } = phaseAlignmentForTask(task, phaseCtx.canonicalPhaseKey);

    if (phaseAligned === false) {
      misalignedPhaseCount += 1;
    }
    if (blockedByDependencies) {
      blockedByDependenciesCount += 1;
    }
    const healthy =
      blockedByDependencies === false && (phaseAligned === true || phaseAligned === null);
    if (healthy) {
      healthyReadyCount += 1;
    }

    readyTaskSummaries.push({
      taskId: task.id,
      title: task.title,
      phaseAligned,
      taskPhaseKey,
      canonicalPhaseKey: phaseCtx.canonicalPhaseKey,
      blockedByDependencies,
      unmetDependencies
    });
  }

  return {
    schemaVersion: 1,
    scope: "tasks-only",
    canonicalPhase: {
      ...phaseCtx,
      phaseLabelFromConfig
    },
    readyTaskSummaries,
    summary: {
      readyCount: readyTaskSummaries.length,
      misalignedPhaseCount,
      blockedByDependenciesCount,
      healthyReadyCount
    }
  };
}

/** Hints for list-tasks / filtering; same dependency + phase rules as queue-health ready rows. */
export function buildQueueHintsForTasks(args: {
  tasks: TaskEntity[];
  effectiveConfig: Record<string, unknown> | undefined;
  workspaceStatus: WorkspaceStatusSnapshot | null;
  /** Tasks already filtered (e.g. list-tasks output order). */
  taskRows: TaskEntity[];
}): Array<{
  taskId: string;
  phaseAligned: boolean | null;
  blockedByDependencies: boolean;
  unmetDependencies: string[];
}> {
  const phaseCtx = resolveCanonicalPhase({
    effectiveConfig: args.effectiveConfig,
    workspaceStatus: args.workspaceStatus
  });
  const completedIds = new Set(
    args.tasks.filter((t) => t.status === "completed").map((t) => t.id)
  );

  return args.taskRows.map((task) => {
    const deps = task.dependsOn ?? [];
    const unmetDependencies = deps.filter((depId) => !completedIds.has(depId));
    const blockedByDependencies =
      task.status === "ready" && !isWishlistIntakeTask(task) ? unmetDependencies.length > 0 : false;
    let phaseAligned: boolean | null = null;
    if (task.status === "ready" && !isWishlistIntakeTask(task)) {
      const r = phaseAlignmentForTask(task, phaseCtx.canonicalPhaseKey);
      phaseAligned = r.phaseAligned;
    }
    return {
      taskId: task.id,
      phaseAligned,
      blockedByDependencies,
      unmetDependencies: task.status === "ready" && !isWishlistIntakeTask(task) ? unmetDependencies : []
    };
  });
}
