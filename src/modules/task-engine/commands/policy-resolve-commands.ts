import type { ModuleCommandResult, ModuleLifecycleContext } from "../../../contracts/module-contract.js";
import { attachPolicyMeta } from "../attach-planning-response-meta.js";
import type { OpenedPlanningStores } from "../persistence/planning-open.js";
import { resolveMaintainerDeliveryPolicy } from "../maintainer-delivery-policy-resolver.js";
import { resolveTaskIntakePolicy } from "../task-intake-policy-resolver.js";
import type { TaskStatus } from "../types.js";

/**
 * Read-only policy resolver commands (maintainer delivery).
 * Returns **`null`** when the command name is not handled here.
 */
export function resolveMaintainerDeliveryPolicyCommand(
  command: { name: string; args?: Record<string, unknown> },
  ctx: ModuleLifecycleContext,
  planning: OpenedPlanningStores
): ModuleCommandResult | null {
  if (command.name !== "resolve-maintainer-delivery-policy") {
    return null;
  }

  const args = command.args ?? {};
  const taskId = typeof args.taskId === "string" && args.taskId.trim().length > 0 ? args.taskId.trim() : null;
  const store = planning.taskStore;

  const phaseKey =
    typeof args.phaseKey === "string" && args.phaseKey.trim().length > 0 ? args.phaseKey.trim() : undefined;
  const moduleId =
    typeof args.moduleId === "string" && args.moduleId.trim().length > 0 ? args.moduleId.trim() : undefined;
  const slug =
    typeof args.slug === "string" && args.slug.trim().length > 0 ? args.slug.trim() : undefined;
  const version =
    typeof args.version === "string" && args.version.trim().length > 0 ? args.version.trim() : undefined;

  const task = taskId ? store.getTask(taskId) : undefined;
  if (taskId && !task && !phaseKey) {
    return {
      ok: false,
      code: "task-not-found",
      message: `Task '${taskId}' not found — pass phaseKey (and optional slug) for prospective resolution`
    };
  }

  if (!task && !taskId && !phaseKey && !moduleId) {
    return {
      ok: false,
      code: "invalid-args",
      message:
        "Provide taskId (preferred), or prospective context such as phaseKey (and optional moduleId, taskId, slug, version)"
    };
  }

  const resolved = resolveMaintainerDeliveryPolicy({
    effectiveConfig: ctx.effectiveConfig as Record<string, unknown> | undefined,
    task: task ?? null,
    taskId,
    phaseKey: phaseKey ?? null,
    moduleId: moduleId ?? null,
    slug: slug ?? null,
    version: version ?? null
  });

  const data: Record<string, unknown> = {
    ...resolved,
    taskId: task?.id ?? taskId,
    planningTouch: "read"
  };
  attachPolicyMeta(data, ctx, planning.sqliteDual.getPlanningGeneration());

  return {
    ok: true,
    code: "maintainer-delivery-policy-resolved",
    message: "Resolved maintainer delivery policy (read-only)",
    data
  };
}

export function resolveTaskIntakePolicyCommand(
  command: { name: string; args?: Record<string, unknown> },
  ctx: ModuleLifecycleContext,
  planning: OpenedPlanningStores
): ModuleCommandResult | null {
  if (command.name !== "resolve-task-intake-policy") {
    return null;
  }

  const args = command.args ?? {};
  const taskId = typeof args.taskId === "string" && args.taskId.trim().length > 0 ? args.taskId.trim() : null;
  const task = taskId ? planning.taskStore.getTask(taskId) : undefined;
  if (taskId && !task) {
    return {
      ok: false,
      code: "task-not-found",
      message: `Task '${taskId}' not found — omit taskId and pass explicit context fields for prospective resolution`
    };
  }

  const metadata =
    args.metadata && typeof args.metadata === "object" && !Array.isArray(args.metadata)
      ? (args.metadata as Record<string, unknown>)
      : null;
  const fields =
    args.fields && typeof args.fields === "object" && !Array.isArray(args.fields)
      ? (args.fields as Record<string, unknown>)
      : args;
  const targetStatus =
    typeof args.targetStatus === "string" && args.targetStatus.trim().length > 0
      ? (args.targetStatus.trim() as TaskStatus)
      : typeof args.status === "string" && args.status.trim().length > 0
        ? (args.status.trim() as TaskStatus)
        : null;

  const resolved = resolveTaskIntakePolicy({
    effectiveConfig: ctx.effectiveConfig as Record<string, unknown> | undefined,
    task: task ?? null,
    taskId,
    type: typeof args.type === "string" ? args.type : null,
    targetStatus,
    action: typeof args.action === "string" ? args.action : null,
    moduleId: typeof args.moduleId === "string" ? args.moduleId : null,
    category: typeof args.category === "string" ? args.category : null,
    phaseKey: typeof args.phaseKey === "string" ? args.phaseKey : null,
    metadata,
    fields
  });

  const data: Record<string, unknown> = {
    ...resolved,
    taskId: task?.id ?? taskId,
    planningTouch: "read"
  };
  attachPolicyMeta(data, ctx, planning.sqliteDual.getPlanningGeneration());

  return {
    ok: true,
    code: "task-intake-policy-resolved",
    message: "Resolved task intake policy (read-only)",
    data
  };
}
