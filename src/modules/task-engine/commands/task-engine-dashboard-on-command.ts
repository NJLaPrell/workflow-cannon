import type { ModuleCommandResult, ModuleLifecycleContext } from "../../../contracts/module-contract.js";
import type { SqliteDualPlanningStore } from "../persistence/sqlite-dual-planning.js";
import type { TaskStore } from "../persistence/store.js";
import {
  buildDashboardBase,
  buildDashboardAgentActivityProjection,
  buildDashboardFullProjection,
  buildDashboardOverviewProjection,
  buildDashboardQueueProjection,
  buildDashboardStatusProjection,
  parseDashboardWishlistPaging
} from "../dashboard/build-dashboard-base.js";
import {
  finalizeDashboardSummaryProjection,
  parseDashboardSummaryProjection
} from "../dashboard/dashboard-summary-projection.js";

export { parseDashboardWishlistPaging };

export async function runDashboardSummaryCommand(
  ctx: ModuleLifecycleContext,
  store: TaskStore,
  planningGeneration: number,
  sqliteDual?: SqliteDualPlanningStore,
  commandArgs?: Record<string, unknown>
): Promise<ModuleCommandResult> {
  const projection = parseDashboardSummaryProjection(commandArgs);
  const base = await buildDashboardBase(ctx, store, planningGeneration, sqliteDual, commandArgs);
  const data =
    projection === "overview"
      ? buildDashboardOverviewProjection(base)
      : projection === "agentActivity"
        ? buildDashboardAgentActivityProjection(base)
      : projection === "queue"
        ? buildDashboardQueueProjection(base)
        : projection === "status"
          ? buildDashboardStatusProjection(base)
          : buildDashboardFullProjection(base);
  const sliced = finalizeDashboardSummaryProjection(data, projection);

  return {
    ok: true,
    code: "dashboard-summary",
    message:
      projection === "full"
        ? "Dashboard summary built from task store and maintainer status snapshot"
        : `Dashboard summary built (${projection} projection)`,
    data: sliced as Record<string, unknown>
  };
}
