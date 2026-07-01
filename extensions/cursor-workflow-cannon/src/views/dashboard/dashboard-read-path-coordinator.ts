import type { CommandClient } from "../../runtime/command-client.js";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { DashboardDataSourceMode } from "./dashboard-data-source.js";
import type { DashboardDataStore } from "./dashboard-data-store.js";
import type { DashboardPollerCoordinator } from "./dashboard-pollers.js";
import {
  formatDashboardReadModeBadgeDetail,
  formatDashboardReadModeBadgeLabel,
  type DashboardActiveReadPath,
  type DashboardReadModeBadge
} from "./dashboard-read-mode-badge.js";
import { DashboardServiceStoreSync } from "./dashboard-service-store-sync.js";
import {
  DASHBOARD_SERVICE_RUNTIME_REL,
  parseDashboardServiceRuntime
} from "./dashboard-service-mapper.js";
import { readConfiguredDashboardDataSourceMode } from "./resolve-dashboard-read-config.js";
import {
  probeDashboardServiceHealth,
  ServiceDashboardDataSource
} from "./service-dashboard-data-source.js";
import type { DashboardSliceName } from "./dashboard-snapshot-types.js";
import type { DashboardSectionId } from "./dashboard-section-registry.js";

export type DashboardReadPathCoordinatorDeps = {
  workspacePath: string;
  client: Pick<CommandClient, "run">;
  store: DashboardDataStore;
  pollers: DashboardPollerCoordinator;
  log?: (message: string) => void;
  onModeChanged?: (badge: DashboardReadModeBadge) => void;
};

/**
 * Selects Option 1 CLI pollers vs Option 2 warm service (T100599).
 * Only one read path runs at a time — no duplicate CLI spawn during service mode.
 */
export class DashboardReadPathCoordinator {
  private configuredMode: DashboardDataSourceMode = "auto";
  private sessionOverride: "cli-polling" | null = null;
  private activePath: DashboardActiveReadPath | null = null;
  private serviceFailDetail: string | undefined;
  private serviceSync: DashboardServiceStoreSync | undefined;
  private pollersPaused = false;
  private serviceStartAttempted = false;
  private running = false;

  constructor(private readonly deps: DashboardReadPathCoordinatorDeps) {}

  getModeBadge(): DashboardReadModeBadge {
    const configured = this.sessionOverride ?? this.configuredMode;
    return {
      configured,
      active: this.activePath ?? "cli-polling",
      detail: this.serviceFailDetail
    };
  }

  getModeBadgeLabel(): string {
    return formatDashboardReadModeBadgeLabel(this.getModeBadge());
  }

  getModeBadgeDetail(): string | undefined {
    return formatDashboardReadModeBadgeDetail(this.getModeBadge());
  }

  isServicePathActive(): boolean {
    return this.activePath === "service";
  }

  async start(): Promise<void> {
    if (this.running) {
      return;
    }
    this.running = true;
    this.configuredMode = await readConfiguredDashboardDataSourceMode(this.deps.workspacePath);
    await this.activateReadPath();
  }

  async stop(): Promise<void> {
    await this.stopActivePath();
    this.running = false;
    this.activePath = null;
  }

  /** Re-read config and swap read paths when `dashboard.dataSource` changes. */
  async reloadFromConfig(): Promise<void> {
    const next = await readConfiguredDashboardDataSourceMode(this.deps.workspacePath);
    if (next === this.configuredMode && !this.sessionOverride) {
      return;
    }
    this.configuredMode = next;
    if (this.running) {
      await this.activateReadPath();
    }
  }

  async forceCliPollingMode(): Promise<void> {
    this.sessionOverride = "cli-polling";
    this.serviceFailDetail = undefined;
    if (this.running) {
      await this.activateReadPath();
    } else {
      this.emitModeChanged();
    }
  }

  async restartDashboardService(): Promise<{ ok: boolean; message?: string }> {
    this.sessionOverride = null;
    await this.stopActivePath();
    const result = await this.deps.client.run("dashboard-service-start", {});
    if (result.ok !== true) {
      const message =
        typeof result.message === "string"
          ? result.message
          : typeof result.code === "string"
            ? result.code
            : "dashboard-service-start failed";
      this.serviceFailDetail = message;
      if (this.running) {
        await this.activateReadPath();
      }
      return { ok: false, message };
    }
    if (this.running) {
      await this.activateReadPath();
    }
    return { ok: true, message: typeof result.message === "string" ? result.message : undefined };
  }

  pause(): void {
    this.pollersPaused = true;
    this.deps.pollers.pause();
  }

  resume(): void {
    this.pollersPaused = false;
    if (this.activePath === "cli-polling") {
      this.deps.pollers.resume();
    }
  }

  async refreshCriticalNow(): Promise<void> {
    if (this.activePath === "service" && this.serviceSync) {
      await this.serviceSync.refreshSlice("overview");
      return;
    }
    await this.deps.pollers.refreshCriticalNow();
  }

  async refreshSlicesNow(names: readonly DashboardSliceName[]): Promise<void> {
    if (this.activePath === "service" && this.serviceSync) {
      for (const name of names) {
        await this.serviceSync.refreshSlice(name);
      }
      return;
    }
    await this.deps.pollers.refreshSlicesNow(names);
  }

  setVisibleSections(sections: readonly DashboardSectionId[]): void {
    if (this.activePath !== "service") {
      this.deps.pollers.setVisibleSections(sections);
    }
  }

  private async activateReadPath(): Promise<void> {
    await this.stopActivePath();
    const effectiveMode = this.sessionOverride ?? this.configuredMode;
    this.serviceFailDetail = undefined;

    if (effectiveMode === "cli-polling") {
      await this.startCliPollingPath();
      this.emitModeChanged();
      return;
    }

    const serviceHealthy = await probeDashboardServiceHealth(this.deps.workspacePath);
    if (serviceHealthy) {
      try {
        await this.startServicePath();
        this.emitModeChanged();
        return;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.deps.log?.(`dashboard service start failed: ${message}`);
        // Fall back to CLI polling after log.
        this.serviceFailDetail = "Dashboard service start failed — using CLI polling";
      }
    } else {
      // Service not healthy.
      if (effectiveMode === "service") {
        this.serviceFailDetail = "Dashboard service is not running or failed health check — using CLI polling";
        await this.startCliBootstrapPath();
        this.emitModeChanged();
        return;
      }
      // Auto mode: attempt to start service once per session.
      if (!this.serviceStartAttempted) {
        this.serviceStartAttempted = true;
        const startResult = await this.restartDashboardService();
        if (startResult.ok) {
          // After successful start, re-probe health and try service path.
          const reprobe = await probeDashboardServiceHealth(this.deps.workspacePath);
          if (reprobe) {
            await this.startServicePath();
            this.emitModeChanged();
            return;
          }
        }
        // If start failed or still unhealthy, fall back.
        this.serviceFailDetail = startResult.message ?? "Dashboard service start failed — using CLI polling";
      } else {
        this.serviceFailDetail = "Dashboard service unavailable — using CLI polling";
      }
    }

    // Fallback: use CLI bootstrap command to fetch multiple cheap slices in one request.
    await this.startCliBootstrapPath();
    this.emitModeChanged();
  }

  private async emitServiceHealthDiagnostics(): Promise<void> {
    try {
      const abs = path.join(this.deps.workspacePath, DASHBOARD_SERVICE_RUNTIME_REL);
      const raw = JSON.parse(await readFile(abs, "utf8")) as unknown;
      const runtime = parseDashboardServiceRuntime(raw);
      if (!runtime) {
        return;
      }
      const res = await fetch(`http://${runtime.host}:${runtime.port}/health`);
      if (!res.ok) {
        return;
      }
      const health = (await res.json()) as {
        generation?: number;
        summary?: { failingSlices?: string[]; slowestSlice?: string | null; totalErrors?: number };
      };
      const failing = health.summary?.failingSlices ?? [];
      const slowest = health.summary?.slowestSlice ?? "none";
      this.deps.log?.(
        `dashboard service health gen=${health.generation ?? "?"} slowest=${slowest} failing=${failing.length > 0 ? failing.join(",") : "none"} errors=${health.summary?.totalErrors ?? 0}`
      );
    } catch {
      // diagnostics are best-effort
    }
  }

  private async startServicePath(): Promise<void> {
    const dataSource = new ServiceDashboardDataSource({
      workspacePath: this.deps.workspacePath
    });
    this.serviceSync = new DashboardServiceStoreSync(dataSource, this.deps.store);
    await this.serviceSync.start();
    this.activePath = "service";
    this.deps.log?.("dashboard read path: warm service");
    await this.emitServiceHealthDiagnostics();
  }

  private async startCliPollingPath(): Promise<void> {
    this.deps.pollers.start();
    if (!this.pollersPaused) {
      this.deps.pollers.resume();
    }
    this.activePath = "cli-polling";
    this.deps.log?.("dashboard read path: CLI pollers");
  }

  private async startCliBootstrapPath(): Promise<void> {
    // Use the new command to fetch a batch of slices.
    const result = await this.deps.client.run("dashboard-bootstrap-slices", {});
    if (result.ok !== true || !result.data || typeof result.data !== "object") {
      this.deps.log?.(`dashboard-bootstrap-slices failed: ${result.message ?? result.code ?? "unknown"}`);
      // Fallback to regular CLI polling as a safety net.
      await this.startCliPollingPath();
      return;
    }
    const data = result.data as Record<string, unknown>;
    // Populate the store with each slice returned.
    for (const [sliceName, sliceValue] of Object.entries(data)) {
      const name = sliceName as DashboardSliceName;
      try {
        // @ts-ignore - using any for compatibility
        this.deps.store.updateSlice(name, sliceValue as any);
      } catch (e) {
        this.deps.log?.(`failed to update slice ${name} from bootstrap: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    // Mark the active path as CLI polling for UI consistency.
    this.activePath = "cli-polling";
    // Ensure pollers are running.
    this.deps.pollers.start();
    if (!this.pollersPaused) {
      this.deps.pollers.resume();
    }
  }

  private async stopActivePath(): Promise<void> {
    if (this.serviceSync) {
      await this.serviceSync.stop();
      this.serviceSync = undefined;
    }
    this.deps.pollers.stop();
  }

  private emitModeChanged(): void {
    this.deps.onModeChanged?.(this.getModeBadge());
  }
}
