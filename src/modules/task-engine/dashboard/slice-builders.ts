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
  buildDashboardOpsSlice as originalBuildDashboardOpsSlice,
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

export const buildDashboardTerminalTasksPage = originalBuildDashboardTerminalTasksPage;

export const buildDashboardOpsSlice = originalBuildDashboardOpsSlice;

export { parseDashboardWishlistPaging };

export async function buildDashboardPhaseSlice(
  ctx: ModuleLifecycleContext,
  store: TaskStore,
  planningGeneration: number,
  sqliteDual?: SqliteDualPlanningStore,
  commandArgs?: Record<string, unknown>,
  tracer?: DashboardSummaryTracer
) {
  // Reuse the queue slice as it already contains phase information
  return originalBuildDashboardQueueSlice(
    ctx,
    store,
    planningGeneration,
    sqliteDual,
    commandArgs,
    tracer
  );
}

export async function buildDashboardAgentSlice(
  ctx: ModuleLifecycleContext,
  store: TaskStore,
  planningGeneration: number,
  sqliteDual?: SqliteDualPlanningStore,
  commandArgs?: Record<string, unknown>,
  tracer?: DashboardSummaryTracer
) {
  // Agent slice can reuse the agent activity slice which provides agent status
  return originalBuildDashboardAgentActivitySlice(
    ctx,
    store,
    planningGeneration,
    sqliteDual,
    commandArgs,
    tracer
  );
}

export async function buildDashboardPlanArtifactSlice(
  ctx: ModuleLifecycleContext,
  store: TaskStore,
  planningGeneration: number,
  sqliteDual?: SqliteDualPlanningStore,
  commandArgs?: Record<string, unknown>,
  tracer?: DashboardSummaryTracer
) {
  // Plan artifact belongs to the lightweight ops slice; overview only carries an eager stub.
  return originalBuildDashboardOpsSlice(
    ctx,
    store,
    planningGeneration,
    sqliteDual
  );
}

export async function buildDashboardIdeasSlice(
  ctx: ModuleLifecycleContext,
  store: TaskStore,
  planningGeneration: number,
  sqliteDual?: SqliteDualPlanningStore,
  commandArgs?: Record<string, unknown>,
  tracer?: DashboardSummaryTracer
) {
  // Ideas and brainstorming rollups are populated by the queue projection.
  return originalBuildDashboardQueueSlice(
    ctx,
    store,
    planningGeneration,
    sqliteDual,
    commandArgs,
    tracer
  );
}

export async function buildDashboardTeamSlice(
  ctx: ModuleLifecycleContext,
  store: TaskStore,
  planningGeneration: number,
  sqliteDual?: SqliteDualPlanningStore,
  commandArgs?: Record<string, unknown>,
  tracer?: DashboardSummaryTracer
) {
  // Team execution summary is part of the overview projection
  return originalBuildDashboardOverviewSlice(
    ctx,
    store,
    planningGeneration,
    sqliteDual,
    commandArgs,
    tracer
  );
}

export async function buildDashboardSubagentsSlice(
  ctx: ModuleLifecycleContext,
  store: TaskStore,
  planningGeneration: number,
  sqliteDual?: SqliteDualPlanningStore,
  commandArgs?: Record<string, unknown>,
  tracer?: DashboardSummaryTracer
) {
  // Subagent registry is part of the agentTypes projection
  return originalBuildDashboardAgentTypesSlice(
    ctx,
    store,
    planningGeneration,
    sqliteDual,
    commandArgs,
    tracer
  );
}

export async function buildDashboardCheckpointsSlice(
  ctx: ModuleLifecycleContext,
  store: TaskStore,
  planningGeneration: number,
  sqliteDual?: SqliteDualPlanningStore,
  commandArgs?: Record<string, unknown>,
  tracer?: DashboardSummaryTracer
) {
  // Checkpoints are included in the overview projection
  return originalBuildDashboardOverviewSlice(
    ctx,
    store,
    planningGeneration,
    sqliteDual,
    commandArgs,
    tracer
  );
}

export async function buildDashboardPhaseJournalSlice(
  ctx: ModuleLifecycleContext,
  store: TaskStore,
  planningGeneration: number,
  sqliteDual?: SqliteDualPlanningStore,
  commandArgs?: Record<string, unknown>,
  tracer?: DashboardSummaryTracer
) {
  // Phase journal stats are part of the queue projection
  return originalBuildDashboardQueueSlice(
    ctx,
    store,
    planningGeneration,
    sqliteDual,
    commandArgs,
    tracer
  );
}

export async function buildDashboardConfigSlice(
  ctx: ModuleLifecycleContext,
  store: TaskStore,
  planningGeneration: number,
  sqliteDual?: SqliteDualPlanningStore,
  commandArgs?: Record<string, unknown>,
  tracer?: DashboardSummaryTracer
) {
  // Configuration data is lightweight; reuse overview
  return originalBuildDashboardOverviewSlice(
    ctx,
    store,
    planningGeneration,
    sqliteDual,
    commandArgs,
    tracer
  );
}

export async function buildDashboardCaeSlice(
  ctx: ModuleLifecycleContext,
  store: TaskStore,
  planningGeneration: number,
  sqliteDual?: SqliteDualPlanningStore,
  commandArgs?: Record<string, unknown>,
  tracer?: DashboardSummaryTracer
) {
  // CAE slice is also lightweight; reuse overview
  return originalBuildDashboardOverviewSlice(
    ctx,
    store,
    planningGeneration,
    sqliteDual,
    commandArgs,
    tracer
  );
}
