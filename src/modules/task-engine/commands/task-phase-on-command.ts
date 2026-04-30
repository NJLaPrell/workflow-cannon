import type { ModuleCommandResult, ModuleLifecycleContext } from "../../../contracts/module-contract.js";
import { attachPolicyMeta } from "../attach-planning-response-meta.js";
import type { OpenedPlanningStores } from "../persistence/planning-open.js";
import { TaskStore } from "../persistence/store.js";
import { strictValidationError } from "./strict-store-validation.js";
import { runAssignTaskPhase, runClearTaskPhase } from "../task-engine-phase-mutations.js";

/**
 * Phase field mutations on task rows.
 * Returns **`null`** when the command name is not handled here.
 */
export async function resolveTaskPhaseCommands(
  command: { name: string; args?: Record<string, unknown> },
  ctx: ModuleLifecycleContext,
  planning: OpenedPlanningStores,
  store: TaskStore
): Promise<ModuleCommandResult | null> {
  const args = command.args ?? {};

  if (command.name === "assign-task-phase") {
    const actor =
      typeof args.actor === "string"
        ? args.actor
        : ctx.resolvedActor !== undefined
          ? ctx.resolvedActor
          : undefined;
    const r = await runAssignTaskPhase({
      store,
      ctx,
      strictValidationError,
      actor,
      rawArgs: args as Record<string, unknown>
    });
    if (r.ok && r.data && typeof r.data === "object") {
      attachPolicyMeta(r.data as Record<string, unknown>, ctx, planning.sqliteDual.getPlanningGeneration());
    }
    return r;
  }

  if (command.name === "clear-task-phase") {
    const actor =
      typeof args.actor === "string"
        ? args.actor
        : ctx.resolvedActor !== undefined
          ? ctx.resolvedActor
          : undefined;
    const r = await runClearTaskPhase({
      store,
      ctx,
      strictValidationError,
      actor,
      rawArgs: args as Record<string, unknown>
    });
    if (r.ok && r.data && typeof r.data === "object") {
      attachPolicyMeta(r.data as Record<string, unknown>, ctx, planning.sqliteDual.getPlanningGeneration());
    }
    return r;
  }

  return null;
}
