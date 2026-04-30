import type { ModuleCommandResult, ModuleLifecycleContext } from "../../../contracts/module-contract.js";
import { createKitLifecycleHookBus } from "../../../core/kit-lifecycle-hooks.js";
import { maybeSpawnTranscriptHookAfterCompletion } from "../../../core/transcript-completion-hook.js";
import { CLI_REMEDIATION_INSTRUCTIONS } from "../../../core/cli-remediation.js";
import { attachPolicyMeta } from "../attach-planning-response-meta.js";
import {
  createDeliveryEvidenceGuard,
  readDeliveryEvidenceEnforcementMode
} from "../delivery-evidence.js";
import {
  readIdempotencyValue,
  readOptionalExpectedPlanningGeneration
} from "../mutation-utils.js";
import type { OpenedPlanningStores } from "../persistence/planning-open.js";
import { TaskStore } from "../persistence/store.js";
import { planningGenPolicyGate } from "../planning-generation-gate.js";
import { TransitionService } from "../service.js";
import { TaskEngineError } from "../transitions.js";

export async function runTransitionOnCommand(
  ctx: ModuleLifecycleContext,
  planning: OpenedPlanningStores,
  store: TaskStore,
  args: Record<string, unknown>
): Promise<ModuleCommandResult> {
  const taskId = typeof args.taskId === "string" ? args.taskId : undefined;
  const action = typeof args.action === "string" ? args.action : undefined;
  const actor =
    typeof args.actor === "string"
      ? args.actor
      : ctx.resolvedActor !== undefined
        ? ctx.resolvedActor
        : undefined;

  if (!taskId || !action) {
    return {
      ok: false,
      code: "invalid-task-schema",
      message: "run-transition requires 'taskId' and 'action' arguments",
      remediation: { instructionPath: CLI_REMEDIATION_INSTRUCTIONS.runTransition }
    };
  }
  const clientMutationId = readIdempotencyValue(args);
  const hasPriorTransition =
    clientMutationId !== undefined &&
    store.getTransitionLog().some((entry) => entry.clientMutationId === clientMutationId);

  const pgTransition = planningGenPolicyGate(
    ctx,
    args as Record<string, unknown>,
    CLI_REMEDIATION_INSTRUCTIONS.runTransition,
    planning.sqliteDual.getPlanningGeneration()
  );
  if (pgTransition.block && !hasPriorTransition) {
    return pgTransition.block;
  }

  try {
    const hookBus = createKitLifecycleHookBus(
      ctx.workspacePath,
      (ctx.effectiveConfig ?? {}) as Record<string, unknown>
    );
    const deliveryEvidenceMode = readDeliveryEvidenceEnforcementMode(
      ctx.effectiveConfig as Record<string, unknown> | undefined
    );
    const service = new TransitionService(
      store,
      [createDeliveryEvidenceGuard({ enforcementMode: deliveryEvidenceMode })],
      hookBus.isEnabled() ? hookBus : undefined
    );
    const expectedPlanningGeneration = readOptionalExpectedPlanningGeneration(
      args as Record<string, unknown>
    );
    const result = await service.runTransition({
      taskId,
      action,
      actor,
      expectedPlanningGeneration,
      clientMutationId
    });
    if (!result.replayed && result.evidence.toState === "completed") {
      maybeSpawnTranscriptHookAfterCompletion(
        ctx.workspacePath,
        (ctx.effectiveConfig ?? {}) as Record<string, unknown>
      );
    }
    const data: Record<string, unknown> = {
      evidence: result.evidence,
      autoUnblocked: result.autoUnblocked,
      replayed: result.replayed === true
    };
    attachPolicyMeta(data, ctx, planning.sqliteDual.getPlanningGeneration(), pgTransition.warnings);
    return {
      ok: true,
      code: result.replayed ? "transition-idempotent-replay" : "transition-applied",
      message: result.replayed
        ? `Idempotent run-transition replay for ${taskId}: ${result.evidence.fromState} → ${result.evidence.toState} (${action})`
        : `${taskId}: ${result.evidence.fromState} → ${result.evidence.toState} (${action})`,
      data
    };
  } catch (err) {
    if (err instanceof TaskEngineError) {
      return { ok: false, code: err.code, message: err.message };
    }
    return {
      ok: false,
      code: "invalid-transition",
      message: (err as Error).message
    };
  }
}
