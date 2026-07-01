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
  private readonly pushSliceUpdatedAt = new Map<DashboardSliceName, number>();

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
    this.pushSliceUpdatedAt.clear();
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

  recordPushSliceUpdate(name: DashboardSliceName, now = Date.now()): void {
    this.pushSliceUpdatedAt.set(name, now);
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
        if (this.isSliceEligible(name)) {
          if (this.isPushSafetyNetFresh(name, intervalMs)) {
            continue;
          }
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
    const lastPushAt = this.pushSliceUpdatedAt.get(name);
    const sliceUpdatedAt = this.deps.store.getSlice(name).updatedAt ?? undefined;
    const lastUpdateAt = Math.max(lastPushAt ?? 0, sliceUpdatedAt ?? 0);
    if (lastUpdateAt <= 0) {
      return false;
    }
    const safetyNetMs = intervalMs * DASHBOARD_PUSH_SAFETY_NET_MULTIPLIER;
    return Date.now() - lastUpdateAt < safetyNetMs;
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
