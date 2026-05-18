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
  buildDeliveryEvidencePolicyContext,
  resolveMaintainerDeliveryPolicy
} from "../maintainer-delivery-policy-resolver.js";
import { createTaskIntakeAcceptGuard } from "../task-intake-mutation-policy.js";
import { insertPhaseNoteInConnection } from "../phase-journal/phase-journal-store.js";
import { resolveRunTransitionPhaseNotes } from "../phase-journal/phase-journal-run-transition-notes.js";
import {
  readIdempotencyValue,
  readOptionalExpectedPlanningGeneration
} from "../mutation-utils.js";
import type { OpenedPlanningStores } from "../persistence/planning-open.js";
import { TaskStore } from "../persistence/store.js";
import { planningGenPolicyGate } from "../planning-generation-gate.js";
import { TransitionService } from "../service.js";
import { TaskEngineError } from "../transitions.js";
import { recordTaskTransitionActivityBestEffort } from "../agent-activity-recorder.js";
import { waitForWorkspaceEditLease } from "../workspace-edit-lease-commands-runtime.js";

function readKitUserVersion(db: { pragma: (name: string, options?: { simple: boolean }) => unknown }): number {
  const raw = db.pragma("user_version", { simple: true });
  return typeof raw === "number" ? raw : Number(raw);
}

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
  const leaseWait = await waitForWorkspaceEditLease(ctx, args as Record<string, unknown>);
  if (leaseWait && !leaseWait.ok) {
    return leaseWait;
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
    const effectiveConfig = ctx.effectiveConfig as Record<string, unknown> | undefined;
    const service = new TransitionService(
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
    const expectedPlanningGeneration = readOptionalExpectedPlanningGeneration(
      args as Record<string, unknown>
    );

    const db = planning.sqliteDual.getDatabase();
    const transitionTask = store.getTask(taskId);
    const phaseResolution = resolveRunTransitionPhaseNotes(
      args as Record<string, unknown>,
      transitionTask,
      readKitUserVersion(db),
      (tid) => store.getTask(tid)
    );
    if (!phaseResolution.ok) {
      const data: Record<string, unknown> = {};
      attachPolicyMeta(data, ctx, planning.sqliteDual.getPlanningGeneration(), pgTransition.warnings);
      return { ...phaseResolution.result, data };
    }

    const persistNotes = phaseResolution.inputs;
    const beforePersistInSqliteTransaction =
      persistNotes.length > 0
        ? () => {
            const gr = db
              .prepare("SELECT planning_generation AS g FROM workspace_planning_state WHERE id = 1")
              .get() as { g: number } | undefined;
            const nextPlanningGen = (gr !== undefined ? Number(gr.g) || 0 : 0) + 1;
            for (const input of persistNotes) {
              insertPhaseNoteInConnection(db, {
                ...input,
                planningGeneration: nextPlanningGen
              });
            }
          }
        : undefined;

    const result = await service.runTransition({
      taskId,
      action,
      actor,
      expectedPlanningGeneration,
      clientMutationId,
      transitionArgs: args as Record<string, unknown>,
      beforePersistInSqliteTransaction
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
      replayed: result.replayed === true,
      ...(leaseWait ? { leaseWait: leaseWait.data } : {})
    };
    if (!result.replayed) {
      recordTaskTransitionActivityBestEffort(ctx, planning, {
        task: store.getTask(taskId),
        taskId,
        action,
        command: "run-transition"
      });
    }
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
      return {
        ok: false,
        code: err.code,
        message: err.message,
        remediation: { instructionPath: CLI_REMEDIATION_INSTRUCTIONS.runTransition }
      };
    }
    return {
      ok: false,
      code: "invalid-transition",
      message: (err as Error).message
    };
  }
}
