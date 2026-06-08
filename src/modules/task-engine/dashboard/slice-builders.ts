import type { ModuleLifecycleContext } from "../../../contracts/module-contract.js";
import type { TaskStore } from "../persistence/store.js";
import type { SqliteDualPlanningStore } from "../persistence/sqlite-dual-planning.js";
import type { DashboardSummaryTracer } from "../dashboard/dashboard-summary-trace.js";
// import type { Record<string, unknown> } from "../../../core/types.js";

import {
  buildDashboardBase,
  buildDashboardOverview,
  buildDashboardQueueProjection,
  buildDashboardStatusProjection,
  buildDashboardAgentActivityProjection,
  buildDashboardFullProjection,
  buildDashboardOverviewProjection,
  buildDashboardQueueSlice as originalBuildDashboardQueueSlice,
  buildDashboardStatusSlice as originalBuildDashboardStatusSlice,
  buildDashboardAgentActivitySlice as originalBuildDashboardAgentActivitySlice,
  buildDashboardAgentTypesSlice as originalBuildDashboardAgentTypesSlice,
  buildDashboardOverviewSlice as originalBuildDashboardOverviewSlice,
  buildDashboardTerminalTasksPage as originalBuildDashboardTerminalTasksPage,
  parseDashboardWishlistPaging
} from "./build-dashboard-base.js";


/**
 * Slice‑native dashboard builders – thin wrappers around the existing base
 * builders that purposefully avoid heavy operations. They accept the same
 * parameters as the original slice functions but can be customised later to
 * use the lightweight planning‑store helpers.
 */
export async function buildDashboardOverviewSlice(
  ctx: ModuleLifecycleContext,
  store: TaskStore,
  planningGeneration: number,
  sqliteDual?: SqliteDualPlanningStore,
  commandArgs?: Record<string, unknown>,
  tracer?: DashboardSummaryTracer
) {
  // Currently delegate to the original implementation; future optimisation
  // will replace the call with a read‑only planning‑store version.
  return originalBuildDashboardOverviewSlice(
    ctx,
    store,
    planningGeneration,
    sqliteDual,
    commandArgs,
    tracer
  );
}

export async function buildDashboardQueueSlice(
  ctx: ModuleLifecycleContext,
  store: TaskStore,
  planningGeneration: number,
  sqliteDual?: SqliteDualPlanningStore,
  commandArgs?: Record<string, unknown>,
  tracer?: DashboardSummaryTracer
) {
  return originalBuildDashboardQueueSlice(
    ctx,
    store,
    planningGeneration,
    sqliteDual,
    commandArgs,
    tracer
  );
}

export async function buildDashboardStatusSlice(
  ctx: ModuleLifecycleContext,
  store: TaskStore,
  planningGeneration: number,
  sqliteDual?: SqliteDualPlanningStore,
  commandArgs?: Record<string, unknown>,
  tracer?: DashboardSummaryTracer
) {
  return originalBuildDashboardStatusSlice(
    ctx,
    store,
    planningGeneration,
    sqliteDual,
    commandArgs,
    tracer
  );
}

export async function buildDashboardAgentActivitySlice(
  ctx: ModuleLifecycleContext,
  store: TaskStore,
  planningGeneration: number,
  sqliteDual?: SqliteDualPlanningStore,
  commandArgs?: Record<string, unknown>,
  tracer?: DashboardSummaryTracer
) {
  return originalBuildDashboardAgentActivitySlice(
    ctx,
    store,
    planningGeneration,
    sqliteDual,
    commandArgs,
    tracer
  );
}

export async function buildDashboardAgentTypesSlice(
  ctx: ModuleLifecycleContext,
  store: TaskStore,
  planningGeneration: number,
  sqliteDual?: SqliteDualPlanningStore,
  commandArgs?: Record<string, unknown>,
  tracer?: DashboardSummaryTracer
) {
  return originalBuildDashboardAgentTypesSlice(
    ctx,
    store,
    planningGeneration,
    sqliteDual,
    commandArgs,
    tracer
  );
}

export async function buildDashboardTerminalTasksPage(
  ctx: ModuleLifecycleContext,
  store: TaskStore,
  planningGeneration: number,
  sqliteDual?: SqliteDualPlanningStore,
  commandArgs?: Record<string, unknown>,
  tracer?: DashboardSummaryTracer
) {
  // Delegate to the original implementation for now.
  return originalBuildDashboardTerminalTasksPage(
    ctx,
    store,
    planningGeneration,
    sqliteDual,
    commandArgs,
    tracer
  );
}

export { parseDashboardWishlistPaging };
