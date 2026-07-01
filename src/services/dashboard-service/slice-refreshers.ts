import type { ModuleLifecycleContext } from "../../contracts/module-contract.js";
import { ModuleCommandRouter } from "../../core/module-command-router.js";
import { cliPerfTracer, recordMetric } from "../../core/cli-perf-trace.js";
import type { OpenedPlanningStores } from "../../modules/task-engine/persistence/planning-open.ts";
import { resolveRegistryAndConfig } from "../../core/module-registry-resolve.js";
import { defaultRegistryModules } from "../../modules/index.js";
import {
  buildDashboardOverviewSlice,
  buildDashboardQueueSlice,
  buildDashboardStatusSlice,
  buildDashboardAgentActivitySlice,
  buildDashboardAgentTypesSlice,
  buildDashboardTerminalTasksPage,
  buildDashboardPhaseSlice,
  buildDashboardAgentSlice,
  buildDashboardPlanArtifactSlice,
  buildDashboardIdeasSlice,
  buildDashboardTeamSlice,
  buildDashboardSubagentsSlice,
  buildDashboardCheckpointsSlice,
  buildDashboardPhaseJournalSlice,
  buildDashboardConfigSlice
} from "../../modules/task-engine/dashboard/slice-builders.js";
import { openPlanningStoresReadOnly } from "../../modules/task-engine/persistence/planning-open.js";
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
  /** Single read-only store opened once and reused for all slice refreshes. */
  private storesPromise: OpenedPlanningStores | null = null;
  /** How many times openPlanningStoresReadOnly was actually invoked. */
  private storeOpenCount = 0;
  /** Wall-clock ms timestamp of the most recent successful/error completion per slice name. */
  private readonly lastRefreshAt = new Map<string, number>();

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

  /**
   * How many times the underlying planning store was actually opened.
   * Should be 1 after the first refresh; stays 1 for all subsequent refreshes
   * because the store is cached in storesPromise.
   */
  getStoreOpenCount(): number {
    return this.storeOpenCount;
  }

  /**
   * Returns the wall-clock timestamp (Date.now()) of the most recent completed
   * refresh for the given slice, or 0 if the slice has never been refreshed.
   * Used by the watcher timer backstop to decide whether to skip a tick.
   */
  getLastRefreshAt(sliceName: string): number {
    return this.lastRefreshAt.get(sliceName) ?? 0;
  }

  async refreshSlice(name: string): Promise<string[]> {
    const def = lookupDashboardServiceSlice(name);
    if (!def) {
      throw new Error(`unknown dashboard slice: ${name}`);
    }
    this.observability.markLoading(name, def.source);
    this.snapshotStore.markSliceLoading(name);
    let result: string[];
    try {
      const payload = await this.loadSlicePayload(def);
      const planningGeneration =
        typeof payload.planningGeneration === "number" ? payload.planningGeneration : this.planningGeneration;
      this.observability.markSuccess(name, def.source);
      result = this.snapshotStore.applySliceSuccess(name, def.source, payload, planningGeneration);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.observability.markError(name, def.source, message);
      result = this.snapshotStore.applySliceError(name, def.source, message);
    }
    // Record completion time regardless of success/error so the timer backstop
    // knows this slice was recently touched.
    this.lastRefreshAt.set(name, Date.now());
    return result;
  }

  private async openStores(): Promise<OpenedPlanningStores> {
    if (!this.storesPromise) {
      if (!this.ctx) {
        throw new Error("dashboard slice refresher not started");
      }
      this.storeOpenCount += 1;
      this.storesPromise = await cliPerfTracer.spanAsync('store-open', async () =>
        openPlanningStoresReadOnly(this.ctx as ModuleLifecycleContext)
      );
      recordMetric('storeOpenMs', undefined);
    }
    return this.storesPromise!;
  }

  private async loadSlicePayload(def: DashboardServiceSliceDefinition): Promise<Record<string, unknown>> {
    if (!this.ctx || !this.router) {
      throw new Error("dashboard slice refresher not started");
    }

    // For all known dashboard slices, call the builder function directly against
    // the cached read-only store instead of round-tripping through the CLI command
    // router / registry / policy machinery. This is the "genuinely warm" path:
    // one persistent store connection, direct function calls, no command overhead.
    const opened = await this.openStores();
    const { taskStore, sqliteDual } = opened;
    const generation = sqliteDual.getPlanningGeneration();

    switch (def.name) {
      case "overview":
        return def.extractPayload(
          await cliPerfTracer.spanAsync('builder-overview', () =>
            buildDashboardOverviewSlice(this.ctx!, taskStore, generation, sqliteDual, def.args, undefined)
          ) as Record<string, unknown>
        );

      case "queue":
        return def.extractPayload(
          await cliPerfTracer.spanAsync('builder-queue', () =>
            buildDashboardQueueSlice(this.ctx!, taskStore, generation, sqliteDual, def.args, undefined)
          ) as Record<string, unknown>
        );

      case "status":
        return def.extractPayload(
          await cliPerfTracer.spanAsync('builder-status', () =>
            buildDashboardStatusSlice(this.ctx!, taskStore, generation, sqliteDual, def.args, undefined)
          ) as Record<string, unknown>
        );

      case "agentActivity":
        return def.extractPayload(
          await cliPerfTracer.spanAsync('builder-agentActivity', () =>
            buildDashboardAgentActivitySlice(this.ctx!, taskStore, generation, sqliteDual, def.args, undefined)
          ) as Record<string, unknown>
        );

      case "agentTypes":
        return def.extractPayload(
          await cliPerfTracer.spanAsync('builder-agentTypes', () =>
            buildDashboardAgentTypesSlice(this.ctx!, taskStore, generation, sqliteDual, def.args, undefined)
          ) as Record<string, unknown>
        );

      case "terminalTasks":
        return def.extractPayload(
          buildDashboardTerminalTasksPage(taskStore, sqliteDual, { status: "completed", limit: 10 }) as Record<string, unknown>
        );

      case "phase":
        return def.extractPayload(
          await cliPerfTracer.spanAsync('builder-phase', () =>
            buildDashboardPhaseSlice(this.ctx!, taskStore, generation, sqliteDual, def.args, undefined)
          ) as Record<string, unknown>
        );

      case "agent":
        return def.extractPayload(
          await cliPerfTracer.spanAsync('builder-agent', () =>
            buildDashboardAgentSlice(this.ctx!, taskStore, generation, sqliteDual, def.args, undefined)
          ) as Record<string, unknown>
        );

      case "planArtifact":
        return def.extractPayload(
          await cliPerfTracer.spanAsync('builder-planArtifact', () =>
            buildDashboardPlanArtifactSlice(this.ctx!, taskStore, generation, sqliteDual, def.args, undefined)
          ) as Record<string, unknown>
        );

      case "ideas":
        return def.extractPayload(
          await cliPerfTracer.spanAsync('builder-ideas', () =>
            buildDashboardIdeasSlice(this.ctx!, taskStore, generation, sqliteDual, def.args, undefined)
          ) as Record<string, unknown>
        );

      case "team":
        return def.extractPayload(
          await cliPerfTracer.spanAsync('builder-team', () =>
            buildDashboardTeamSlice(this.ctx!, taskStore, generation, sqliteDual, def.args, undefined)
          ) as Record<string, unknown>
        );

      case "subagents":
        return def.extractPayload(
          await cliPerfTracer.spanAsync('builder-subagents', () =>
            buildDashboardSubagentsSlice(this.ctx!, taskStore, generation, sqliteDual, def.args, undefined)
          ) as Record<string, unknown>
        );

      case "checkpoints":
        return def.extractPayload(
          await cliPerfTracer.spanAsync('builder-checkpoints', () =>
            buildDashboardCheckpointsSlice(this.ctx!, taskStore, generation, sqliteDual, def.args, undefined)
          ) as Record<string, unknown>
        );

      case "phaseJournal":
        return def.extractPayload(
          await cliPerfTracer.spanAsync('builder-phaseJournal', () =>
            buildDashboardPhaseJournalSlice(this.ctx!, taskStore, generation, sqliteDual, def.args, undefined)
          ) as Record<string, unknown>
        );

      case "config":
        return def.extractPayload(
          await cliPerfTracer.spanAsync('builder-config', () =>
            buildDashboardConfigSlice(this.ctx!, taskStore, generation, sqliteDual, def.args, undefined)
          ) as Record<string, unknown>
        );

      default:
        // Fallback: go through the router for slices that have no direct builder
        // (e.g. "cae" which uses cae-authoring-summary command).
        break;
    }

    const result = await this.router.execute(def.command, { ...def.args }, this.ctx);
    if (!result.ok) {
      throw new Error(result.message ?? `${def.command} failed (${result.code})`);
    }
    return def.extractPayload(result.data as Record<string, unknown>);
  }
}
