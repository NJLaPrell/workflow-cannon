import type { ModuleCommandResult, ModuleLifecycleContext } from "../../../contracts/module-contract.js";
import type { SqliteDualPlanningStore } from "../persistence/sqlite-dual-planning.js";
import type { TaskStore } from "../persistence/store.js";
import {
  buildDashboardBase,
  buildDashboardOverview,
  buildDashboardFullProjection,
  buildDashboardOverviewProjection,
  buildDashboardQueueProjection,
  buildDashboardStatusProjection,
  parseDashboardWishlistPaging
} from "../dashboard/build-dashboard-base.js";

import {
  buildDashboardOverviewSlice,
  buildDashboardQueueSlice,
  buildDashboardStatusSlice,
  buildDashboardAgentActivitySlice,
  buildDashboardAgentTypesSlice,
  buildDashboardTerminalTasksPage
} from "../dashboard/slice-builders.js";
import {
  finalizeDashboardSummaryProjection,
  parseDashboardSummaryProjection
} from "../dashboard/dashboard-summary-projection.js";
import type { DashboardSummaryTracer } from "../dashboard/dashboard-summary-trace.js";
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

// Slice command wrappers
export async function dashboardOverviewSliceCommand(
  ctx: ModuleLifecycleContext,
  store: TaskStore,
  planningGeneration: number,
  sqliteDual?: SqliteDualPlanningStore,
  commandArgs?: Record<string, unknown>,
  tracer?: DashboardSummaryTracer
): Promise<ModuleCommandResult> {
  const data = await buildDashboardOverviewSlice(ctx, store, planningGeneration, sqliteDual, commandArgs, tracer);
  return { ok: true, code: "dashboard-overview-slice", message: "Dashboard overview slice built", data: data as Record<string, unknown> };
}

export async function dashboardQueueSliceCommand(
  ctx: ModuleLifecycleContext,
  store: TaskStore,
  planningGeneration: number,
  sqliteDual?: SqliteDualPlanningStore,
  commandArgs?: Record<string, unknown>,
  tracer?: DashboardSummaryTracer
): Promise<ModuleCommandResult> {
  const data = await buildDashboardQueueSlice(ctx, store, planningGeneration, sqliteDual, commandArgs, tracer);
  return { ok: true, code: "dashboard-queue-slice", message: "Dashboard queue slice built", data: data as Record<string, unknown> };
}

export async function dashboardStatusSliceCommand(
  ctx: ModuleLifecycleContext,
  store: TaskStore,
  planningGeneration: number,
  sqliteDual?: SqliteDualPlanningStore,
  commandArgs?: Record<string, unknown>,
  tracer?: DashboardSummaryTracer
): Promise<ModuleCommandResult> {
  const data = await buildDashboardStatusSlice(ctx, store, planningGeneration, sqliteDual, commandArgs, tracer);
  return { ok: true, code: "dashboard-status-slice", message: "Dashboard status slice built", data: data as Record<string, unknown> };
}

export async function dashboardAgentActivitySliceCommand(
  ctx: ModuleLifecycleContext,
  store: TaskStore,
  planningGeneration: number,
  sqliteDual?: SqliteDualPlanningStore,
  commandArgs?: Record<string, unknown>,
  tracer?: DashboardSummaryTracer
): Promise<ModuleCommandResult> {
  const data = await buildDashboardAgentActivitySlice(ctx, store, planningGeneration, sqliteDual, commandArgs, tracer);
  return { ok: true, code: "dashboard-agent-activity-slice", message: "Dashboard agent activity slice built", data: data as Record<string, unknown> };
}

export async function dashboardAgentTypesSliceCommand(
  ctx: ModuleLifecycleContext,
  store: TaskStore,
  planningGeneration: number,
  sqliteDual?: SqliteDualPlanningStore,
  commandArgs?: Record<string, unknown>,
  tracer?: DashboardSummaryTracer
): Promise<ModuleCommandResult> {
  const data = await buildDashboardAgentTypesSlice(ctx, store, planningGeneration, sqliteDual, commandArgs, tracer);
  return { ok: true, code: "dashboard-agent-types-slice", message: "Dashboard agent types slice built", data: data as Record<string, unknown> };
}

export async function dashboardTerminalTasksSliceCommand(
  ctx: ModuleLifecycleContext,
  store: TaskStore,
  planningGeneration: number,
  sqliteDual?: SqliteDualPlanningStore,
  commandArgs?: Record<string, unknown>,
  tracer?: DashboardSummaryTracer
): Promise<ModuleCommandResult> {
  const data = await buildDashboardTerminalTasksPage(store, sqliteDual, { status: "completed", limit: 10 });
  return { ok: true, code: "dashboard-terminal-tasks", message: "Dashboard terminal tasks slice built", data: data as Record<string, unknown> };
}
