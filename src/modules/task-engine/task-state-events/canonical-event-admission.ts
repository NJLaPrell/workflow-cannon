import { getTransitionAction, isTransitionAllowed } from "../transitions.js";
import type { CanonicalStateEventV1 } from "./canonical-state-events.js";
import { isPlanningStateEvent, isTaskStateEvent } from "./canonical-state-events.js";
import { isPlanningStateEventKind } from "./planning-event-payloads.js";
import {
  CANONICAL_STATE_EVENT_LOG_SUPPORTED_KINDS,
  TASK_STATE_EVENT_LOG_SUPPORTED_SCHEMA_VERSION
} from "./event-admission-policy.js";
import { applyTaskStateEvent, createEmptyTaskStateProjection } from "./event-applier.js";
import type { TaskStateEventV1, TaskTransitionedPayloadV1 } from "./event-payloads.js";
import type { PlanningStateEventV1 } from "./planning-event-payloads.js";
import { applyPlanningStateEvent, createEmptyPlanningStateProjection } from "./planning-event-applier.js";
import type { PlanningStateProjectionV1 } from "./planning-projection-types.js";
import type { TaskStateProjectionV1 } from "./projection-types.js";
import { validateCanonicalStateEvent } from "./validate-canonical-event.js";

export type CanonicalEventAdmissionErrorCode =
  | "unsupported-schema-version"
  | "unknown-event-kind"
  | "schema-validation-failed"
  | "duplicate-idempotency-key"
  | "invalid-lifecycle-transition"
  | "duplicate-task-id"
  | "task-not-found"
  | "workspace-revision-mismatch"
  | "module-state-schema-version-mismatch"
  | "replay-conflict";

export type CanonicalEventAdmissionError = {
  code: CanonicalEventAdmissionErrorCode;
  message: string;
  details?: string[];
};

export type CanonicalEventAdmissionContext = {
  priorEvents?: CanonicalStateEventV1[];
  initialTaskProjection?: TaskStateProjectionV1;
  initialPlanningProjection?: PlanningStateProjectionV1;
  /** Authoritative task projection at the tail boundary; prior task events are not replayed. */
  checkpointTaskProjection?: TaskStateProjectionV1;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function payloadTaskId(event: CanonicalStateEventV1): string | undefined {
  if (!isTaskStateEvent(event)) {
    return undefined;
  }
  const payload = event.payload;
  if (payload && typeof payload === "object" && "taskId" in payload) {
    const taskId = (payload as { taskId?: unknown }).taskId;
    return typeof taskId === "string" ? taskId : undefined;
  }
  return undefined;
}

function canonicalEventPayloadFingerprint(event: CanonicalStateEventV1): string {
  return JSON.stringify({ kind: event.kind, payload: event.payload });
}

/** True when two events share an idempotency key and would apply the same mutation. */
export function canonicalEventsAreIdempotentDuplicates(
  prior: CanonicalStateEventV1,
  next: CanonicalStateEventV1
): boolean {
  const key = next.clientMutationId?.trim();
  if (!key || prior.clientMutationId?.trim() !== key) {
    return false;
  }
  if (prior.eventId === next.eventId) {
    return true;
  }
  return canonicalEventPayloadFingerprint(prior) === canonicalEventPayloadFingerprint(next);
}

function findPriorEventWithClientMutationId(
  key: string,
  priorEvents: CanonicalStateEventV1[]
): CanonicalStateEventV1 | undefined {
  for (let idx = priorEvents.length - 1; idx >= 0; idx -= 1) {
    const prior = priorEvents[idx];
    if (prior.clientMutationId?.trim() === key) {
      return prior;
    }
  }
  return undefined;
}

function checkIdempotency(
  event: CanonicalStateEventV1,
  priorEvents: CanonicalStateEventV1[]
): CanonicalEventAdmissionError | null {
  const key = event.clientMutationId?.trim();
  if (!key) {
    return null;
  }
  const prior = findPriorEventWithClientMutationId(key, priorEvents);
  if (!prior || prior.eventId === event.eventId) {
    return null;
  }
  return {
    code: "duplicate-idempotency-key",
    message: `clientMutationId '${key}' already used by event ${prior.eventId}`
  };
}

function cloneTaskProjection(projection: TaskStateProjectionV1): TaskStateProjectionV1 {
  return {
    ...projection,
    tasksById: { ...projection.tasksById },
    transitionLog: [...projection.transitionLog],
    mutationLog: [...projection.mutationLog],
    taskVersions: [...projection.taskVersions]
  };
}

function clonePlanningProjection(projection: PlanningStateProjectionV1): PlanningStateProjectionV1 {
  return {
    ...projection,
    phaseCatalogByKey: { ...projection.phaseCatalogByKey },
    phaseNotesById: Object.fromEntries(
      Object.entries(projection.phaseNotesById).map(([id, note]) => [id, { ...note, refs: note.refs.map((r) => ({ ...r })) }])
    ),
    phaseNoteSuggestionsById: { ...projection.phaseNoteSuggestionsById },
    ideasById: { ...projection.ideasById },
    moduleStateById: Object.fromEntries(
      Object.entries(projection.moduleStateById).map(([id, row]) => [id, { ...row, state: { ...row.state } }])
    ),
    workspaceStatus: projection.workspaceStatus ? { ...projection.workspaceStatus } : null,
    workspaceStatusAudits: [...projection.workspaceStatusAudits],
    appliedWorkspaceMutationIds: new Set(projection.appliedWorkspaceMutationIds),
    appliedNoteIdempotencyKeys: new Set(projection.appliedNoteIdempotencyKeys),
    appliedSuggestionMutationIds: new Set(projection.appliedSuggestionMutationIds),
    appliedIdeaMutationIds: new Set(projection.appliedIdeaMutationIds),
    appliedModuleStateMutationIds: new Set(projection.appliedModuleStateMutationIds)
  };
}

function buildProjections(
  priorEvents: CanonicalStateEventV1[],
  initialTaskProjection?: TaskStateProjectionV1,
  initialPlanningProjection?: PlanningStateProjectionV1,
  checkpointTaskProjection?: TaskStateProjectionV1
):
  | {
      ok: true;
      taskProjection: TaskStateProjectionV1;
      planningProjection: PlanningStateProjectionV1;
    }
  | { ok: false; error: CanonicalEventAdmissionError } {
  let taskProjection = checkpointTaskProjection
    ? cloneTaskProjection(checkpointTaskProjection)
    : initialTaskProjection
      ? cloneTaskProjection(initialTaskProjection)
      : createEmptyTaskStateProjection();
  let planningProjection = initialPlanningProjection
    ? clonePlanningProjection(initialPlanningProjection)
    : createEmptyPlanningStateProjection();

  const ordered = [...priorEvents].sort((a, b) => {
    if (a.sequence !== b.sequence) {
      return a.sequence - b.sequence;
    }
    return a.eventId.localeCompare(b.eventId);
  });

  for (const event of ordered) {
    if (
      checkpointTaskProjection &&
      isTaskStateEvent(event) &&
      event.sequence <= checkpointTaskProjection.lastEventSequence
    ) {
      continue;
    }
    if (isTaskStateEvent(event)) {
      const applied = applyTaskStateEvent(taskProjection, event);
      if (!applied.ok) {
        return {
          ok: false,
          error: {
            code: "replay-conflict",
            message: applied.error.message,
            details: [applied.error.code]
          }
        };
      }
      taskProjection = applied.projection;
    } else if (isPlanningStateEvent(event)) {
      const applied = applyPlanningStateEvent(planningProjection, event);
      if (!applied.ok) {
        return {
          ok: false,
          error: {
            code:
              applied.error.code === "workspace-revision-mismatch"
                ? "workspace-revision-mismatch"
                : applied.error.code === "module-state-schema-version-mismatch"
                  ? "module-state-schema-version-mismatch"
                  : "replay-conflict",
            message: applied.error.message,
            details: [applied.error.code]
          }
        };
      }
      planningProjection = applied.projection;
    }
  }

  return { ok: true, taskProjection, planningProjection };
}

function taskVersionForProjection(projection: TaskStateProjectionV1, taskId: string): number {
  const rows = projection.taskVersions.filter((row) => row.taskId === taskId);
  return rows.at(-1)?.version ?? 0;
}

function checkExpectedTaskVersion(
  event: TaskStateEventV1,
  projection: TaskStateProjectionV1
): CanonicalEventAdmissionError | null {
  const expected = event.expectedTaskVersion;
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

function checkExpectedWorkspaceRevision(
  event: PlanningStateEventV1,
  projection: PlanningStateProjectionV1
): CanonicalEventAdmissionError | null {
  if (event.kind !== "planning.workspace_status.updated") {
    return null;
  }
  const expected = event.expectedWorkspaceRevision;
  if (expected === undefined) {
    return null;
  }
  const actual = projection.workspaceStatus?.workspaceRevision ?? 0;
  if (actual !== expected) {
    return {
      code: "workspace-revision-mismatch",
      message: `expectedWorkspaceRevision ${expected} does not match replayed workspace revision ${actual}`,
      details: ["stale-workspace-revision"]
    };
  }
  return null;
}

function checkExpectedModuleStateSchemaVersion(
  event: PlanningStateEventV1,
  projection: PlanningStateProjectionV1
): CanonicalEventAdmissionError | null {
  if (event.kind !== "planning.module_state.updated") {
    return null;
  }
  const payload = event.payload as { moduleId?: string; expectedStateSchemaVersion?: number };
  if (payload.expectedStateSchemaVersion === undefined || typeof payload.moduleId !== "string") {
    return null;
  }
  const actual = projection.moduleStateById[payload.moduleId]?.stateSchemaVersion ?? 0;
  if (actual !== payload.expectedStateSchemaVersion) {
    return {
      code: "module-state-schema-version-mismatch",
      message: `expectedStateSchemaVersion ${payload.expectedStateSchemaVersion} does not match replayed module state version ${actual} for ${payload.moduleId}`,
      details: ["stale-module-state-schema-version"]
    };
  }
  return null;
}

function checkLifecycleTransition(
  event: TaskStateEventV1,
  projection: TaskStateProjectionV1
): CanonicalEventAdmissionError | null {
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
): CanonicalEventAdmissionError | null {
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

export function admitCanonicalStateEvent(
  input: unknown,
  context: CanonicalEventAdmissionContext = {}
): { ok: true; event: CanonicalStateEventV1 } | { ok: false; error: CanonicalEventAdmissionError } {
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
  if (typeof kindRaw === "string" && !CANONICAL_STATE_EVENT_LOG_SUPPORTED_KINDS.includes(kindRaw)) {
    return {
      ok: false,
      error: {
        code: "unknown-event-kind",
        message: `unknown event kind '${kindRaw}'`
      }
    };
  }

  const validated = validateCanonicalStateEvent(input);
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

  const projectionResult = buildProjections(
    priorEvents,
    context.initialTaskProjection,
    context.initialPlanningProjection,
    context.checkpointTaskProjection
  );
  if (!projectionResult.ok) {
    return projectionResult;
  }

  if (isTaskStateEvent(event)) {
    const taskEvent = event as TaskStateEventV1;
    const createdErr = checkCreated(taskEvent, projectionResult.taskProjection);
    if (createdErr) {
      return { ok: false, error: createdErr };
    }
    const lifecycleErr = checkLifecycleTransition(taskEvent, projectionResult.taskProjection);
    if (lifecycleErr) {
      return { ok: false, error: lifecycleErr };
    }
    const versionErr = checkExpectedTaskVersion(taskEvent, projectionResult.taskProjection);
    if (versionErr) {
      return { ok: false, error: versionErr };
    }
    const taskId = payloadTaskId(taskEvent);
    if (
      (taskEvent.kind === "task.updated" || taskEvent.kind === "task.transitioned") &&
      taskId &&
      !projectionResult.taskProjection.tasksById[taskId]
    ) {
      return {
        ok: false,
        error: {
          code: "task-not-found",
          message: `${taskEvent.kind} references unknown task ${taskId}`
        }
      };
    }
    const applied = applyTaskStateEvent(projectionResult.taskProjection, taskEvent);
    if (!applied.ok) {
      return {
        ok: false,
        error: {
          code: "replay-conflict",
          message: applied.error.message,
          details: [applied.error.code]
        }
      };
    }
  } else if (isPlanningStateEvent(event)) {
    const planningEvent = event as PlanningStateEventV1;
    const revisionErr = checkExpectedWorkspaceRevision(planningEvent, projectionResult.planningProjection);
    if (revisionErr) {
      return { ok: false, error: revisionErr };
    }
    const moduleStateErr = checkExpectedModuleStateSchemaVersion(
      planningEvent,
      projectionResult.planningProjection
    );
    if (moduleStateErr) {
      return { ok: false, error: moduleStateErr };
    }
    const applied = applyPlanningStateEvent(projectionResult.planningProjection, planningEvent);
    if (!applied.ok) {
      return {
        ok: false,
        error: {
          code:
            applied.error.code === "workspace-revision-mismatch"
              ? "workspace-revision-mismatch"
              : applied.error.code === "module-state-schema-version-mismatch"
                ? "module-state-schema-version-mismatch"
                : "replay-conflict",
          message: applied.error.message,
          details: [applied.error.code]
        }
      };
    }
  }

  return { ok: true, event };
}

export function admitCanonicalStateEventStream(
  inputs: unknown[],
  options?: CanonicalEventAdmissionContext
): { ok: true; events: CanonicalStateEventV1[] } | { ok: false; error: CanonicalEventAdmissionError } {
  const admitted: CanonicalStateEventV1[] = [...(options?.priorEvents ?? [])];
  const toAppend = [...inputs].sort((a, b) => {
    const sa = isRecord(a) && typeof a.sequence === "number" ? a.sequence : 0;
    const sb = isRecord(b) && typeof b.sequence === "number" ? b.sequence : 0;
    if (sa !== sb) return sa - sb;
    const ea = isRecord(a) && typeof a.eventId === "string" ? a.eventId : "";
    const eb = isRecord(b) && typeof b.eventId === "string" ? b.eventId : "";
    return ea.localeCompare(eb);
  });

  for (const input of toAppend) {
    const result = admitCanonicalStateEvent(input, {
      priorEvents: admitted,
      initialTaskProjection: options?.initialTaskProjection,
      initialPlanningProjection: options?.initialPlanningProjection,
      checkpointTaskProjection: options?.checkpointTaskProjection
    });
    if (!result.ok) {
      if (result.error.code === "duplicate-idempotency-key" && isRecord(input)) {
        const key =
          typeof input.clientMutationId === "string" ? input.clientMutationId.trim() : "";
        const prior = key ? findPriorEventWithClientMutationId(key, admitted) : undefined;
        if (
          prior &&
          canonicalEventsAreIdempotentDuplicates(prior, input as CanonicalStateEventV1)
        ) {
          continue;
        }
      }
      return result;
    }
    admitted.push(result.event);
  }

  return { ok: true, events: admitted.slice(options?.priorEvents?.length ?? 0) };
}

/** Back-compat: task-only admission delegates to canonical stream. */
export function admitTaskStateEventStreamForCanonical(
  inputs: unknown[],
  options?: { priorEvents?: TaskStateEventV1[]; initialProjection?: TaskStateProjectionV1 }
): ReturnType<typeof admitCanonicalStateEventStream> {
  return admitCanonicalStateEventStream(inputs, {
    priorEvents: options?.priorEvents as CanonicalStateEventV1[] | undefined,
    initialTaskProjection: options?.initialProjection
  });
}

export function createEmptyCanonicalProjections(): {
  taskProjection: TaskStateProjectionV1;
  planningProjection: PlanningStateProjectionV1;
} {
  return {
    taskProjection: createEmptyTaskStateProjection(),
    planningProjection: createEmptyPlanningStateProjection()
  };
}
