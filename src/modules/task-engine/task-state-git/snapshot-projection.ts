import type { TaskStoreDocument } from "../types.js";
import {
  applyTaskStateEvent,
  createEmptyTaskStateProjection,
  materializeTaskStoreDocument
} from "../task-state-events/event-applier.js";
import type { TaskStateEventV1 } from "../task-state-events/event-payloads.js";
import type { TaskStateProjectionV1 } from "../task-state-events/projection-types.js";

export type TaskStateSnapshotContentV1 = {
  schemaVersion: 1;
  projectionKind: "task-store-document";
  tasks: TaskStoreDocument["tasks"];
  transitions: TaskStoreDocument["transitionLog"];
  mutations?: TaskStoreDocument["mutationLog"];
};

export function documentFromSnapshotContent(content: TaskStateSnapshotContentV1): TaskStoreDocument {
  return {
    schemaVersion: 1,
    tasks: content.tasks ?? [],
    transitionLog: content.transitions ?? [],
    mutationLog: content.mutations ?? [],
    lastUpdated: new Date().toISOString()
  };
}

export function projectionFromSnapshotContent(content: TaskStateSnapshotContentV1): TaskStateProjectionV1 {
  const document = documentFromSnapshotContent(content);
  const projection = createEmptyTaskStateProjection(document.lastUpdated);
  projection.tasksById = Object.fromEntries(document.tasks.map((t) => [t.id, { ...t }]));
  projection.transitionLog = [...document.transitionLog];
  projection.mutationLog = [...(document.mutationLog ?? [])];
  for (const task of document.tasks) {
    projection.taskVersions.push({
      taskId: task.id,
      version: 1,
      eventId: `snapshot-${task.id}`,
      sequence: 0,
      recordedAt: document.lastUpdated
    });
  }
  return projection;
}

export function replayTailFromSnapshot(input: {
  snapshot: TaskStateSnapshotContentV1;
  throughSequence: number;
  tailEvents: TaskStateEventV1[];
}):
  | { ok: true; document: TaskStoreDocument; projection: TaskStateProjectionV1 }
  | { ok: false; code: string; message: string } {
  let projection = projectionFromSnapshotContent(input.snapshot);
  projection.lastEventSequence = input.throughSequence;
  const tail = input.tailEvents
    .filter((e) => e.sequence > input.throughSequence)
    .sort((a, b) => a.sequence - b.sequence);
  for (const event of tail) {
    const applied = applyTaskStateEvent(projection, event, { enforceSequence: true });
    if (!applied.ok) {
      return { ok: false, code: applied.error.code, message: applied.error.message };
    }
    projection = applied.projection;
  }
  return {
    ok: true,
    document: materializeTaskStoreDocument(projection),
    projection
  };
}
