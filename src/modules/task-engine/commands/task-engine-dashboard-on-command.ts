import type { ModuleCommandResult, ModuleLifecycleContext } from "../../../contracts/module-contract.js";
import type { SqliteDualPlanningStore } from "../persistence/sqlite-dual-planning.js";
import type { TaskStore } from "../persistence/store.js";
import {
  buildDashboardBase,
  buildDashboardOverview,
  buildDashboardAgentActivityProjection,
  buildDashboardFullProjection,
  buildDashboardOverviewProjection,
  buildDashboardQueueProjection,
  buildDashboardStatusProjection,
  parseDashboardWishlistPaging,
  buildDashboardOverviewSlice,
  buildDashboardQueueSlice,
  buildDashboardStatusSlice,
  buildDashboardAgentActivitySlice,
  buildDashboardAgentTypesSlice
} from "../dashboard/build-dashboard-base.js";
import {
  finalizeDashboardSummaryProjection,
  parseDashboardSummaryProjection
} from "../dashboard/dashboard-summary-projection.js";
import { createDashboardSummaryTracer } from "../dashboard/dashboard-summary-trace.js";

export { parseDashboardWishlistPaging };

export async function runDashboardSummaryCommand(
  ctx: ModuleLifecycleContext,
  store: TaskStore,
  planningGeneration: number,
  sqliteDual?: SqliteDualPlanningStore,
  commandArgs?: Record<string, unknown>
): Promise<ModuleCommandResult> {
  const tracer = createDashboardSummaryTracer(commandArgs);
  try {
    const projection = tracer?.span("parse projection", () => parseDashboardSummaryProjection(commandArgs))
      ?? parseDashboardSummaryProjection(commandArgs);
    if (tracer) {
      tracer.projection = projection;
    }
    let data;
    if (projection === "overview") {
      data = await buildDashboardOverviewSlice(ctx, store, planningGeneration, sqliteDual, commandArgs, tracer);
    } else if (projection === "queue") {
      data = await buildDashboardQueueSlice(ctx, store, planningGeneration, sqliteDual, commandArgs, tracer);
    } else if (projection === "status") {
      data = await buildDashboardStatusSlice(ctx, store, planningGeneration, sqliteDual, commandArgs, tracer);
    } else if (projection === "agentActivity") {
      data = await buildDashboardAgentActivitySlice(ctx, store, planningGeneration, sqliteDual, commandArgs, tracer);
    } else if (projection === "agentTypes") {
      data = await buildDashboardAgentTypesSlice(ctx, store, planningGeneration, sqliteDual, commandArgs, tracer);
    } else {
      const base = await buildDashboardBase(ctx, store, planningGeneration, sqliteDual, commandArgs, tracer);
      data = buildDashboardFullProjection(base);
    }
    const sliced = tracer?.span("finalizeProjection", () => finalizeDashboardSummaryProjection(data, projection))
      ?? finalizeDashboardSummaryProjection(data, projection);

    return {
      ok: true,
      code: "dashboard-summary",
      message:
        projection === "full"
          ? "Dashboard summary built from task store and maintainer status snapshot"
          : `Dashboard summary built (${projection} projection)`,
      data: sliced as Record<string, unknown>
    };
  } finally {
    tracer?.flush();
  }
}

