import type { TaskStoreDocument } from "../types.js";
import {
  applyTaskStateEvent,
  createEmptyTaskStateProjection,
  materializeTaskStoreDocument
} from "../task-state-events/event-applier.js";
import type { TaskStateEventV1 } from "../task-state-events/event-payloads.js";
import type { TaskStateProjectionV1, TaskVersionRecordV1 } from "../task-state-events/projection-types.js";

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

function payloadTaskId(event: TaskStateEventV1): string | undefined {
  const payload = event.payload;
  if (payload && typeof payload === "object" && "taskId" in payload) {
    const taskId = (payload as { taskId?: unknown }).taskId;
    return typeof taskId === "string" ? taskId : undefined;
  }
  return undefined;
}

function inferTaskVersionRecordsFromEvents(
  events: TaskStateEventV1[],
  fallbackRecordedAt: string
): TaskVersionRecordV1[] {
  const sorted = [...events].sort((a, b) => {
    if (a.sequence !== b.sequence) {
      return a.sequence - b.sequence;
    }
    return a.eventId.localeCompare(b.eventId);
  });
  const byTask = new Map<string, TaskVersionRecordV1>();
  for (const event of sorted) {
    const taskId = payloadTaskId(event);
    if (!taskId) {
      continue;
    }
    const version =
      event.expectedTaskVersion !== undefined
        ? event.expectedTaskVersion + 1
        : event.kind === "task.created"
          ? 1
          : (byTask.get(taskId)?.version ?? 0) + 1;
    byTask.set(taskId, {
      taskId,
      version,
      eventId: event.eventId,
      sequence: event.sequence,
      recordedAt: event.recordedAt ?? fallbackRecordedAt
    });
  }
  return [...byTask.values()];
}

/** SQLite task document as a projection checkpoint (snapshot-seeded git logs). */
export function buildCheckpointTaskProjectionFromStore(
  document: TaskStoreDocument,
  appliedSequence: number,
  priorTaskEvents: TaskStateEventV1[]
): TaskStateProjectionV1 {
  const projection = projectionFromSnapshotContent({
    schemaVersion: 1,
    projectionKind: "task-store-document",
    tasks: document.tasks,
    transitions: document.transitionLog,
    mutations: document.mutationLog
  });
  projection.lastEventSequence = appliedSequence;
  projection.lastUpdated = document.lastUpdated;
  projection.taskVersions = inferTaskVersionRecordsFromEvents(priorTaskEvents, document.lastUpdated);
  return projection;
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
