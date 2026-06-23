import type { WorkspaceStatusSnapshot } from "../dashboard/dashboard-status.js";
import { getNextActions } from "../suggestions.js";
import {
  inferTaskPhaseKey,
  resolveCanonicalPhase,
  type CanonicalPhaseResolution,
  type PhaseScheduleRelation,
  resolvePhaseScheduleRelation
} from "../phase-resolution.js";
import type { TaskEntity } from "../types.js";
import { isWishlistIntakeTask } from "../wishlist-intake.js";

export type ReadyTaskQueueHealthRow = {
  taskId: string;
  title: string;
  phaseAligned: boolean | null;
  /** Present when `phaseAligned` is false or null and details help operators. */
  taskPhaseKey: string | null;
  canonicalPhaseKey: string | null;
  /** Workspace-current vs scheduled-target (`future` is allowed planned work, not a queue defect). */
  phaseScheduleRelation: PhaseScheduleRelation;
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
    /** Ready tasks whose phase key orders before the workspace current phase (or non-numeric misalignment). */
    misalignedPhaseCount: number;
    /** Ready tasks intentionally scheduled for a higher numbered phase than workspace current (planned-ahead work). */
    scheduledFuturePhaseCount: number;
    blockedByDependenciesCount: number;
    /** Ready tasks that are phase-aligned (or phase check skipped) and have no unmet deps. */
    healthyReadyCount: number;
  };
};

function phaseAlignmentForTask(
  task: TaskEntity,
  canonicalPhaseKey: string | null
): {
  phaseAligned: boolean | null;
  taskPhaseKey: string | null;
  phaseScheduleRelation: PhaseScheduleRelation;
} {
  const taskPhaseKey = inferTaskPhaseKey(task);
  if (canonicalPhaseKey === null) {
    return { phaseAligned: null, taskPhaseKey, phaseScheduleRelation: "unknown" };
  }
  if (taskPhaseKey === null) {
    return { phaseAligned: null, taskPhaseKey: null, phaseScheduleRelation: "unknown" };
  }
  const relation = resolvePhaseScheduleRelation({
    taskPhaseKey,
    workspacePhaseKey: canonicalPhaseKey
  });
  const phaseAligned = relation === "current";
  return { phaseAligned, taskPhaseKey, phaseScheduleRelation: relation };
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
  let scheduledFuturePhaseCount = 0;
  let blockedByDependenciesCount = 0;
  let healthyReadyCount = 0;

  for (const task of suggestion.readyQueue) {
    if (isWishlistIntakeTask(task)) {
      continue;
    }
    const deps = task.dependsOn ?? [];
    const unmetDependencies = deps.filter((depId) => !completedIds.has(depId));
    const blockedByDependencies = unmetDependencies.length > 0;
    const { phaseAligned, taskPhaseKey, phaseScheduleRelation } = phaseAlignmentForTask(
      task,
      phaseCtx.canonicalPhaseKey
    );

    if (phaseAligned === false && phaseScheduleRelation === "future") {
      scheduledFuturePhaseCount += 1;
    } else if (phaseAligned === false) {
      misalignedPhaseCount += 1;
    }
    if (blockedByDependencies) {
      blockedByDependenciesCount += 1;
    }
    const healthy =
      blockedByDependencies === false &&
      (phaseScheduleRelation === "current" ||
        phaseScheduleRelation === "future" ||
        phaseScheduleRelation === "unknown");
    if (healthy) {
      healthyReadyCount += 1;
    }

    readyTaskSummaries.push({
      taskId: task.id,
      title: task.title,
      phaseAligned,
      taskPhaseKey,
      canonicalPhaseKey: phaseCtx.canonicalPhaseKey,
      phaseScheduleRelation,
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
      scheduledFuturePhaseCount,
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
  phaseScheduleRelation: PhaseScheduleRelation;
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
    let phaseScheduleRelation: PhaseScheduleRelation = "unknown";
    if (task.status === "ready" && !isWishlistIntakeTask(task)) {
      const r = phaseAlignmentForTask(task, phaseCtx.canonicalPhaseKey);
      phaseAligned = r.phaseAligned;
      phaseScheduleRelation = r.phaseScheduleRelation;
    }
    return {
      taskId: task.id,
      phaseAligned,
      phaseScheduleRelation,
      blockedByDependencies,
      unmetDependencies: task.status === "ready" && !isWishlistIntakeTask(task) ? unmetDependencies : []
    };
  });
}
