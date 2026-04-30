import type { ModuleCommandResult, ModuleLifecycleContext } from "../../../contracts/module-contract.js";
import { createKitLifecycleHookBus } from "../../../core/kit-lifecycle-hooks.js";
import { attachPolicyMeta } from "../attach-planning-response-meta.js";
import {
  createDeliveryEvidenceGuard,
  readDeliveryEvidenceEnforcementMode
} from "../delivery-evidence.js";
import { planningGenPolicyGate } from "../planning-generation-gate.js";
import type { OpenedPlanningStores } from "../persistence/planning-open.js";
import { TaskStore } from "../persistence/store.js";
import { TransitionService } from "../service.js";
import { getNextActions } from "../suggestions.js";
import { TaskEngineError } from "../transitions.js";
import type { TaskEntity } from "../types.js";
import { readIdempotencyValue, readOptionalExpectedPlanningGeneration } from "../mutation-utils.js";
import { readQueueNamespaceArg } from "../queue-namespace-args.js";

export function readPlanString(args: Record<string, unknown>, field: string): string | undefined {
  const value = args[field];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

export function dependencyBlockersForAction(
  task: TaskEntity,
  action: string | undefined,
  tasks: TaskEntity[]
): string[] {
  const needsDependencyCheck =
    (task.status === "ready" && action === "start") || (task.status === "blocked" && action === "unblock");
  if (!needsDependencyCheck) {
    return [];
  }
  const byId = new Map(tasks.map((row) => [row.id, row]));
  return (task.dependsOn ?? []).filter((depId) => byId.get(depId)?.status !== "completed");
}

const TASK_INTENT_ACTIONS: Record<string, string> = {
  "start-task": "start",
  "complete-task": "complete"
};

function hasPriorTransitionForClientMutationId(store: TaskStore, clientMutationId: string | undefined): boolean {
  return (
    clientMutationId !== undefined &&
    store.getTransitionLog().some((entry) => entry.clientMutationId === clientMutationId)
  );
}

export async function runTaskIntentTransition(
  commandName: string,
  ctx: ModuleLifecycleContext,
  planning: OpenedPlanningStores,
  args: Record<string, unknown>
): Promise<ModuleCommandResult> {
  const action = TASK_INTENT_ACTIONS[commandName];
  const taskId = readPlanString(args, "taskId");
  if (!action || !taskId) {
    return {
      ok: false,
      code: "invalid-run-args",
      message: `${commandName} requires taskId.`,
      remediation: { instructionPath: `src/modules/task-engine/instructions/${commandName}.md` }
    };
  }
  const clientMutationId = readIdempotencyValue(args);
  const pgTransition = planningGenPolicyGate(
    ctx,
    args,
    `src/modules/task-engine/instructions/${commandName}.md`,
    planning.sqliteDual.getPlanningGeneration()
  );
  if (pgTransition.block && !hasPriorTransitionForClientMutationId(planning.taskStore, clientMutationId)) {
    return pgTransition.block;
  }
  const hookBus = createKitLifecycleHookBus(ctx.workspacePath, (ctx.effectiveConfig ?? {}) as Record<string, unknown>);
  const deliveryEvidenceMode = readDeliveryEvidenceEnforcementMode(
    ctx.effectiveConfig as Record<string, unknown> | undefined
  );
  const service = new TransitionService(
    planning.taskStore,
    [createDeliveryEvidenceGuard({ enforcementMode: deliveryEvidenceMode })],
    hookBus.isEnabled() ? hookBus : undefined
  );
  try {
    const result = await service.runTransition({
      taskId,
      action,
      actor: readPlanString(args, "actor"),
      expectedPlanningGeneration: readOptionalExpectedPlanningGeneration(args),
      clientMutationId
    });
    const data: Record<string, unknown> = {
      intent: commandName,
      taskId,
      action,
      evidence: result.evidence,
      autoUnblocked: result.autoUnblocked,
      replayed: result.replayed === true
    };
    attachPolicyMeta(data, ctx, planning.sqliteDual.getPlanningGeneration(), pgTransition.warnings);
    return {
      ok: true,
      code: result.replayed ? "task-intent-idempotent-replay" : "task-intent-applied",
      message: `${commandName}: ${taskId} via ${action}`,
      data
    };
  } catch (err) {
    if (err instanceof TaskEngineError) {
      return { ok: false, code: err.code, message: err.message };
    }
    throw err;
  }
}

export async function runClaimNextTaskIntent(
  ctx: ModuleLifecycleContext,
  planning: OpenedPlanningStores,
  args: Record<string, unknown>
): Promise<ModuleCommandResult> {
  const clientMutationId = readIdempotencyValue(args);
  const pgTransition = planningGenPolicyGate(
    ctx,
    args,
    "src/modules/task-engine/instructions/claim-next-task.md",
    planning.sqliteDual.getPlanningGeneration()
  );
  if (pgTransition.block && !hasPriorTransitionForClientMutationId(planning.taskStore, clientMutationId)) {
    return pgTransition.block;
  }
  const ns = readQueueNamespaceArg(args);
  const activeTasks = planning.taskStore.getActiveTasks();
  const suggestion = getNextActions(activeTasks, ns ? { queueNamespace: ns } : undefined);
  const suggested = suggestion.suggestedNext;
  if (!suggested) {
    const data: Record<string, unknown> = {
      intent: "claim-next-task",
      queueNamespace: ns ?? null,
      reason: "no-runnable-task",
      suggestedNext: null
    };
    attachPolicyMeta(data, ctx, planning.sqliteDual.getPlanningGeneration(), pgTransition.warnings);
    return {
      ok: true,
      code: "claim-next-task-noop",
      message: "No runnable task available to claim.",
      data
    };
  }
  const current = planning.taskStore.getTask(suggested.id);
  if (!current || current.status !== "ready") {
    const data: Record<string, unknown> = {
      intent: "claim-next-task",
      queueNamespace: ns ?? null,
      reason: "suggested-task-changed",
      suggestedTaskId: suggested.id,
      currentStatus: current?.status ?? null
    };
    attachPolicyMeta(data, ctx, planning.sqliteDual.getPlanningGeneration(), pgTransition.warnings);
    return {
      ok: true,
      code: "claim-next-task-noop",
      message: "Suggested task changed before claim.",
      data
    };
  }
  const blockers = dependencyBlockersForAction(current, "start", activeTasks);
  if (blockers.length > 0) {
    const data: Record<string, unknown> = {
      intent: "claim-next-task",
      queueNamespace: ns ?? null,
      reason: "dependency-blocked",
      suggestedTaskId: suggested.id,
      dependencyBlockers: blockers
    };
    attachPolicyMeta(data, ctx, planning.sqliteDual.getPlanningGeneration(), pgTransition.warnings);
    return {
      ok: true,
      code: "claim-next-task-noop",
      message: `Suggested task '${suggested.id}' is dependency-blocked.`,
      data
    };
  }
  const hookBus = createKitLifecycleHookBus(ctx.workspacePath, (ctx.effectiveConfig ?? {}) as Record<string, unknown>);
  const deliveryEvidenceMode = readDeliveryEvidenceEnforcementMode(
    ctx.effectiveConfig as Record<string, unknown> | undefined
  );
  const service = new TransitionService(
    planning.taskStore,
    [createDeliveryEvidenceGuard({ enforcementMode: deliveryEvidenceMode })],
    hookBus.isEnabled() ? hookBus : undefined
  );
  try {
    const result = await service.runTransition({
      taskId: suggested.id,
      action: "start",
      actor: readPlanString(args, "actor"),
      expectedPlanningGeneration: readOptionalExpectedPlanningGeneration(args),
      clientMutationId
    });
    const data: Record<string, unknown> = {
      intent: "claim-next-task",
      queueNamespace: ns ?? null,
      taskId: suggested.id,
      action: "start",
      evidence: result.evidence,
      autoUnblocked: result.autoUnblocked,
      replayed: result.replayed === true
    };
    attachPolicyMeta(data, ctx, planning.sqliteDual.getPlanningGeneration(), pgTransition.warnings);
    return {
      ok: true,
      code: result.replayed ? "task-intent-idempotent-replay" : "task-intent-applied",
      message: `Claimed ${suggested.id} — ${suggested.title}`,
      data
    };
  } catch (err) {
    if (err instanceof TaskEngineError) {
      return { ok: false, code: err.code, message: err.message };
    }
    throw err;
  }
}
