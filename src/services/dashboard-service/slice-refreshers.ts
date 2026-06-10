import type { ModuleLifecycleContext } from "../../contracts/module-contract.js";
import { ModuleCommandRouter } from "../../core/module-command-router.js";
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
  private storesPromise: ReturnType<typeof openPlanningStores> | null = null;

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

  private async openStores() {
    if (!this.storesPromise) {
      if (!this.ctx) {
        throw new Error("dashboard slice refresher not started");
      }
      this.storesPromise = openPlanningStoresReadOnly(this.ctx);
    }
    return this.storesPromise;
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
      let sliceData: Record<string, unknown>;
      switch (def.name) {
        case "overview":
          sliceData = await buildDashboardOverviewSlice(
            this.ctx,
            taskStore,
            generation,
            sqliteDual,
            def.args,
            undefined
          );
          break;
        case "queue":
          sliceData = await buildDashboardQueueSlice(
            this.ctx,
            taskStore,
            generation,
            sqliteDual,
            def.args,
            undefined
          );
          break;
        case "status":
          sliceData = await buildDashboardStatusSlice(
            this.ctx,
            taskStore,
            generation,
            sqliteDual,
            def.args,
            undefined
          );
          break;
        case "agentActivity":
          sliceData = await buildDashboardAgentActivitySlice(
            this.ctx,
            taskStore,
            generation,
            sqliteDual,
            def.args,
            undefined
          );
          break;
        case "agentTypes":
          sliceData = await buildDashboardAgentTypesSlice(
            this.ctx,
            taskStore,
            generation,
            sqliteDual,
            def.args,
            undefined
          );
          break;
        case "terminalTasks":
          // Terminal tasks slice uses a different builder signature.
          sliceData = await buildDashboardTerminalTasksPage(
            taskStore,
            sqliteDual,
            { status: "completed", limit: 10 }
          );
          break;
        default:
          // Fallback to original command execution for any unknown slice.
          const result = await this.router.execute(def.command, { ...def.args }, this.ctx);
          if (!result.ok) {
            throw new Error(result.message ?? `${def.command} failed (${result.code})`);
          }
          return def.extractPayload(result.data as Record<string, unknown>);
      }
      return def.extractPayload(sliceData);
    }
    // For non-dashboard-summary commands, use slice-native builders when available
    if (def.command === "dashboard-overview-slice") {
      const opened = await this.openStores();
      const { taskStore, sqliteDual } = opened;
      const generation = sqliteDual.getPlanningGeneration();
      const sliceData = await buildDashboardOverviewSlice(
        this.ctx,
        taskStore,
        generation,
        sqliteDual,
        def.args,
        undefined
      );
      return def.extractPayload(sliceData);
    } else if (def.command === "dashboard-queue-slice") {
      const opened = await this.openStores();
      const { taskStore, sqliteDual } = opened;
      const generation = sqliteDual.getPlanningGeneration();
      const sliceData = await buildDashboardQueueSlice(
        this.ctx,
        taskStore,
        generation,
        sqliteDual,
        def.args,
        undefined
      );
      return def.extractPayload(sliceData);
    } else if (def.command === "dashboard-status-slice") {
      const opened = await this.openStores();
      const { taskStore, sqliteDual } = opened;
      const generation = sqliteDual.getPlanningGeneration();
      const sliceData = await buildDashboardStatusSlice(
        this.ctx,
        taskStore,
        generation,
        sqliteDual,
        def.args,
        undefined
      );
      return def.extractPayload(sliceData);
    } else if (def.command === "dashboard-agent-activity-slice") {
      const opened = await this.openStores();
      const { taskStore, sqliteDual } = opened;
      const generation = sqliteDual.getPlanningGeneration();
      const sliceData = await buildDashboardAgentActivitySlice(
        this.ctx,
        taskStore,
        generation,
        sqliteDual,
        def.args,
        undefined
      );
      return def.extractPayload(sliceData);
    } else if (def.command === "dashboard-agent-types-slice") {
      const opened = await this.openStores();
      const { taskStore, sqliteDual } = opened;
      const generation = sqliteDual.getPlanningGeneration();
      const sliceData = await buildDashboardAgentTypesSlice(
        this.ctx,
        taskStore,
        generation,
        sqliteDual,
        def.args,
        undefined
      );
      return def.extractPayload(sliceData);
    } else if (def.command === "dashboard-terminal-tasks-page") {
      const opened = await this.openStores();
      const { taskStore, sqliteDual } = opened;
      const sliceData = await buildDashboardTerminalTasksPage(
        taskStore,
        sqliteDual,
        def.args as any
      );
      return def.extractPayload(sliceData);
    } else {
      const result = await this.router.execute(def.command, { ...def.args }, this.ctx);
      if (!result.ok) {
        throw new Error(result.message ?? `${def.command} failed (${result.code})`);
      }
      return def.extractPayload(result.data as Record<string, unknown>);
    }
  }
}
