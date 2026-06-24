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
  createPlanArtifactExecuteGuard,
  readPlanArtifactExecuteEnforcementMode
} from "../plan-artifact-execute-policy.js";
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
import {
  clearAgentActivityBestEffort,
  recordCommandBoundaryActivityBestEffort,
  recordTaskTransitionActivityBestEffort
} from "../agent-activity-recorder.js";
import { waitForWorkspaceEditLease } from "../workspace-edit-lease-commands-runtime.js";
import { isGitTaskStateCanonicalAuthority } from "../persistence/task-state-canonical-authority.js";
import { commitCanonicalTaskStateEvents } from "../persistence/task-state-canonical-commit.js";
import { draftEventsFromTransitionResult } from "../persistence/task-state-event-draft.js";

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

  const transitionTask = store.getTask(taskId);
  let activityLease: { activityId: string; agentId: string; sessionId: string } | null = null;

  try {
    const activityBoundary =
      action === "start" || action === "unblock" || action === "resume_work"
        ? {
            kind: "working_task" as const,
            taskId,
            command: "run-transition",
            phaseKey: transitionTask?.phaseKey ?? undefined
          }
        : action === "block"
          ? {
              kind: "blocked" as const,
              taskId,
              command: "run-transition",
              phaseKey: transitionTask?.phaseKey ?? undefined
            }
          : action === "complete"
            ? {
                kind: "validating" as const,
                taskId,
                command: "run-transition",
                phaseKey: transitionTask?.phaseKey ?? undefined,
                details: { validationLabel: `task ${taskId} completion` }
              }
            : action === "await_policy_approval"
              ? {
                  kind: "awaiting_policy_approval" as const,
                  taskId,
                  command: "run-transition",
                  phaseKey: transitionTask?.phaseKey ?? undefined,
                  details: { reviewItemId: taskId }
                }
              : action === "await_review" || action === "await_external_decision"
                ? {
                    kind: "awaiting_human_gate" as const,
                    taskId,
                    command: "run-transition",
                    phaseKey: transitionTask?.phaseKey ?? undefined,
                    details: { detail: `task ${taskId} ${action}` }
                  }
                : null;
    activityLease = activityBoundary
      ? recordCommandBoundaryActivityBestEffort(ctx, planning, activityBoundary)
      : null;
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
        createPlanArtifactExecuteGuard({ enforcementMode: readPlanArtifactExecuteEnforcementMode(ctx.effectiveConfig as Record<string, unknown> | undefined), effectiveConfig: ctx.effectiveConfig as Record<string, unknown> | undefined, workspacePath: ctx.workspacePath }),
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
    const persistedTask = transitionTask;
    const phaseResolution = resolveRunTransitionPhaseNotes(
      args as Record<string, unknown>,
      persistedTask,
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

    const gitCanonical = isGitTaskStateCanonicalAuthority(ctx);
    const result = await service.runTransition({
      taskId,
      action,
      actor,
      expectedPlanningGeneration,
      clientMutationId,
      transitionArgs: args as Record<string, unknown>,
      beforePersistInSqliteTransaction,
      persist: !gitCanonical
    });

    if (gitCanonical && !result.replayed) {
      const drafts = draftEventsFromTransitionResult({
        primary: result.evidence,
        autoUnblocked: result.autoUnblocked,
        store,
        workspacePath: ctx.workspacePath,
        ctx: {
          commandName: "run-transition",
          moduleId: "task-engine",
          actorId: actor,
          clientMutationId,
          phaseKey: persistedTask?.phaseKey ?? undefined
        }
      });
      const canonical = await commitCanonicalTaskStateEvents({
        ctx,
        store,
        planning,
        events: drafts,
        policyApproval: args.policyApproval as { confirmed: boolean; rationale: string } | undefined
      });
      if (canonical && !canonical.ok) {
        const data: Record<string, unknown> = { ...(canonical.data as Record<string, unknown>) };
        attachPolicyMeta(data, ctx, planning.sqliteDual.getPlanningGeneration(), pgTransition.warnings);
        return { ...canonical, data };
      }
      await store.load();
    }
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
  } finally {
    // Best-effort auto lease only; manual `set-agent-activity` remains authoritative when present.
    if (activityLease) {
      clearAgentActivityBestEffort(ctx, planning, {
        activityId: activityLease.activityId,
        agentId: activityLease.agentId,
        sessionId: activityLease.sessionId
      });
    }
  }
}
