import type { ModuleLifecycleContext } from "../../contracts/module-contract.js";
import { ModuleCommandRouter } from "../../core/module-command-router.js";
import { cliPerfTracer, recordMetric } from "../../core/cli-perf-trace.js";
import type { OpenedPlanningStores } from "../../modules/task-engine/persistence/planning-open.ts";
import { resolveRegistryAndConfig } from "../../core/module-registry-resolve.js";
import { defaultRegistryModules } from "../../modules/index.js";
import { buildDashboardOverviewSlice, buildDashboardQueueSlice, buildDashboardStatusSlice, buildDashboardAgentActivitySlice, buildDashboardAgentTypesSlice, buildDashboardTerminalTasksPage } from "../../modules/task-engine/dashboard/slice-builders.js";
import { openPlanningStores, openPlanningStoresReadOnly } from "../../modules/task-engine/persistence/planning-open.js";
import {
  lookupDashboardServiceSlice,
  type DashboardServiceSliceDefinition
} from "./slice-definitions.js";
import type { DashboardSnapshotStore } from "./snapshot-store.js";
import { assertDashboardDataSourceAtServiceStart } from "./resolve-data-source-config.js";
import {
  DashboardSliceObservabilityTracker,
  type DashboardSliceObservabilityRecord,
  type DashboardSliceObservabilitySummary
} from "./slice-observability.js";

export type DashboardSliceRefresherOptions = {
  workspacePath: string;
  snapshotStore: DashboardSnapshotStore;
};

export class DashboardSliceRefresher {
  private readonly workspacePath: string;
  private readonly snapshotStore: DashboardSnapshotStore;
  private readonly observability = new DashboardSliceObservabilityTracker();
  private ctx: ModuleLifecycleContext | null = null;
  private router: ModuleCommandRouter | null = null;
  private planningGeneration = 0;
  // Store the opened planning stores after first access
  private storesPromise: OpenedPlanningStores | null = null;

  constructor(options: DashboardSliceRefresherOptions) {
    this.workspacePath = options.workspacePath;
    this.snapshotStore = options.snapshotStore;
  }

  async start(): Promise<void> {
    const { registry, effective } = await resolveRegistryAndConfig(
      this.workspacePath,
      defaultRegistryModules,
      {}
    );
    assertDashboardDataSourceAtServiceStart(effective);
    this.ctx = {
      runtimeVersion: "0.1",
      workspacePath: this.workspacePath,
      effectiveConfig: effective
    };
    this.router = new ModuleCommandRouter(registry);
    const opened = await this.openStores();
    // opened is guaranteed non‑null after openStores resolves
    this.planningGeneration = opened.sqliteDual.getPlanningGeneration();
  }

  async stop(): Promise<void> {
    this.storesPromise = null;
    this.ctx = null;
    this.router = null;
  }

  async readPlanningGeneration(): Promise<number> {
    const opened = await this.openStores();
    return opened.sqliteDual.getPlanningGeneration();
  }

  async refreshSlices(sliceNames: string[]): Promise<string[]> {
    const changed: string[] = [];
    for (const name of sliceNames) {
      changed.push(...(await this.refreshSlice(name)));
    }
    return changed;
  }

  getSliceObservability(): Record<string, DashboardSliceObservabilityRecord> {
    return this.observability.getSliceRecords();
  }

  getObservabilitySummary(): DashboardSliceObservabilitySummary {
    return this.observability.summarize();
  }

  async refreshSlice(name: string): Promise<string[]> {
    const def = lookupDashboardServiceSlice(name);
    if (!def) {
      throw new Error(`unknown dashboard slice: ${name}`);
    }
    this.observability.markLoading(name, def.source);
    this.snapshotStore.markSliceLoading(name);
    try {
      const payload = await this.loadSlicePayload(def);
      const planningGeneration =
        typeof payload.planningGeneration === "number" ? payload.planningGeneration : this.planningGeneration;
      this.observability.markSuccess(name, def.source);
      return this.snapshotStore.applySliceSuccess(name, def.source, payload, planningGeneration);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.observability.markError(name, def.source, message);
      return this.snapshotStore.applySliceError(name, def.source, message);
    }
  }

  private async openStores(): Promise<OpenedPlanningStores> {
    if (!this.storesPromise) {
      if (!this.ctx) {
        throw new Error("dashboard slice refresher not started");
      }
      // openPlanningStoresReadOnly returns OpenedPlanningStores
      this.storesPromise = await cliPerfTracer.spanAsync('store-open', async () => openPlanningStoresReadOnly(this.ctx as ModuleLifecycleContext));
      recordMetric('storeOpenMs', undefined);
    }
    // Non‑null assertion because we just ensured it is set
    return this.storesPromise!;
  }

  private async loadSlicePayload(def: DashboardServiceSliceDefinition): Promise<Record<string, unknown>> {
    if (!this.ctx || !this.router) {
      throw new Error("dashboard slice refresher not started");
    }

    // Slice-native commands build their payload directly from the cached read-only
    // planning store (`openStores` memoizes `storesPromise`). Routing them through
    // `router.execute` would re-enter the module command path and open a *fresh*
    // planning store on every refresh, bypassing the warm cache entirely — the
    // regression this fixes. Non-native commands (dashboard-summary projections,
    // cae-authoring-summary, and anything unknown) still resolve via the router.
    const nativePayload = await this.buildSliceNativePayload(def);
    if (nativePayload) {
      return nativePayload.payload;
    }

    const result = await this.router.execute(def.command, { ...def.args }, this.ctx);
    if (!result.ok) {
      throw new Error(result.message ?? `${def.command} failed (${result.code})`);
    }
    return def.extractPayload(result.data as Record<string, unknown>);
  }

  /**
   * Build a slice payload from a slice-native builder against the cached warm store.
   * Returns `null` when `def.command` has no slice-native builder so the caller can fall
   * back to `router.execute`. Dispatch is keyed on `def.command` (the slice-native command
   * name) rather than `def.name` so the builders are actually reachable.
   */
  private async buildSliceNativePayload(
    def: DashboardServiceSliceDefinition
  ): Promise<{ payload: Record<string, unknown> } | null> {
    const ctx = this.ctx as ModuleLifecycleContext;
    switch (def.command) {
      case "dashboard-overview-slice": {
        const { taskStore, sqliteDual } = await this.openStores();
        const generation = sqliteDual.getPlanningGeneration();
        const sliceData = await cliPerfTracer.spanAsync("builder-overview", async () =>
          buildDashboardOverviewSlice(ctx, taskStore, generation, sqliteDual, def.args, undefined)
        );
        recordMetric("builderOverviewMs", undefined);
        return { payload: def.extractPayload(sliceData) };
      }
      case "dashboard-queue-slice": {
        const { taskStore, sqliteDual } = await this.openStores();
        const generation = sqliteDual.getPlanningGeneration();
        const sliceData = await cliPerfTracer.spanAsync("builder-queue", async () =>
          buildDashboardQueueSlice(ctx, taskStore, generation, sqliteDual, def.args, undefined)
        );
        recordMetric("builderQueueMs", undefined);
        return { payload: def.extractPayload(sliceData) };
      }
      case "dashboard-status-slice": {
        const { taskStore, sqliteDual } = await this.openStores();
        const generation = sqliteDual.getPlanningGeneration();
        const sliceData = await cliPerfTracer.spanAsync("builder-status", async () =>
          buildDashboardStatusSlice(ctx, taskStore, generation, sqliteDual, def.args, undefined)
        );
        recordMetric("builderStatusMs", undefined);
        return { payload: def.extractPayload(sliceData) };
      }
      case "dashboard-agent-activity-slice": {
        const { taskStore, sqliteDual } = await this.openStores();
        const generation = sqliteDual.getPlanningGeneration();
        const sliceData = await cliPerfTracer.spanAsync("builder-agentActivity", async () =>
          buildDashboardAgentActivitySlice(ctx, taskStore, generation, sqliteDual, def.args, undefined)
        );
        recordMetric("builderAgentActivityMs", undefined);
        return { payload: def.extractPayload(sliceData) };
      }
      case "dashboard-agent-types-slice": {
        const { taskStore, sqliteDual } = await this.openStores();
        const generation = sqliteDual.getPlanningGeneration();
        const sliceData = await cliPerfTracer.spanAsync("builder-agentTypes", async () =>
          buildDashboardAgentTypesSlice(ctx, taskStore, generation, sqliteDual, def.args, undefined)
        );
        recordMetric("builderAgentTypesMs", undefined);
        return { payload: def.extractPayload(sliceData) };
      }
      case "dashboard-terminal-tasks-page": {
        const { taskStore, sqliteDual } = await this.openStores();
        const sliceData = await cliPerfTracer.spanAsync("builder-terminalTasks", async () =>
          buildDashboardTerminalTasksPage(taskStore, sqliteDual, { status: "completed", limit: 10 })
        );
        recordMetric("builderTerminalTasksMs", undefined);
        return { payload: def.extractPayload(sliceData) };
      }
      default:
        return null;
    }
  }
}
