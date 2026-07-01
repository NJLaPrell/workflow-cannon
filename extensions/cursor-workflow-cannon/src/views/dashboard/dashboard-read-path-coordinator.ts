import type { CommandClient } from "../../runtime/command-client.js";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { DashboardServiceEvent } from "@workflow-cannon/workspace-kit/contracts/dashboard-events";
import type { DashboardDataSourceMode } from "./dashboard-data-source.js";
import type { DashboardDataStore } from "./dashboard-data-store.js";
import {
  DASHBOARD_PUSH_SAFETY_NET_MULTIPLIER,
  type DashboardPollerCoordinator
} from "./dashboard-pollers.js";
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
import { DASHBOARD_SLICE_REGISTRY } from "./dashboard-slice-registry.js";

const DASHBOARD_SERVICE_HEALTH_MONITOR_INTERVAL_MS = 3_000;

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
 * Service mode is push-driven; CLI pollers stay alive only as a stale safety net.
 */
export class DashboardReadPathCoordinator {
  private configuredMode: DashboardDataSourceMode = "auto";
  private sessionOverride: "cli-polling" | null = null;
  private activePath: DashboardActiveReadPath | null = null;
  private serviceFailDetail: string | undefined;
  private serviceSync: DashboardServiceStoreSync | undefined;
  private serviceEventSubscription: { dispose(): void } | undefined;
  private serviceHealthInterval: ReturnType<typeof setInterval> | undefined;
  private serviceHealthCheckInFlight = false;
  private serviceHealthMonitorGeneration = 0;
  private pollersPaused = false;
  private serviceStartAttempted = false;
  private running = false;

  constructor(private readonly deps: DashboardReadPathCoordinatorDeps) {}

  getModeBadge(): DashboardReadModeBadge {
    const configured = this.sessionOverride ?? this.configuredMode;
    return {
      configured,
      active: this.activePath ?? "cli-polling",
      pollingCadence: this.activePath === "service" ? "push-safety-net" : "full",
      serviceRetrySliceCount:
        this.activePath === "service"
          ? (this.deps.pollers.getServiceRetrySliceCount?.() ?? 0)
          : undefined,
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
    if (this.activePath) {
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
        await this.restartDashboardService();
        return;
      } else {
        this.serviceFailDetail = "Dashboard service unavailable — using CLI polling";
      }
    }

    // Fallback: use CLI bootstrap command to fetch multiple cheap slices in one request.
    await this.startCliBootstrapPath();
    this.emitModeChanged();
  }

  private async emitServiceHealthDiagnostics(): Promise<void> {
    const health = await this.fetchServiceHealthDetail() as (Record<string, unknown> | null);
    if (!health) {
      return;
    }
    const summary = health.summary as { failingSlices?: string[]; slowestSlice?: string | null; totalErrors?: number } | undefined;
    const failing = summary?.failingSlices ?? [];
    const slowest = summary?.slowestSlice ?? "none";
    this.deps.log?.(
      `dashboard service health gen=${(health.generation as number | undefined) ?? "?"} slowest=${slowest} failing=${failing.length > 0 ? failing.join(",") : "none"} errors=${summary?.totalErrors ?? 0}`
    );
  }

  private async startServicePath(): Promise<void> {
    const dataSource = new ServiceDashboardDataSource({
      workspacePath: this.deps.workspacePath
    });
    this.serviceSync = new DashboardServiceStoreSync(dataSource, this.deps.store);
    this.serviceEventSubscription = dataSource.subscribe?.((event) => {
      this.recordServicePushEvent(event);
    });
    try {
      await this.serviceSync.start();
    } catch (error) {
      this.serviceEventSubscription?.dispose();
      this.serviceEventSubscription = undefined;
      throw error;
    }
    this.activePath = "service";
    this.deps.pollers.usePushSafetyNetCadence();
    // Wire the targeted-refresh callback so the poller can request a service-side
    // refresh for a stale slice without spawning a CLI subprocess.
    const syncRef = this.serviceSync;
    this.deps.pollers.setRequestServiceRefresh?.(
      (name) => syncRef!.refreshSlice(name)
    );
    this.deps.pollers.start();
    if (!this.pollersPaused) {
      this.deps.pollers.resume();
    }
    this.startServiceHealthMonitor();
    this.deps.log?.(
      `dashboard read path: push-driven warm service (CLI fallback=${DASHBOARD_PUSH_SAFETY_NET_MULTIPLIER}x interval, service-refresh-retry before CLI)`
    );
    await this.emitServiceHealthDiagnostics();
  }

  private async startCliPollingPath(): Promise<void> {
    this.stopServiceHealthMonitor();
    this.deps.pollers.useFullCadence();
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
    this.deps.pollers.useFullCadence();
    this.deps.pollers.start();
    if (!this.pollersPaused) {
      this.deps.pollers.resume();
    }
  }

  private async stopActivePath(): Promise<void> {
    this.stopServiceHealthMonitor();
    this.serviceEventSubscription?.dispose();
    this.serviceEventSubscription = undefined;
    if (this.serviceSync) {
      await this.serviceSync.stop();
      this.serviceSync = undefined;
    }
    // Remove the service-refresh callback before stopping pollers — useFullCadence()
    // also clears it, but being explicit here is defensive.
    this.deps.pollers.setRequestServiceRefresh?.(undefined);
    this.deps.pollers.stop();
    this.deps.pollers.useFullCadence();
  }

  private recordServicePushEvent(event: DashboardServiceEvent): void {
    if (event.type === "dashboard.slice.updated") {
      // ok===false means the service-side builder threw; treat as error push —
      // do NOT reset the success freshness clock for this slice.
      const isSuccess = event.ok !== false;
      this.deps.pollers.recordPushSliceUpdate(
        event.slice as DashboardSliceName,
        undefined,
        isSuccess
      );
      return;
    }
    if (event.type === "dashboard.snapshot.updated") {
      // Snapshot events don't carry per-slice ok status; conservatively treat as success.
      const names =
        event.changedSlices.length > 0
          ? event.changedSlices
          : DASHBOARD_SLICE_REGISTRY.map((desc) => desc.name);
      for (const name of names) {
        this.deps.pollers.recordPushSliceUpdate(name as DashboardSliceName, undefined, true);
      }
      return;
    }
    if (event.type === "task-sync.status.changed") {
      this.deps.pollers.recordPushSliceUpdate("status", undefined, true);
    }
  }

  private startServiceHealthMonitor(): void {
    this.stopServiceHealthMonitor();
    const generation = ++this.serviceHealthMonitorGeneration;
    this.serviceHealthInterval = setInterval(() => {
      void this.checkServiceHealth(generation);
    }, DASHBOARD_SERVICE_HEALTH_MONITOR_INTERVAL_MS);
  }

  private stopServiceHealthMonitor(): void {
    this.serviceHealthMonitorGeneration += 1;
    if (this.serviceHealthInterval) {
      clearInterval(this.serviceHealthInterval);
      this.serviceHealthInterval = undefined;
    }
    this.serviceHealthCheckInFlight = false;
  }

  private async checkServiceHealth(generation: number): Promise<void> {
    if (
      generation !== this.serviceHealthMonitorGeneration ||
      this.activePath !== "service" ||
      this.serviceHealthCheckInFlight
    ) {
      return;
    }
    this.serviceHealthCheckInFlight = true;
    try {
      const health = await this.fetchServiceHealthDetail();
      if (
        generation !== this.serviceHealthMonitorGeneration ||
        this.activePath !== "service"
      ) {
        return;
      }

      if (!health || health.ok !== true) {
        // Service is unreachable or returning a non-ok health response — fall back entirely.
        await this.switchServiceFailureToCliPolling(
          "Dashboard service became unhealthy — using CLI polling"
        );
        return;
      }

      // Service is overall healthy. Check per-slice failing slices and proactively
      // request targeted refreshes so they can recover on the service path rather
      // than waiting for the safety-net poller to notice them as stale.
      const failingSlices: string[] = health.summary?.failingSlices ?? [];
      if (failingSlices.length > 0 && this.serviceSync) {
        const syncRef = this.serviceSync;
        this.deps.log?.(
          `health monitor: proactive service refresh for ${failingSlices.length} failing slice(s): ${failingSlices.join(", ")}`
        );
        for (const name of failingSlices) {
          void syncRef.refreshSlice(name as DashboardSliceName).catch((err) => {
            this.deps.log?.(
              `health-monitor targeted refresh failed slice=${name}: ${err instanceof Error ? err.message : String(err)}`
            );
          });
        }
      }
      // Emit badge update so UI reflects current service-retry slice count.
      this.emitModeChanged();
    } finally {
      this.serviceHealthCheckInFlight = false;
    }
  }

  /**
   * Fetches the full /health payload from the running service.
   * Returns null on any error (network, parse, missing runtime, etc.).
   */
  private async fetchServiceHealthDetail(): Promise<{
    ok?: boolean;
    summary?: { failingSlices?: string[]; slowestSlice?: string | null; totalErrors?: number };
  } | null> {
    try {
      const abs = path.join(this.deps.workspacePath, DASHBOARD_SERVICE_RUNTIME_REL);
      const raw = JSON.parse(await readFile(abs, "utf8")) as unknown;
      const runtime = parseDashboardServiceRuntime(raw);
      if (!runtime) {
        return null;
      }
      const res = await fetch(`http://${runtime.host}:${runtime.port}/health`);
      if (!res.ok) {
        return { ok: false };
      }
      return (await res.json()) as {
        ok?: boolean;
        summary?: { failingSlices?: string[]; slowestSlice?: string | null; totalErrors?: number };
      };
    } catch {
      return null;
    }
  }

  private async switchServiceFailureToCliPolling(detail: string): Promise<void> {
    this.serviceFailDetail = detail;
    this.deps.log?.(`dashboard read path: ${detail}`);
    this.stopServiceHealthMonitor();
    this.serviceEventSubscription?.dispose();
    this.serviceEventSubscription = undefined;
    if (this.serviceSync) {
      await this.serviceSync.stop();
      this.serviceSync = undefined;
    }
    await this.startCliPollingPath();
    this.emitModeChanged();
  }

  private emitModeChanged(): void {
    this.deps.onModeChanged?.(this.getModeBadge());
  }
}
