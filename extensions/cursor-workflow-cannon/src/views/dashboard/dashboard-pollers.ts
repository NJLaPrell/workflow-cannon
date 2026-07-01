import type { CommandClient, KitRunResult } from "../../runtime/command-client.js";
import { isKitRefreshRunAborted } from "../../runtime/kit-refresh-run-commands.js";
import type { DashboardRefreshController } from "./dashboard-refresh-controller.js";
import type { DashboardDataStore } from "./dashboard-data-store.js";
import type { DashboardLoadTrace } from "./dashboard-load-trace.js";
import type { DashboardSectionId } from "./dashboard-section-registry.js";
import {
  DASHBOARD_POLL_GROUP_INTERVAL_MS,
  DASHBOARD_SLICE_REGISTRY,
  dashboardSliceNamesForPollGroup,
  lookupDashboardSlice,
  sliceNamesForMutation as registrySliceNamesForMutation,
  type DashboardPollGroupId
} from "./dashboard-slice-registry.js";
import type { DashboardMutationKind } from "./dashboard-section-invalidation.js";
import type { DashboardSliceName } from "./dashboard-snapshot-types.js";

export type DashboardPollerCadenceMode = "full" | "push-safety-net";

export const DASHBOARD_PUSH_SAFETY_NET_MULTIPLIER = 3;

/**
 * Number of consecutive service-refresh failures before a slice falls back to
 * a direct CLI read. Chosen conservatively (3) so the service gets multiple
 * chances before we spawn a subprocess — but not so high that stale data lingers.
 */
export const DASHBOARD_SERVICE_REFRESH_MAX_RETRIES = 3;

export type DashboardPollerCoordinatorDeps = {
  client: Pick<CommandClient, "run">;
  store: DashboardDataStore;
  refreshController: Pick<
    DashboardRefreshController,
    "currentGeneration" | "isSuppressed" | "isStale"
  >;
  isDeferred: () => boolean;
  isSliceVisible: (name: DashboardSliceName) => boolean;
  isRefreshPaused: () => boolean;
  log?: (msg: string) => void;
  trace?: DashboardLoadTrace;
};

/**
 * Targeted dashboard slice pollers (Option 1 — T100589).
 * Single-flight per slice; stale generation results are discarded.
 */
export class DashboardPollerCoordinator {
  private readonly intervals = new Map<DashboardPollGroupId, ReturnType<typeof setInterval>>();
  private readonly inFlight = new Map<DashboardSliceName, Promise<void>>();
  private visibleSectionIds = new Set<DashboardSectionId>();
  private paused = false;
  private running = false;
  private cadenceMode: DashboardPollerCadenceMode = "full";

  /**
   * Timestamp of the last *successful* push for each slice.
   * Error pushes (ok=false) do NOT update this map — only genuine data refreshes do.
   * `isPushSafetyNetFresh` uses this so an erroring slice doesn't appear "covered".
   */
  private readonly pushSliceSuccessAt = new Map<DashboardSliceName, number>();

  /**
   * Callback wired by the coordinator when the service path is active.
   * Lets the safety-net ticker request a targeted `POST /dashboard/refresh`
   * for a single stale slice instead of spawning a CLI process.
   */
  private requestServiceRefresh: ((name: DashboardSliceName) => Promise<void>) | undefined;

  /** Tracks in-flight targeted service-refresh requests (one per slice). */
  private readonly serviceRefreshInFlight = new Set<DashboardSliceName>();

  /** Consecutive service-refresh failures per slice (reset on success or CLI fallback). */
  private readonly serviceRefreshFailureCount = new Map<DashboardSliceName, number>();

  /**
   * Slices currently being kept fresh via the targeted service-refresh path.
   * Non-empty means we're in "push-driven but N slice(s) need service-retry" state.
   */
  private readonly serviceRetrySlices = new Set<DashboardSliceName>();

  constructor(private readonly deps: DashboardPollerCoordinatorDeps) {}

  start(): void {
    if (this.running) {
      return;
    }
    this.running = true;
    for (const group of Object.keys(DASHBOARD_POLL_GROUP_INTERVAL_MS) as DashboardPollGroupId[]) {
      this.startPollGroup(group);
    }
    this.deps.log?.("dashboard pollers started");
  }

  stop(): void {
    for (const handle of this.intervals.values()) {
      clearInterval(handle);
    }
    this.intervals.clear();
    this.running = false;
    this.deps.log?.("dashboard pollers stopped");
  }

  useFullCadence(): void {
    if (this.cadenceMode === "full") {
      return;
    }
    this.cadenceMode = "full";
    this.pushSliceSuccessAt.clear();
    this.serviceRefreshInFlight.clear();
    this.serviceRefreshFailureCount.clear();
    this.serviceRetrySlices.clear();
    this.requestServiceRefresh = undefined;
    this.deps.log?.("dashboard pollers cadence=full");
  }

  usePushSafetyNetCadence(): void {
    if (this.cadenceMode === "push-safety-net") {
      return;
    }
    this.cadenceMode = "push-safety-net";
    this.deps.log?.(
      `dashboard pollers cadence=push-safety-net multiplier=${DASHBOARD_PUSH_SAFETY_NET_MULTIPLIER}`
    );
  }

  getCadenceMode(): DashboardPollerCadenceMode {
    return this.cadenceMode;
  }

  /**
   * Register a callback the poller can use to request a targeted service-side
   * refresh for a single stale slice.  Call with `undefined` to remove it
   * (e.g. when switching back to CLI polling).
   */
  setRequestServiceRefresh(
    cb: ((name: DashboardSliceName) => Promise<void>) | undefined
  ): void {
    this.requestServiceRefresh = cb;
    if (!cb) {
      this.serviceRefreshInFlight.clear();
      this.serviceRefreshFailureCount.clear();
      this.serviceRetrySlices.clear();
    }
  }

  /**
   * Record an incoming push event for a slice.
   *
   * @param isSuccess - true (default) when the service successfully refreshed the slice.
   *   Pass false for error-push events (ok===false in the SSE payload).
   *   Only successful pushes reset the freshness clock and exit the retry set.
   */
  recordPushSliceUpdate(
    name: DashboardSliceName,
    now = Date.now(),
    isSuccess = true
  ): void {
    if (isSuccess) {
      this.pushSliceSuccessAt.set(name, now);
      // Slice recovered — remove from retry tracking.
      this.serviceRetrySlices.delete(name);
      this.serviceRefreshFailureCount.delete(name);
    }
    // Error pushes are intentionally ignored for freshness purposes:
    // a stale/erroring slice must not appear "covered" by recent push activity.
  }

  /** Number of slices currently being kept live via the service-refresh retry path. */
  getServiceRetrySliceCount(): number {
    return this.serviceRetrySlices.size;
  }

  /** Hold interval ticks during mutation / drawer critical sections. */
  pause(): void {
    this.paused = true;
  }

  resume(): void {
    this.paused = false;
  }

  async refreshCriticalNow(): Promise<void> {
    await Promise.all(
      dashboardSliceNamesForPollGroup("critical").map((name) =>
        this.fetchSlice(name, { force: true, source: "read-path prefetch" })
      )
    );
  }

  async refreshSlicesNow(names: readonly DashboardSliceName[]): Promise<void> {
    await Promise.all(
      names.map((name) => this.fetchSlice(name, { force: true, source: "read-path refresh" }))
    );
  }

  setVisibleSections(sections: readonly DashboardSectionId[]): void {
    this.visibleSectionIds = new Set(sections);
    for (const desc of DASHBOARD_SLICE_REGISTRY) {
      if (desc.visibleOnly && this.isSliceEligible(desc.name)) {
        void this.fetchSlice(desc.name, { source: "read-path visible-section prefetch" });
      }
    }
  }

  private startPollGroup(group: DashboardPollGroupId): void {
    const intervalMs = DASHBOARD_POLL_GROUP_INTERVAL_MS[group];
    const tick = (): void => {
      if (!this.running || this.paused) {
        return;
      }
      for (const name of dashboardSliceNamesForPollGroup(group)) {
        if (!this.isSliceEligible(name)) {
          continue;
        }
        if (this.isPushSafetyNetFresh(name, intervalMs)) {
          continue;
        }
        if (this.cadenceMode === "push-safety-net" && this.requestServiceRefresh) {
          // Primary degraded path: ask the warm service to refresh just this slice.
          // CLI polling is only used as a final resort after repeated service failures.
          void this.tryServiceRefresh(name);
        } else {
          const source =
            this.cadenceMode === "push-safety-net"
              ? "poller safety-net refresh"
              : "poller refresh";
          void this.fetchSlice(name, { source });
        }
      }
    };
    const handle = setInterval(tick, intervalMs);
    this.intervals.set(group, handle);
  }

  /**
   * Attempts a targeted service-side refresh for a stale slice.
   * Falls back to a direct CLI read only after DASHBOARD_SERVICE_REFRESH_MAX_RETRIES
   * consecutive failures — keeping all refresh traffic on the warm path whenever
   * the service is able to serve it.
   */
  private async tryServiceRefresh(name: DashboardSliceName): Promise<void> {
    if (this.serviceRefreshInFlight.has(name) || !this.requestServiceRefresh) {
      return;
    }
    this.serviceRefreshInFlight.add(name);
    this.serviceRetrySlices.add(name);
    try {
      await this.requestServiceRefresh(name);
      // Success: the SSE push will arrive shortly with ok=true and reset pushSliceSuccessAt.
      this.serviceRefreshFailureCount.delete(name);
    } catch (error) {
      const failures = (this.serviceRefreshFailureCount.get(name) ?? 0) + 1;
      this.serviceRefreshFailureCount.set(name, failures);
      this.deps.log?.(
        `service refresh failed (${failures}/${DASHBOARD_SERVICE_REFRESH_MAX_RETRIES}) slice=${name}: ${error instanceof Error ? error.message : String(error)}`
      );
      if (failures >= DASHBOARD_SERVICE_REFRESH_MAX_RETRIES) {
        // Service persistently unable to refresh this slice — fall back to CLI.
        this.deps.log?.(
          `slice=${name} service refresh exhausted, falling back to CLI read`
        );
        this.serviceRefreshFailureCount.delete(name);
        this.serviceRetrySlices.delete(name);
        void this.fetchSlice(name, { source: "poller CLI fallback after service-refresh failure" });
      }
    } finally {
      this.serviceRefreshInFlight.delete(name);
    }
  }

  private isSliceEligible(name: DashboardSliceName): boolean {
    const desc = lookupDashboardSlice(name);
    if (this.deps.isDeferred() || this.deps.isRefreshPaused()) {
      return false;
    }
    if (this.deps.refreshController.isSuppressed()) {
      return false;
    }
    if (desc.visibleOnly) {
      if (!this.deps.isSliceVisible(name) && !this.isSectionVisible(desc.sectionId)) {
        return false;
      }
    }
    if (name === "status" && !this.deps.isSliceVisible("status") && !this.isSectionVisible("status")) {
      return false;
    }
    return true;
  }

  private isPushSafetyNetFresh(name: DashboardSliceName, intervalMs: number): boolean {
    if (this.cadenceMode !== "push-safety-net") {
      return false;
    }
    // Only *successful* push timestamps count as proof of coverage.
    // Error pushes intentionally do NOT update pushSliceSuccessAt so that
    // a repeatedly-failing service slice still triggers the safety-net path.
    const lastSuccessPushAt = this.pushSliceSuccessAt.get(name);
    // Also consider the store's own updatedAt — which is only set on successful
    // store.updateSlice() calls, never on markError() — so this is safe to include.
    const sliceUpdatedAt = this.deps.store.getSlice(name).updatedAt ?? undefined;
    const lastSuccessAt = Math.max(lastSuccessPushAt ?? 0, sliceUpdatedAt ?? 0);
    if (lastSuccessAt <= 0) {
      return false;
    }
    const safetyNetMs = intervalMs * DASHBOARD_PUSH_SAFETY_NET_MULTIPLIER;
    return Date.now() - lastSuccessAt < safetyNetMs;
  }

  private isSectionVisible(sectionId: DashboardSectionId): boolean {
    return this.visibleSectionIds.has(sectionId);
  }

  private fetchSlice(
    name: DashboardSliceName,
    options?: { force?: boolean; source?: string }
  ): Promise<void> {
    const existing = this.inFlight.get(name);
    if (existing) {
      return existing;
    }
    if (!options?.force && !this.isSliceEligible(name)) {
      return Promise.resolve();
    }
    const generation = this.deps.refreshController.currentGeneration();
    const work = this.runSliceFetch(name, generation, options?.source ?? "poller refresh");
    this.inFlight.set(name, work);
    return work.finally(() => {
      if (this.inFlight.get(name) === work) {
        this.inFlight.delete(name);
      }
    });
  }

  private async runSliceFetch(
    name: DashboardSliceName,
    generation: number,
    source: string
  ): Promise<void> {
    if (this.paused || this.deps.refreshController.isSuppressed()) {
      return;
    }
    if (this.deps.isDeferred() || this.deps.isRefreshPaused()) {
      return;
    }

    const desc = lookupDashboardSlice(name);
    this.deps.store.markLoading(name);
    this.deps.trace?.recordSliceFetch(name);
    this.deps.log?.(`poll fetch slice=${name} gen=${generation} source=${source}`);

    try {
      if (desc.command === "dashboard-summary") {
        this.deps.log?.(
          `dashboard-summary source=${source} slice=${name} projection=${String(desc.args.projection ?? "full")}`
        );
      }
      const raw = (await this.deps.client.run(desc.command, {
        ...desc.args
      })) as KitRunResult;

      if (isKitRefreshRunAborted(raw)) {
        this.deps.log?.(`poll aborted slice=${name} (refresh paused)`);
        return;
      }

      if (this.deps.refreshController.isStale(generation)) {
        this.deps.trace?.recordSliceDiscard(name, `gen=${generation}`);
        this.deps.log?.(`poll discard stale slice=${name} gen=${generation}`);
        return;
      }

      if (raw.ok !== true || !raw.data || typeof raw.data !== "object") {
        const message =
          typeof raw.message === "string"
            ? raw.message
            : typeof raw.code === "string"
              ? raw.code
              : `${desc.command} failed`;
        this.deps.store.markError(name, message);
        return;
      }

      const data = raw.data as Record<string, unknown>;
      const payload = desc.extractPayload(data);
      const planningGeneration =
        typeof data.planningGeneration === "number" ? data.planningGeneration : undefined;
      this.deps.store.updateSlice(name, payload, { planningGeneration });
      this.deps.trace?.recordSliceComplete(name);
    } catch (error) {
      if (this.deps.refreshController.isStale(generation)) {
        this.deps.trace?.recordSliceDiscard(name, `gen=${generation}`);
        return;
      }
      const message = error instanceof Error ? error.message : String(error);
      this.deps.store.markError(name, message);
    }
  }
}

export function sliceNamesForMutation(kind: DashboardMutationKind): DashboardSliceName[] {
  return registrySliceNamesForMutation(kind);
}
