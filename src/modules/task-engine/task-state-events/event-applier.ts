import { compareTaskIdNumeric } from "../mutation-utils.js";
import type {
  TaskEntity,
  TaskMutationEvidence,
  TaskStoreDocument,
  TransitionEvidence
} from "../types.js";
import type {
  TaskBatchAppliedPayloadV1,
  TaskCreatedPayloadV1,
  TaskStateEventKindV1,
  TaskStateEventV1,
  TaskTransitionedPayloadV1,
  TaskUpdatedPayloadV1
} from "./event-payloads.js";
import type {
  TaskStateApplierError,
  TaskStateProjectionV1,
  TaskStateReplayResultV1,
  TaskVersionRecordV1
} from "./projection-types.js";

const PROJECTION_SCHEMA_VERSION = 1 as const;

export function createEmptyTaskStateProjection(
  lastUpdated = "1970-01-01T00:00:00.000Z"
): TaskStateProjectionV1 {
  return {
    schemaVersion: PROJECTION_SCHEMA_VERSION,
    tasksById: {},
    transitionLog: [],
    mutationLog: [],
    taskVersions: [],
    lastEventSequence: 0,
    lastUpdated
  };
}

function actorId(event: TaskStateEventV1): string | undefined {
  return event.actor?.id;
}

function bumpTaskVersion(
  projection: TaskStateProjectionV1,
  taskId: string,
  event: TaskStateEventV1
): void {
  const prior = projection.taskVersions.filter((row) => row.taskId === taskId);
  const version = (prior.at(-1)?.version ?? 0) + 1;
  const record: TaskVersionRecordV1 = {
    taskId,
    version,
    eventId: event.eventId,
    sequence: event.sequence,
    recordedAt: event.recordedAt
  };
  projection.taskVersions.push(record);
}

function applyCreated(
  projection: TaskStateProjectionV1,
  event: TaskStateEventV1,
  payload: TaskCreatedPayloadV1
): TaskStateApplierError | null {
  if (projection.tasksById[payload.taskId]) {
    return {
      code: "duplicate-task-id",
      message: `task.created for existing task ${payload.taskId}`,
      eventId: event.eventId
    };
  }
  const task: TaskEntity = {
    id: payload.taskId,
    status: payload.initialStatus,
    type: payload.type,
    title: payload.title,
    createdAt: event.recordedAt,
    updatedAt: event.recordedAt
  };
  projection.tasksById[payload.taskId] = task;
  bumpTaskVersion(projection, payload.taskId, event);
  const mutation: TaskMutationEvidence = {
    mutationId: event.eventId,
    mutationType: "create-task",
    taskId: payload.taskId,
    timestamp: event.recordedAt,
    actor: actorId(event),
    details: {
      clientMutationId: event.clientMutationId,
      initialStatus: payload.initialStatus
    }
  };
  projection.mutationLog.push(mutation);
  return null;
}

function applyTransitioned(
  projection: TaskStateProjectionV1,
  event: TaskStateEventV1,
  payload: TaskTransitionedPayloadV1
): TaskStateApplierError | null {
  const task = projection.tasksById[payload.taskId];
  if (!task) {
    return {
      code: "task-not-found",
      message: `task.transitioned for unknown task ${payload.taskId}`,
      eventId: event.eventId
    };
  }
  task.status = payload.toState;
  task.updatedAt = event.recordedAt;
  bumpTaskVersion(projection, payload.taskId, event);
  const evidence: TransitionEvidence = {
    transitionId: payload.transitionId,
    taskId: payload.taskId,
    fromState: payload.fromState,
    toState: payload.toState,
    action: payload.action,
    clientMutationId: event.clientMutationId,
    payloadDigest: payload.payloadDigest,
    guardResults: payload.guardResults,
    dependentsUnblocked: [...payload.dependentsUnblocked],
    timestamp: event.recordedAt,
    actor: actorId(event)
  };
  projection.transitionLog.push(evidence);
  return null;
}

function mergeTaskUpdate(task: TaskEntity, values: TaskUpdatedPayloadV1["values"]): void {
  if (!values) {
    return;
  }
  const { metadata, ...scalar } = values;
  for (const field of ["phase", "phaseKey"] as const) {
    if (scalar[field] === null) {
      delete task[field];
      delete scalar[field];
    }
  }
  Object.assign(task, scalar);
  if (metadata && typeof metadata === "object" && !Array.isArray(metadata)) {
    task.metadata = { ...(task.metadata ?? {}), ...metadata };
  }
}

function applyUpdated(
  projection: TaskStateProjectionV1,
  event: TaskStateEventV1,
  payload: TaskUpdatedPayloadV1
): TaskStateApplierError | null {
  const task = projection.tasksById[payload.taskId];
  if (!task) {
    return {
      code: "task-not-found",
      message: `task.updated for unknown task ${payload.taskId}`,
      eventId: event.eventId
    };
  }
  mergeTaskUpdate(task, payload.values);
  task.updatedAt = event.recordedAt;
  bumpTaskVersion(projection, payload.taskId, event);
  const mutation: TaskMutationEvidence = {
    mutationId: event.eventId,
    mutationType: "update-task",
    taskId: payload.taskId,
    timestamp: event.recordedAt,
    actor: actorId(event),
    details: {
      clientMutationId: event.clientMutationId,
      changedFields: [...payload.changedFields],
      payloadDigest: payload.payloadDigest
    }
  };
  projection.mutationLog.push(mutation);
  return null;
}

function applyBatchApplied(
  projection: TaskStateProjectionV1,
  event: TaskStateEventV1,
  payload: TaskBatchAppliedPayloadV1
): TaskStateApplierError | null {
  const anchorTaskId = payload.taskIds[0] ?? "batch";
  const mutation: TaskMutationEvidence = {
    mutationId: event.eventId,
    mutationType: "update-task",
    taskId: anchorTaskId,
    timestamp: event.recordedAt,
    actor: actorId(event),
    details: {
      batchApplied: true,
      batchId: payload.batchId,
      appliedCount: payload.appliedCount,
      transitionIds: [...payload.transitionIds],
      taskIds: [...payload.taskIds]
    }
  };
  projection.mutationLog.push(mutation);
  return null;
}

/** Apply one validated event to an in-memory projection (pure, no I/O). */
export function applyTaskStateEvent(
  projection: TaskStateProjectionV1,
  event: TaskStateEventV1,
  options?: { enforceSequence?: boolean }
): { ok: true; projection: TaskStateProjectionV1 } | { ok: false; error: TaskStateApplierError } {
  const enforceSequence = options?.enforceSequence ?? true;
  if (enforceSequence && event.sequence <= projection.lastEventSequence) {
    return {
      ok: false,
      error: {
        code: "event-order-violation",
        message: `sequence ${event.sequence} is not after last ${projection.lastEventSequence}`,
        eventId: event.eventId
      }
    };
  }

  const kind = event.kind as TaskStateEventKindV1;
  let err: TaskStateApplierError | null = null;
  switch (kind) {
    case "task.created":
      err = applyCreated(projection, event, event.payload as TaskCreatedPayloadV1);
      break;
    case "task.transitioned":
      err = applyTransitioned(projection, event, event.payload as TaskTransitionedPayloadV1);
      break;
    case "task.updated":
      err = applyUpdated(projection, event, event.payload as TaskUpdatedPayloadV1);
      break;
    case "task.batch_applied":
      err = applyBatchApplied(projection, event, event.payload as TaskBatchAppliedPayloadV1);
      break;
    default:
      err = {
        code: "invalid-event-kind",
        message: `unsupported kind ${String(kind)}`,
        eventId: event.eventId
      };
  }

  if (err) {
    return { ok: false, error: err };
  }

  projection.lastEventSequence = event.sequence;
  projection.lastUpdated = event.recordedAt;
  return { ok: true, projection };
}

function sortEventsDeterministic(events: TaskStateEventV1[]): TaskStateEventV1[] {
  return [...events].sort((a, b) => {
    if (a.sequence !== b.sequence) {
      return a.sequence - b.sequence;
    }
    return a.eventId.localeCompare(b.eventId);
  });
}

/** Replay a fixture or canonical stream into a stable store-shaped document. */
export function replayTaskStateEvents(
  events: TaskStateEventV1[],
  options?: { enforceSequence?: boolean }
):
  | { ok: true; result: TaskStateReplayResultV1 }
  | { ok: false; error: TaskStateApplierError } {
  const sorted = sortEventsDeterministic(events);
  let projection = createEmptyTaskStateProjection();
  for (const event of sorted) {
    const applied = applyTaskStateEvent(projection, event, options);
    if (!applied.ok) {
      return applied;
    }
    projection = applied.projection;
  }
  return { ok: true, result: { projection, document: materializeTaskStoreDocument(projection) } };
}

/** Stable task row ordering aligned with list-tasks pagination. */
export function materializeTaskStoreDocument(projection: TaskStateProjectionV1): TaskStoreDocument {
  const tasks = Object.values(projection.tasksById).sort((a, b) => compareTaskIdNumeric(a.id, b.id));
  return {
    schemaVersion: 1,
    tasks,
    transitionLog: [...projection.transitionLog],
    mutationLog: [...projection.mutationLog],
    lastUpdated: projection.lastUpdated
  };
}
