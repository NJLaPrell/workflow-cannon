import type { ModuleCommandResult, ModuleLifecycleContext } from "../../../contracts/module-contract.js";
import type { OpenedPlanningStores } from "../planning-open.js";
import type { TaskStore } from "../store.js";
import { TransitionService } from "../service.js";
import { TaskEngineError } from "../transitions.js";
import { maybeSpawnTranscriptHookAfterCompletion } from "../../../core/transcript-completion-hook.js";
import { resolveActor } from "./shared.js";

export async function handleRunTransition(
  args: Record<string, unknown>,
  ctx: ModuleLifecycleContext,
  _planning: OpenedPlanningStores,
  store: TaskStore
): Promise<ModuleCommandResult> {
  const taskId = typeof args.taskId === "string" ? args.taskId : undefined;
  const action = typeof args.action === "string" ? args.action : undefined;
  const actor = resolveActor(args, ctx);

  if (!taskId || !action) {
    return {
      ok: false,
      code: "invalid-task-schema",
      message: "run-transition requires 'taskId' and 'action' arguments"
    };
  }

  try {
    const service = new TransitionService(store);
    const result = await service.runTransition({ taskId, action, actor });
    if (result.evidence.toState === "completed") {
      maybeSpawnTranscriptHookAfterCompletion(
        ctx.workspacePath,
        (ctx.effectiveConfig ?? {}) as Record<string, unknown>
      );
    }
    return {
      ok: true,
      code: "transition-applied",
      message: `${taskId}: ${result.evidence.fromState} → ${result.evidence.toState} (${action})`,
      data: {
        evidence: result.evidence,
        autoUnblocked: result.autoUnblocked
      } as Record<string, unknown>
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
