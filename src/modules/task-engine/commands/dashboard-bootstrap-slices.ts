// src/modules/task-engine/commands/dashboard-bootstrap-slices.ts
import type { ModuleCommandResult, ModuleLifecycleContext } from "../../../contracts/module-contract.js";
import type { TaskStore } from "../persistence/store.js";
import type { SqliteDualPlanningStore } from "../persistence/sqlite-dual-planning.js";
import {
  buildDashboardOverviewSlice,
  buildDashboardQueueSlice,
  buildDashboardStatusSlice,
  buildDashboardAgentActivitySlice,
  buildDashboardAgentTypesSlice,
  buildDashboardOverviewSlice as buildOverview,
} from "../dashboard/slice-builders.js";

/**
 * CLI fallback command that returns a set of cheap dashboard slices in a single request.
 * This is used when the dashboard service is unavailable to avoid spawning many CLI processes.
 */
export async function dashboardBootstrapSlices(
  ctx: ModuleLifecycleContext,
  store: TaskStore,
  planningGeneration: number,
  sqliteDual: SqliteDualPlanningStore | undefined,
  commandArgs: { slices?: string[] } | undefined
): Promise<ModuleCommandResult> {
  const requested = commandArgs?.slices ?? ["overview", "agentTypes", "agentActivity"];
  const result: Record<string, unknown> = {};
  for (const slice of requested) {
    switch (slice) {
      case "overview": {
        result.overview = await buildDashboardOverviewSlice(ctx, store, planningGeneration, sqliteDual, undefined, undefined);
        break;
      }
      case "queue": {
        result.queue = await buildDashboardQueueSlice(ctx, store, planningGeneration, sqliteDual, undefined, undefined);
        break;
      }
      case "status": {
        result.status = await buildDashboardStatusSlice(ctx, store, planningGeneration, sqliteDual, undefined, undefined);
        break;
      }
      case "agentActivity": {
        result.agentActivity = await buildDashboardAgentActivitySlice(ctx, store, planningGeneration, sqliteDual, undefined, undefined);
        break;
      }
      case "agentTypes": {
        result.agentTypes = await buildDashboardAgentTypesSlice(ctx, store, planningGeneration, sqliteDual, undefined, undefined);
        break;
      }
      case "overview": {
        // already handled above
        break;
      }
      default: {
        // ignore unknown slice names
        break;
      }
    }
  }
  return {
    ok: true,
    code: "dashboard-bootstrap-slices",
    message: "Bootstrap slices generated",
    data: result as Record<string, unknown>
  } as ModuleCommandResult;
}
