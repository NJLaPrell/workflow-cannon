import type {
  CanonicalPlanningVersionRow,
  CanonicalTaskVersionRow
} from "../../../contracts/canonical-state-sync-backend.js";
import { admitCanonicalStateEventStream } from "../task-state-events/canonical-event-admission.js";
import type { CanonicalStateEventV1 } from "../task-state-events/canonical-state-events.js";
import { isPlanningStateEvent, isTaskStateEvent } from "../task-state-events/canonical-state-events.js";
import { replayTaskStateEvents } from "../task-state-events/event-applier.js";
import type { TaskStateEventV1 } from "../task-state-events/event-payloads.js";
import { createEmptyTaskStateProjection } from "../task-state-events/event-applier.js";
import {
  createEmptyPlanningStateProjection,
  replayPlanningStateEvents
} from "../task-state-events/planning-event-applier.js";
import type { PlanningStateEventV1 } from "../task-state-events/planning-event-payloads.js";
import type { PlanningStateProjectionV1 } from "../task-state-events/planning-projection-types.js";
import type { TaskStateProjectionV1 } from "../task-state-events/projection-types.js";

export type LocalOnlyReplayProjection = {
  taskProjection: TaskStateProjectionV1;
  planningProjection: PlanningStateProjectionV1;
};

export function replayLocalOnlyEvents(events: readonly CanonicalStateEventV1[]): LocalOnlyReplayProjection {
  const admitted = admitCanonicalStateEventStream([...events], {
    initialTaskProjection: createEmptyTaskStateProjection(),
    initialPlanningProjection: createEmptyPlanningStateProjection()
  });
  if (!admitted.ok) {
    throw new Error(`local-only replay rejected: ${admitted.error.message}`);
  }

  const taskEvents = [...events].filter(isTaskStateEvent) as TaskStateEventV1[];
  const planningEvents = [...events].filter(isPlanningStateEvent) as PlanningStateEventV1[];

  const taskReplay = replayTaskStateEvents(taskEvents);
  if (!taskReplay.ok) {
    throw new Error(`local-only task replay rejected: ${taskReplay.error.message}`);
  }

  const planningReplay = replayPlanningStateEvents(planningEvents);
  if (!planningReplay.ok) {
    throw new Error(`local-only planning replay rejected: ${planningReplay.error.message}`);
  }

  return {
    taskProjection: taskReplay.result.projection,
    planningProjection: planningReplay.projection
  };
}

export function taskVersionsFromProjection(projection: TaskStateProjectionV1): CanonicalTaskVersionRow[] {
  const latestByTask = new Map<string, number>();
  for (const row of projection.taskVersions) {
    latestByTask.set(row.taskId, row.version);
  }
  return [...latestByTask.entries()]
    .map(([taskId, version]) => ({ taskId, version }))
    .sort((a, b) => a.taskId.localeCompare(b.taskId));
}

export function planningVersionsFromProjection(
  projection: PlanningStateProjectionV1
): CanonicalPlanningVersionRow[] {
  const rows: CanonicalPlanningVersionRow[] = [];
  const workspaceRevision = projection.workspaceStatus?.workspaceRevision;
  if (typeof workspaceRevision === "number" && Number.isFinite(workspaceRevision)) {
    rows.push({ domain: "workspace", version: workspaceRevision });
  }
  for (const [moduleId, state] of Object.entries(projection.moduleStateById)) {
    rows.push({ domain: moduleId, version: state.stateSchemaVersion });
  }
  if (rows.length === 0) {
    rows.push({ domain: "workspace", version: projection.lastEventSequence });
  }
  return rows.sort((a, b) => a.domain.localeCompare(b.domain));
}

export function projectionRowsForEvents(events: readonly CanonicalStateEventV1[]): {
  taskVersions: CanonicalTaskVersionRow[];
  planningVersions: CanonicalPlanningVersionRow[];
} {
  const replay = replayLocalOnlyEvents(events);
  return {
    taskVersions: taskVersionsFromProjection(replay.taskProjection),
    planningVersions: planningVersionsFromProjection(replay.planningProjection)
  };
}
