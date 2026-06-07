import type { ModuleLifecycleContext } from "../../../contracts/module-contract.js";
import type { TaskStore } from "../persistence/store.js";
import type { SqliteDualPlanningStore } from "../persistence/sqlite-dual-planning.js";
import type { DashboardTracer } from "../dashboard/dashboard-summary-trace.js";
import type { Record<string, unknown> } from "../../../core/types.js";

import {
  buildDashboardBase,
  buildDashboardOverview,
  buildDashboardQueueProjection,
  buildDashboardStatusProjection,
  buildDashboardAgentActivityProjection,
  buildDashboardAgentTypesProjection,
  buildDashboardFullProjection,
  buildDashboardOverviewProjection,
  buildDashboardQueueSlice as originalBuildDashboardQueueSlice,
  buildDashboardStatusSlice as originalBuildDashboardStatusSlice,
  buildDashboardAgentActivitySlice as originalBuildDashboardAgentActivitySlice,
  buildDashboardAgentTypesSlice as originalBuildDashboardAgentTypesSlice,
  buildDashboardOverviewSlice as originalBuildDashboardOverviewSlice,
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
  tracer?: DashboardTracer
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
  tracer?: DashboardTracer
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
  tracer?: DashboardTracer
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
  tracer?: DashboardTracer
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
  tracer?: DashboardTracer
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

export { parseDashboardWishlistPaging };
