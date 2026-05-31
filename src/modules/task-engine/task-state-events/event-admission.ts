import { getTransitionAction, isTransitionAllowed } from "../transitions.js";
import type { TaskStateEventKindV1, TaskStateEventV1, TaskTransitionedPayloadV1 } from "./event-payloads.js";
import {
  admitCanonicalStateEvent,
  admitCanonicalStateEventStream,
  type CanonicalEventAdmissionError
} from "./canonical-event-admission.js";
import type { CanonicalStateEventV1 } from "./canonical-state-events.js";
import { isPlanningStateEventKind } from "./planning-event-payloads.js";
import {
  TASK_STATE_EVENT_LOG_SUPPORTED_KINDS,
  TASK_STATE_EVENT_LOG_SUPPORTED_SCHEMA_VERSION
} from "./event-admission-policy.js";
import { applyTaskStateEvent, createEmptyTaskStateProjection } from "./event-applier.js";
import type { TaskStateProjectionV1 } from "./projection-types.js";
import { validateTaskStateEvent } from "./validate-event.js";

export type TaskStateEventAdmissionErrorCode =
  | "unsupported-schema-version"
  | "unknown-event-kind"
  | "schema-validation-failed"
  | "duplicate-idempotency-key"
  | "invalid-lifecycle-transition"
  | "duplicate-task-id"
  | "task-not-found"
  | "replay-conflict";

export type TaskStateEventAdmissionError = {
  code: TaskStateEventAdmissionErrorCode;
  message: string;
  details?: string[];
};

export type TaskStateEventAdmissionContext = {
  /** Events already admitted to the canonical stream (in sequence order). */
  priorEvents?: TaskStateEventV1[];
  /** When the branch stores a bootstrap snapshot with no tail events yet, seed replay from snapshot. */
  initialProjection?: TaskStateProjectionV1;
  /** Authoritative task projection at the tail boundary; prior task events are not replayed. */
  checkpointTaskProjection?: TaskStateProjectionV1;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function payloadTaskId(event: TaskStateEventV1): string | undefined {
  const payload = event.payload;
  if (payload && typeof payload === "object" && "taskId" in payload) {
    const taskId = (payload as { taskId?: unknown }).taskId;
    return typeof taskId === "string" ? taskId : undefined;
  }
  return undefined;
}

function checkIdempotency(
  event: TaskStateEventV1,
  priorEvents: TaskStateEventV1[]
): TaskStateEventAdmissionError | null {
  const key = event.clientMutationId?.trim();
  if (!key) {
    return null;
  }
  for (const prior of priorEvents) {
    if (prior.clientMutationId?.trim() !== key) {
      continue;
    }
    if (prior.eventId === event.eventId) {
      continue;
    }
    return {
      code: "duplicate-idempotency-key",
      message: `clientMutationId '${key}' already used by event ${prior.eventId}`
    };
  }
  return null;
}

function cloneProjection(projection: TaskStateProjectionV1): TaskStateProjectionV1 {
  return {
    ...projection,
    tasksById: { ...projection.tasksById },
    transitionLog: [...projection.transitionLog],
    mutationLog: [...projection.mutationLog],
    taskVersions: [...projection.taskVersions]
  };
}

function buildProjection(
  priorEvents: TaskStateEventV1[],
  initialProjection?: TaskStateProjectionV1
):
  | { ok: true; projection: TaskStateProjectionV1 }
  | { ok: false; error: TaskStateEventAdmissionError } {
  let projection = initialProjection
    ? cloneProjection(initialProjection)
    : createEmptyTaskStateProjection();
  for (const prior of priorEvents) {
    const applied = applyTaskStateEvent(projection, prior);
    if (!applied.ok) {
      return {
        ok: false,
        error: {
          code: "replay-conflict",
          message: `prior stream failed replay at ${prior.eventId}: ${applied.error.message}`,
          details: [applied.error.code]
        }
      };
    }
    projection = applied.projection;
  }
  return { ok: true, projection };
}

function taskVersionForProjection(projection: TaskStateProjectionV1, taskId: string): number {
  const rows = projection.taskVersions.filter((row) => row.taskId === taskId);
  return rows.at(-1)?.version ?? 0;
}

function checkExpectedTaskVersion(
  event: TaskStateEventV1,
  projection: TaskStateProjectionV1
): TaskStateEventAdmissionError | null {
  const expected = (event as TaskStateEventV1 & { expectedTaskVersion?: number }).expectedTaskVersion;
  if (expected === undefined) {
    return null;
  }
  const taskId = payloadTaskId(event);
  if (!taskId) {
    return null;
  }
  const actual = taskVersionForProjection(projection, taskId);
  if (actual !== expected) {
    return {
      code: "replay-conflict",
      message: `expectedTaskVersion ${expected} does not match replayed version ${actual} for ${taskId}`,
      details: ["stale-task-version"]
    };
  }
  return null;
}

function checkLifecycleTransition(
  event: TaskStateEventV1,
  projection: TaskStateProjectionV1
): TaskStateEventAdmissionError | null {
  if (event.kind !== "task.transitioned") {
    return null;
  }
  const payload = event.payload as TaskTransitionedPayloadV1;
  const task = projection.tasksById[payload.taskId];
  if (!task) {
    return {
      code: "task-not-found",
      message: `task.transitioned references unknown task ${payload.taskId}`
    };
  }
  if (task.status !== payload.fromState) {
    return {
      code: "invalid-lifecycle-transition",
      message: `fromState ${payload.fromState} does not match replayed status ${task.status} for ${payload.taskId}`
    };
  }
  if (!isTransitionAllowed(payload.fromState, payload.toState)) {
    return {
      code: "invalid-lifecycle-transition",
      message: `transition ${payload.fromState} -> ${payload.toState} is not allowed`
    };
  }
  const expectedAction = getTransitionAction(payload.fromState, payload.toState);
  if (expectedAction && expectedAction !== payload.action) {
    return {
      code: "invalid-lifecycle-transition",
      message: `action '${payload.action}' does not match expected '${expectedAction}' for ${payload.fromState} -> ${payload.toState}`
    };
  }
  return null;
}

function checkCreated(
  event: TaskStateEventV1,
  projection: TaskStateProjectionV1
): TaskStateEventAdmissionError | null {
  if (event.kind !== "task.created") {
    return null;
  }
  const taskId = payloadTaskId(event);
  if (taskId && projection.tasksById[taskId]) {
    return {
      code: "duplicate-task-id",
      message: `task.created for existing task ${taskId}`
    };
  }
  return null;
}

/**
 * Fail malformed or unsupported events before they enter canonical history.
 */
export function admitTaskStateEvent(
  input: unknown,
  context: TaskStateEventAdmissionContext = {}
): { ok: true; event: TaskStateEventV1 } | { ok: false; error: TaskStateEventAdmissionError } {
  if (!isRecord(input)) {
    return {
      ok: false,
      error: { code: "schema-validation-failed", message: "event must be an object" }
    };
  }

  const schemaVersion = input.schemaVersion;
  if (schemaVersion !== TASK_STATE_EVENT_LOG_SUPPORTED_SCHEMA_VERSION) {
    return {
      ok: false,
      error: {
        code: "unsupported-schema-version",
        message: `schemaVersion ${String(schemaVersion)} is not supported (expected ${TASK_STATE_EVENT_LOG_SUPPORTED_SCHEMA_VERSION})`
      }
    };
  }

  const kindRaw = input.kind;
  if (typeof kindRaw === "string" && isPlanningStateEventKind(kindRaw)) {
    return admitCanonicalStateEvent(input, context as { priorEvents?: CanonicalStateEventV1[] }) as
      | { ok: true; event: TaskStateEventV1 }
      | { ok: false; error: TaskStateEventAdmissionError };
  }
  if (typeof kindRaw === "string" && !TASK_STATE_EVENT_LOG_SUPPORTED_KINDS.includes(kindRaw as TaskStateEventKindV1)) {
    return {
      ok: false,
      error: {
        code: "unknown-event-kind",
        message: `unknown event kind '${kindRaw}'`
      }
    };
  }

  const validated = validateTaskStateEvent(input);
  if (!validated.ok) {
    return {
      ok: false,
      error: {
        code: "schema-validation-failed",
        message: "event failed JSON schema validation",
        details: validated.errors
      }
    };
  }

  const event = validated.data;
  const priorEvents = context.priorEvents ?? [];

  const idempotencyErr = checkIdempotency(event, priorEvents);
  if (idempotencyErr) {
    return { ok: false, error: idempotencyErr };
  }

  const projectionResult = buildProjection(priorEvents, context.initialProjection);
  if (!projectionResult.ok) {
    return { ok: false, error: projectionResult.error };
  }

  const createdErr = checkCreated(event, projectionResult.projection);
  if (createdErr) {
    return { ok: false, error: createdErr };
  }

  const lifecycleErr = checkLifecycleTransition(event, projectionResult.projection);
  if (lifecycleErr) {
    return { ok: false, error: lifecycleErr };
  }

  const versionErr = checkExpectedTaskVersion(event, projectionResult.projection);
  if (versionErr) {
    return { ok: false, error: versionErr };
  }

  const taskId = payloadTaskId(event);
  if (
    (event.kind === "task.updated" || event.kind === "task.transitioned") &&
    taskId &&
    !projectionResult.projection.tasksById[taskId]
  ) {
    return {
      ok: false,
      error: {
        code: "task-not-found",
        message: `${event.kind} references unknown task ${taskId}`
      }
    };
  }

  return { ok: true, event };
}

/** Admit a batch in deterministic sequence order (mutates nothing; validates append chain). */
export function admitTaskStateEventStream(
  inputs: unknown[],
  options?: {
    priorEvents?: CanonicalStateEventV1[];
    initialProjection?: TaskStateProjectionV1;
    checkpointTaskProjection?: TaskStateProjectionV1;
  }
): { ok: true; events: TaskStateEventV1[] } | { ok: false; error: TaskStateEventAdmissionError } {
  const result = admitCanonicalStateEventStream(inputs, {
    priorEvents: options?.priorEvents,
    initialTaskProjection: options?.initialProjection,
    checkpointTaskProjection: options?.checkpointTaskProjection
  });
  if (!result.ok) {
    return {
      ok: false,
      error: mapCanonicalAdmissionError(result.error)
    };
  }
  return { ok: true, events: result.events as TaskStateEventV1[] };
}

function mapCanonicalAdmissionError(error: CanonicalEventAdmissionError): TaskStateEventAdmissionError {
  const code =
    error.code === "workspace-revision-mismatch"
      ? "replay-conflict"
      : (error.code as TaskStateEventAdmissionError["code"]);
  return {
    code,
    message: error.message,
    details: error.details
  };
}
