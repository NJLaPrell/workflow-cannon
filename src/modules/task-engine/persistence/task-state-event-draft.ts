import crypto from "node:crypto";
import type { TaskEntity, TaskMutationEvidence, TransitionEvidence } from "../types.js";
import type {
  TaskCreatedPayloadV1,
  TaskStateEventKindV1,
  TaskStateEventV1,
  TaskTransitionedPayloadV1,
  TaskUpdatedPayloadV1
} from "../task-state-events/event-payloads.js";
import { transitionEvidenceToTransitionedPayload } from "../task-state-events/event-payloads.js";
import { TASK_STATE_EVENT_ENVELOPE_SCHEMA_VERSION } from "../task-state-events/types.js";
import { taskVersionFromStore } from "./task-state-canonical-authority.js";
import type { TaskStore } from "./store.js";

export type DraftEventContext = {
  commandName: string;
  moduleId?: string;
  invocationId?: string;
  actorId?: string;
  clientMutationId?: string;
  phaseKey?: string;
  gitHeadSha?: string;
};

function baseActor(ctx: DraftEventContext): TaskStateEventV1["actor"] {
  return { id: ctx.actorId?.trim() || "workspace-kit", source: "system" };
}

function draftEnvelope(
  kind: TaskStateEventKindV1,
  payload: TaskStateEventV1["payload"],
  ctx: DraftEventContext,
  expectedTaskVersion?: number
): TaskStateEventV1 {
  const event: TaskStateEventV1 = {
    schemaVersion: TASK_STATE_EVENT_ENVELOPE_SCHEMA_VERSION,
    eventId: `evt-${crypto.randomUUID()}`,
    sequence: 0,
    parentEventId: null,
    recordedAt: new Date().toISOString(),
    actor: baseActor(ctx),
    command: {
      name: ctx.commandName,
      moduleId: ctx.moduleId ?? "task-engine",
      invocationId: ctx.invocationId
    },
    kind,
    payload
  };
  if (ctx.clientMutationId?.trim()) {
    event.clientMutationId = ctx.clientMutationId.trim();
  }
  if (ctx.phaseKey?.trim() || ctx.gitHeadSha?.trim()) {
    event.workspace = {
      ...(ctx.gitHeadSha ? { gitHeadSha: ctx.gitHeadSha } : {}),
      ...(ctx.phaseKey ? { phaseKey: ctx.phaseKey } : {})
    };
  }
  if (expectedTaskVersion !== undefined && Number.isFinite(expectedTaskVersion)) {
    (event as TaskStateEventV1 & { expectedTaskVersion: number }).expectedTaskVersion =
      expectedTaskVersion;
  }
  return event;
}

export function draftTransitionedEvent(
  evidence: TransitionEvidence,
  ctx: DraftEventContext,
  store: TaskStore
): TaskStateEventV1 {
  const payload = transitionEvidenceToTransitionedPayload(evidence);
  const version = taskVersionFromStore(store, payload.taskId);
  return draftEnvelope(
    "task.transitioned",
    payload,
    ctx,
    version > 0 ? version : undefined
  );
}

export function draftCreatedEvent(
  task: TaskEntity,
  ctx: DraftEventContext
): TaskStateEventV1 {
  const payload: TaskCreatedPayloadV1 = {
    taskId: task.id,
    initialStatus: task.status,
    title: task.title,
    type: task.type
  };
  return draftEnvelope("task.created", payload, ctx);
}

export function draftUpdatedEvent(
  taskId: string,
  changedFields: string[],
  store: TaskStore,
  ctx: DraftEventContext,
  values?: TaskUpdatedPayloadV1["values"]
): TaskStateEventV1 {
  const version = taskVersionFromStore(store, taskId);
  const payload: TaskUpdatedPayloadV1 = {
    taskId,
    changedFields,
    ...(values ? { values } : {})
  };
  return draftEnvelope("task.updated", payload, ctx, version > 0 ? version : undefined);
}

export function draftEventsFromTransitionResult(input: {
  primary: TransitionEvidence;
  autoUnblocked: TransitionEvidence[];
  ctx: DraftEventContext;
  store: TaskStore;
}): TaskStateEventV1[] {
  const events = [draftTransitionedEvent(input.primary, input.ctx, input.store)];
  for (const evidence of input.autoUnblocked) {
    events.push(draftTransitionedEvent(evidence, { ...input.ctx, commandName: "run-transition" }, input.store));
  }
  return events;
}

export function mutationEvidenceToDraftEvent(
  mutation: TaskMutationEvidence,
  task: TaskEntity | undefined,
  store: TaskStore,
  ctx: DraftEventContext
): TaskStateEventV1 | null {
  if (mutation.mutationType === "create-task" || mutation.mutationType === "create-task-from-plan") {
    if (!task) {
      return null;
    }
    return draftCreatedEvent(task, ctx);
  }
  if (mutation.mutationType === "update-task") {
    const changed =
      mutation.details && typeof mutation.details === "object" && Array.isArray((mutation.details as { changedFields?: unknown }).changedFields)
        ? ((mutation.details as { changedFields: string[] }).changedFields)
        : ["metadata"];
    return draftUpdatedEvent(mutation.taskId, changed, store, ctx);
  }
  return null;
}
