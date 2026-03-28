import type { ModuleCommandResult, ModuleLifecycleContext } from "../../../contracts/module-contract.js";
import type { OpenedPlanningStores } from "../planning-open.js";
import type { TaskStore } from "../store.js";
import type { TaskEntity, TaskPriority, TaskStatus } from "../types.js";
import { validateKnownTaskTypeRequirements } from "../task-type-validation.js";
import {
  TASK_ID_RE,
  MUTABLE_TASK_FIELDS,
  digestPayload,
  readIdempotencyValue,
  findIdempotentMutation,
  strictValidationError,
  nowIso,
  mutationEvidence,
  resolveActor
} from "./shared.js";

export async function handleCreateTask(
  args: Record<string, unknown>,
  ctx: ModuleLifecycleContext,
  _planning: OpenedPlanningStores,
  store: TaskStore,
  commandName: string = "create-task"
): Promise<ModuleCommandResult> {
  const actor = resolveActor(args, ctx);
  const id = typeof args.id === "string" && args.id.trim().length > 0 ? args.id.trim() : undefined;
  const title = typeof args.title === "string" && args.title.trim().length > 0 ? args.title.trim() : undefined;
  const type = typeof args.type === "string" && args.type.trim().length > 0 ? args.type.trim() : "workspace-kit";
  const status = typeof args.status === "string" ? args.status : "proposed";
  const priority =
    typeof args.priority === "string" && ["P1", "P2", "P3"].includes(args.priority)
      ? (args.priority as TaskPriority)
      : undefined;
  const clientMutationId = readIdempotencyValue(args);
  if (!id || !title || !TASK_ID_RE.test(id) || !["proposed", "ready"].includes(status)) {
    return {
      ok: false,
      code: "invalid-task-schema",
      message: "create-task requires id/title, id format T<number>, and status of proposed or ready"
    };
  }
  const evidenceType = commandName === "create-task-from-plan" ? "create-task-from-plan" : "create-task";
  const timestamp = nowIso();
  const task: TaskEntity = {
    id,
    title,
    type,
    status: status as TaskStatus,
    createdAt: timestamp,
    updatedAt: timestamp,
    priority,
    dependsOn: Array.isArray(args.dependsOn) ? args.dependsOn.filter((x) => typeof x === "string") : undefined,
    unblocks: Array.isArray(args.unblocks) ? args.unblocks.filter((x) => typeof x === "string") : undefined,
    phase: typeof args.phase === "string" ? args.phase : undefined,
    metadata:
      typeof args.metadata === "object" && args.metadata !== null
        ? (args.metadata as Record<string, unknown>)
        : undefined,
    ownership: typeof args.ownership === "string" ? args.ownership : undefined,
    approach: typeof args.approach === "string" ? args.approach : undefined,
    technicalScope: Array.isArray(args.technicalScope)
      ? args.technicalScope.filter((x) => typeof x === "string")
      : undefined,
    acceptanceCriteria: Array.isArray(args.acceptanceCriteria)
      ? args.acceptanceCriteria.filter((x) => typeof x === "string")
      : undefined
  };
  if (commandName === "create-task-from-plan") {
    const planRef =
      typeof args.planRef === "string" && args.planRef.trim().length > 0 ? args.planRef.trim() : undefined;
    if (!planRef) {
      return {
        ok: false,
        code: "invalid-task-schema",
        message: "create-task-from-plan requires 'planRef'"
      };
    }
    task.metadata = { ...(task.metadata ?? {}), planRef };
  }
  const createPayloadForDigest = {
    id: task.id,
    title: task.title,
    type: task.type,
    status: task.status,
    priority: task.priority,
    dependsOn: task.dependsOn ?? [],
    unblocks: task.unblocks ?? [],
    phase: task.phase ?? null,
    metadata: task.metadata ?? null,
    ownership: task.ownership ?? null,
    approach: task.approach ?? null,
    technicalScope: task.technicalScope ?? [],
    acceptanceCriteria: task.acceptanceCriteria ?? []
  };
  const payloadDigest = digestPayload(createPayloadForDigest);
  if (clientMutationId) {
    const prior = findIdempotentMutation(store, evidenceType, id, clientMutationId);
    if (prior) {
      if (prior.payloadDigest !== payloadDigest) {
        return {
          ok: false,
          code: "idempotency-key-conflict",
          message: `clientMutationId '${clientMutationId}' was already used for a different ${evidenceType} payload on ${id}`
        };
      }
      return {
        ok: true,
        code: "task-create-idempotent-replay",
        message: `Idempotent create replay for task '${id}'`,
        data: { task: store.getTask(id), replayed: true } as Record<string, unknown>
      };
    }
  }
  if (store.getTask(id)) {
    return { ok: false, code: "duplicate-task-id", message: `Task '${id}' already exists` };
  }
  const knownTypeValidationError = validateKnownTaskTypeRequirements(task);
  if (knownTypeValidationError) {
    return {
      ok: false,
      code: knownTypeValidationError.code,
      message: knownTypeValidationError.message
    };
  }
  store.addTask(task);
  store.addMutationEvidence(
    mutationEvidence(evidenceType, id, actor, {
      initialStatus: task.status,
      source: commandName,
      clientMutationId,
      payloadDigest
    })
  );
  const strictIssue = strictValidationError(store, ctx.effectiveConfig as Record<string, unknown> | undefined);
  if (strictIssue) {
    return { ok: false, code: "strict-task-validation-failed", message: strictIssue };
  }
  await store.save();
  return {
    ok: true,
    code: "task-created",
    message: `Created task '${id}'`,
    data: { task } as Record<string, unknown>
  };
}

export async function handleUpdateTask(
  args: Record<string, unknown>,
  ctx: ModuleLifecycleContext,
  _planning: OpenedPlanningStores,
  store: TaskStore
): Promise<ModuleCommandResult> {
  const taskId = typeof args.taskId === "string" ? args.taskId : undefined;
  const updates =
    typeof args.updates === "object" && args.updates !== null
      ? (args.updates as Record<string, unknown>)
      : undefined;
  const actor = resolveActor(args, ctx);
  if (!taskId || !updates) {
    return { ok: false, code: "invalid-task-schema", message: "update-task requires taskId and updates object" };
  }
  const clientMutationId = readIdempotencyValue(args);
  const task = store.getTask(taskId);
  if (!task) {
    return { ok: false, code: "task-not-found", message: `Task '${taskId}' not found` };
  }
  const invalidKeys = Object.keys(updates).filter((key) => !MUTABLE_TASK_FIELDS.has(key));
  if (invalidKeys.length > 0) {
    return {
      ok: false,
      code: "invalid-task-update",
      message: `update-task cannot mutate immutable fields: ${invalidKeys.join(", ")}`
    };
  }
  const updatedTask = { ...task, ...updates, updatedAt: nowIso() };
  const payloadDigest = digestPayload({ taskId, updates });
  if (clientMutationId) {
    const prior = findIdempotentMutation(store, "update-task", taskId, clientMutationId);
    if (prior) {
      if (prior.payloadDigest !== payloadDigest) {
        return {
          ok: false,
          code: "idempotency-key-conflict",
          message: `clientMutationId '${clientMutationId}' was already used for a different update-task payload on ${taskId}`
        };
      }
      return {
        ok: true,
        code: "task-update-idempotent-replay",
        message: `Idempotent update replay for task '${taskId}'`,
        data: { task, replayed: true } as Record<string, unknown>
      };
    }
  }
  const knownTypeValidationError = validateKnownTaskTypeRequirements(updatedTask);
  if (knownTypeValidationError) {
    return {
      ok: false,
      code: knownTypeValidationError.code,
      message: knownTypeValidationError.message
    };
  }
  store.updateTask(updatedTask);
  store.addMutationEvidence(
    mutationEvidence("update-task", taskId, actor, {
      updatedFields: Object.keys(updates),
      clientMutationId,
      payloadDigest
    })
  );
  const strictIssue = strictValidationError(store, ctx.effectiveConfig as Record<string, unknown> | undefined);
  if (strictIssue) {
    return { ok: false, code: "strict-task-validation-failed", message: strictIssue };
  }
  await store.save();
  return {
    ok: true,
    code: "task-updated",
    message: `Updated task '${taskId}'`,
    data: { task: updatedTask } as Record<string, unknown>
  };
}

export async function handleArchiveTask(
  args: Record<string, unknown>,
  ctx: ModuleLifecycleContext,
  _planning: OpenedPlanningStores,
  store: TaskStore
): Promise<ModuleCommandResult> {
  const taskId = typeof args.taskId === "string" ? args.taskId : undefined;
  const actor = resolveActor(args, ctx);
  if (!taskId) {
    return { ok: false, code: "invalid-task-schema", message: "archive-task requires taskId" };
  }
  const task = store.getTask(taskId);
  if (!task) {
    return { ok: false, code: "task-not-found", message: `Task '${taskId}' not found` };
  }
  const archivedAt = nowIso();
  const updatedTask = { ...task, archived: true, archivedAt, updatedAt: archivedAt };
  store.updateTask(updatedTask);
  store.addMutationEvidence(mutationEvidence("archive-task", taskId, actor));
  const strictIssue = strictValidationError(store, ctx.effectiveConfig as Record<string, unknown> | undefined);
  if (strictIssue) {
    return { ok: false, code: "strict-task-validation-failed", message: strictIssue };
  }
  await store.save();
  return {
    ok: true,
    code: "task-archived",
    message: `Archived task '${taskId}'`,
    data: { task: updatedTask } as Record<string, unknown>
  };
}
