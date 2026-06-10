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
    // Use slice-native builders for known slices that previously used dashboard-summary
    if (def.command === "dashboard-summary") {
      const opened = await this.openStores();
      const { taskStore, sqliteDual } = opened;
      const generation = sqliteDual.getPlanningGeneration();
      // Initialise with an empty object to satisfy definite assignment analysis
      let sliceData: Record<string, unknown> = {};
      switch (def.name) {
        case "overview":
          sliceData = await cliPerfTracer.spanAsync('builder-overview', async () =>
            buildDashboardOverviewSlice(
              this.ctx!,
              taskStore,
              generation,
              sqliteDual,
              def.args,
              undefined
            )
          );
          recordMetric('builderOverviewMs', undefined);
          break;
        case "queue":
          sliceData = await cliPerfTracer.spanAsync('builder-queue', async () =>
            buildDashboardQueueSlice(
              this.ctx!,
              taskStore,
              generation,
              sqliteDual,
              def.args,
              undefined
            )
          );
          recordMetric('builderQueueMs', undefined);
          break;
        case "status":
          sliceData = await cliPerfTracer.spanAsync('builder-status', async () =>
            buildDashboardStatusSlice(
              this.ctx!,
              taskStore,
              generation,
              sqliteDual,
              def.args,
              undefined
            )
          );
          recordMetric('builderStatusMs', undefined);
          break;
        case "agentActivity":
          sliceData = await cliPerfTracer.spanAsync('builder-agentActivity', async () =>
            buildDashboardAgentActivitySlice(
              this.ctx!,
              taskStore,
              generation,
              sqliteDual,
              def.args,
              undefined
            )
          );
          recordMetric('builderAgentActivityMs', undefined);
          break;
        case "agentTypes":
          sliceData = await cliPerfTracer.spanAsync('builder-agentTypes', async () =>
            buildDashboardAgentTypesSlice(
              this.ctx!,
              taskStore,
              generation,
              sqliteDual,
              def.args,
              undefined
            )
          );
          recordMetric('builderAgentTypesMs', undefined);
          break;
        case "terminalTasks":
          // Terminal tasks slice uses a different builder signature.
          sliceData = await cliPerfTracer.spanAsync('builder-terminalTasks', async () =>
            buildDashboardTerminalTasksPage(
              taskStore,
              sqliteDual,
              { status: "completed", limit: 10 }
            )
          );
          recordMetric('builderTerminalTasksMs', undefined);
          break;
        default:
        }
      return def.extractPayload(sliceData);
    }
    // Fallback to original command execution for any unknown slice.
    const result = await this.router.execute(def.command, { ...def.args }, this.ctx);
    if (!result.ok) {
      throw new Error(result.message ?? `${def.command} failed (${result.code})`);
    }
    return def.extractPayload(result.data as Record<string, unknown>);
  }
}
