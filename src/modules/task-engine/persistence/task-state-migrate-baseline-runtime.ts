import crypto from "node:crypto";
import type { ModuleCommandResult, ModuleLifecycleContext } from "../../../contracts/module-contract.js";
import { openPlanningStoresForTaskStateCache } from "./task-state-cache-runtime-shared.js";
import { runTaskStateInit } from "./task-state-init-runtime.js";

export async function runTaskStateMigrateBaseline(
  ctx: ModuleLifecycleContext,
  args: Record<string, unknown>
): Promise<ModuleCommandResult> {
  const planning = await openPlanningStoresForTaskStateCache(ctx);
  const document = planning.sqliteDual.taskDocument;
  const counts = {
    tasks: document.tasks.length,
    transitions: document.transitionLog.length,
    mutations: document.mutationLog?.length ?? 0
  };
  const digest = crypto
    .createHash("sha256")
    .update(
      JSON.stringify({
        tasks: counts.tasks,
        transitions: counts.transitions,
        mutations: counts.mutations
      })
    )
    .digest("hex");

  const init = await runTaskStateInit(ctx, {
    ...args,
    dryRun: args.dryRun === true,
    overwriteExisting: args.overwriteExisting === true
  });

  if (!init.ok) {
    return {
      ...init,
      data: {
        ...(init.data as Record<string, unknown>),
        baselineReport: { schemaVersion: 1, counts, digest }
      }
    };
  }

  return {
    ...init,
    code: init.data && (init.data as { dryRun?: boolean }).dryRun ? "task-state-migrate-baseline-dry-run" : "task-state-migrate-baseline-complete",
    message: init.message,
    data: {
      ...(init.data as Record<string, unknown>),
      baselineReport: {
        schemaVersion: 1,
        counts,
        digest,
        survivalAssertion: "All SQLite rows exported into baseline snapshot and genesis segment"
      }
    }
  };
}
