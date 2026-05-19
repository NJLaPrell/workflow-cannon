import type { ModuleCommandResult, ModuleLifecycleContext } from "../../../contracts/module-contract.js";
import { createKitLifecycleHookBus } from "../../../core/kit-lifecycle-hooks.js";
import { attachPolicyMeta } from "../attach-planning-response-meta.js";
import {
  createDeliveryEvidenceGuard,
  readDeliveryEvidenceEnforcementMode
} from "../delivery-evidence.js";
import {
  buildDeliveryEvidencePolicyContext,
  resolveMaintainerDeliveryPolicy
} from "../maintainer-delivery-policy-resolver.js";
import { createTaskIntakeAcceptGuard } from "../task-intake-mutation-policy.js";
import { planningGenPolicyGate } from "../planning-generation-gate.js";
import type { OpenedPlanningStores } from "../persistence/planning-open.js";
import type { TaskStore } from "../persistence/store.js";
import { TransitionService } from "../service.js";
import { TaskEngineError, TransitionValidator, resolveTargetState } from "../transitions.js";
import type { GuardResult, TaskEntity, TaskStatus, TransitionEvidence } from "../types.js";
import { readIdempotencyValue, readOptionalExpectedPlanningGeneration } from "../mutation-utils.js";
import { readPlanString } from "./task-intent-commands.js";

export type BatchTransitionItem = {
  taskId: string;
  action: string;
  clientMutationId?: string;
};

export type BatchTransitionPreviewRow = {
  index: number;
  taskId: string;
  action: string;
  allowed: boolean;
  fromState?: TaskStatus;
  toState?: TaskStatus;
  guardResults: GuardResult[];
  code?: string;
  message?: string;
};

function readTransitions(args: Record<string, unknown>): BatchTransitionItem[] | null {
  if (!Array.isArray(args.transitions) || args.transitions.length === 0) {
    return null;
  }
  const out: BatchTransitionItem[] = [];
  for (let i = 0; i < args.transitions.length; i++) {
    const row = args.transitions[i];
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      return null;
    }
    const rec = row as Record<string, unknown>;
    const taskId = readPlanString(rec, "taskId");
    const action = readPlanString(rec, "action");
    if (!taskId || !action) {
      return null;
    }
    const clientMutationId = readIdempotencyValue(rec);
    out.push({ taskId, action, clientMutationId });
  }
  return out;
}

function cloneTasks(tasks: TaskEntity[]): Map<string, TaskEntity> {
  return new Map(tasks.map((t) => [t.id, { ...t }]));
}

function buildTransitionValidator(ctx: ModuleLifecycleContext): TransitionValidator {
  const effectiveConfig = ctx.effectiveConfig as Record<string, unknown> | undefined;
  const deliveryEvidenceMode = readDeliveryEvidenceEnforcementMode(effectiveConfig);
  return new TransitionValidator([
    createTaskIntakeAcceptGuard({ effectiveConfig }),
    createDeliveryEvidenceGuard({
      enforcementMode: deliveryEvidenceMode,
      resolvePolicyContext: (task) => {
        const resolved = resolveMaintainerDeliveryPolicy({ effectiveConfig, task });
        return buildDeliveryEvidencePolicyContext(resolved);
      }
    })
  ]);
}

function buildTransitionService(
  store: TaskStore,
  ctx: ModuleLifecycleContext
): TransitionService {
  const hookBus = createKitLifecycleHookBus(ctx.workspacePath, (ctx.effectiveConfig ?? {}) as Record<string, unknown>);
  const effectiveConfig = ctx.effectiveConfig as Record<string, unknown> | undefined;
  const deliveryEvidenceMode = readDeliveryEvidenceEnforcementMode(effectiveConfig);
  return new TransitionService(
    store,
    [
      createTaskIntakeAcceptGuard({ effectiveConfig }),
      createDeliveryEvidenceGuard({
        enforcementMode: deliveryEvidenceMode,
        resolvePolicyContext: (task) => {
          const resolved = resolveMaintainerDeliveryPolicy({ effectiveConfig, task });
          return buildDeliveryEvidencePolicyContext(resolved);
        }
      })
    ],
    hookBus.isEnabled() ? hookBus : undefined
  );
}

function previewBatch(
  store: TaskStore,
  validator: TransitionValidator,
  items: BatchTransitionItem[]
): { rows: BatchTransitionPreviewRow[]; allAllowed: boolean } {
  const virtual = cloneTasks(store.getAllTasks());
  const rows: BatchTransitionPreviewRow[] = [];
  let allAllowed = true;
  const timestamp = new Date().toISOString();

  for (let index = 0; index < items.length; index++) {
    const { taskId, action } = items[index];
    const task = virtual.get(taskId);
    if (!task) {
      rows.push({
        index,
        taskId,
        action,
        allowed: false,
        guardResults: [],
        code: "task-not-found",
        message: `Task '${taskId}' not found`
      });
      allAllowed = false;
      continue;
    }

    const targetState = resolveTargetState(task.status, action);
    if (!targetState) {
      rows.push({
        index,
        taskId,
        action,
        allowed: false,
        fromState: task.status,
        guardResults: [],
        code: "invalid-transition",
        message: `Action '${action}' is not valid from state '${task.status}'`
      });
      allAllowed = false;
      continue;
    }

    const validation = validator.validate(task, targetState, {
      allTasks: [...virtual.values()],
      timestamp,
      actor: undefined
    });
    const rejection = validation.guardResults.find((g) => !g.allowed);
    rows.push({
      index,
      taskId,
      action,
      allowed: validation.allowed,
      fromState: task.status,
      toState: targetState,
      guardResults: validation.guardResults,
      ...(validation.allowed
        ? {}
        : {
            code: rejection?.code ?? "guard-rejected",
            message: rejection?.message ?? "Transition rejected"
          })
    });
    if (!validation.allowed) {
      allAllowed = false;
      continue;
    }

    virtual.set(taskId, { ...task, status: targetState, updatedAt: timestamp });
  }

  return { rows, allAllowed };
}

export async function runBatchTransitionCommand(
  ctx: ModuleLifecycleContext,
  planning: OpenedPlanningStores,
  store: TaskStore,
  args: Record<string, unknown>
): Promise<ModuleCommandResult> {
  const items = readTransitions(args);
  if (!items) {
    return {
      ok: false,
      code: "invalid-run-args",
      message: "batch-transition requires non-empty transitions array of { taskId, action } objects.",
      remediation: { instructionPath: "src/modules/task-engine/instructions/batch-transition.md" }
    };
  }

  const apply = args.apply === true;
  const dryRun = apply ? false : args.dryRun !== false;
  const actor =
    readPlanString(args, "actor") ??
    (ctx.resolvedActor !== undefined ? String(ctx.resolvedActor) : undefined);

  const pgGate = planningGenPolicyGate(
    ctx,
    args,
    "src/modules/task-engine/instructions/batch-transition.md",
    planning.sqliteDual.getPlanningGeneration()
  );
  if (pgGate.block && !dryRun) {
    return pgGate.block;
  }

  const validator = buildTransitionValidator(ctx);
  const { rows, allAllowed } = previewBatch(store, validator, items);

  if (dryRun) {
    const data: Record<string, unknown> = {
      dryRun: true,
      transitionCount: items.length,
      allAllowed,
      results: rows
    };
    attachPolicyMeta(data, ctx, planning.sqliteDual.getPlanningGeneration(), pgGate.warnings);
    return {
      ok: true,
      code: "batch-transition-dry-run",
      message: allAllowed
        ? `Dry run: ${items.length} transition(s) would succeed`
        : `Dry run: ${rows.filter((r) => !r.allowed).length} of ${items.length} transition(s) blocked`,
      data
    };
  }

  if (!allAllowed) {
    const data: Record<string, unknown> = {
      apply: false,
      transitionCount: items.length,
      allAllowed: false,
      results: rows
    };
    attachPolicyMeta(data, ctx, planning.sqliteDual.getPlanningGeneration(), pgGate.warnings);
    return {
      ok: false,
      code: "batch-transition-blocked",
      message: "Apply refused: one or more transitions failed validation. Re-run with dryRun:true to inspect.",
      data
    };
  }

  const service = buildTransitionService(store, ctx);
  const applied: TransitionEvidence[] = [];
  const applyRows: BatchTransitionPreviewRow[] = [];

  try {
    let generation =
      readOptionalExpectedPlanningGeneration(args) ?? planning.sqliteDual.getPlanningGeneration();
    for (let index = 0; index < items.length; index++) {
      const item = items[index];
      const result = await service.runTransition({
        taskId: item.taskId,
        action: item.action,
        actor,
        expectedPlanningGeneration: generation,
        clientMutationId: item.clientMutationId
      });
      applied.push(result.evidence);
      applyRows.push({
        index,
        taskId: item.taskId,
        action: item.action,
        allowed: true,
        fromState: result.evidence.fromState,
        toState: result.evidence.toState,
        guardResults: result.evidence.guardResults
      });
      generation = planning.sqliteDual.getPlanningGeneration();
    }
  } catch (err) {
    if (err instanceof TaskEngineError) {
      return { ok: false, code: err.code, message: err.message };
    }
    throw err;
  }

  const data: Record<string, unknown> = {
    apply: true,
    transitionCount: items.length,
    allAllowed: true,
    results: applyRows,
    evidence: applied
  };
  attachPolicyMeta(data, ctx, planning.sqliteDual.getPlanningGeneration(), pgGate.warnings);
  return {
    ok: true,
    code: "batch-transition-applied",
    message: `Applied ${items.length} transition(s)`,
    data
  };
}
