import type { DashboardServiceEvent } from "@workflow-cannon/workspace-kit/contracts/dashboard-events";
import type * as vscode from "vscode";
import type { DashboardDataSource } from "./dashboard-data-source.js";
import type { DashboardDataStore } from "./dashboard-data-store.js";
import { mapServiceSliceRecordToStoreUpdate } from "./dashboard-service-mapper.js";
import type { DashboardSliceName } from "./dashboard-snapshot-types.js";
import type { DashboardServiceRuntimeV1 } from "./dashboard-service-mapper.js";

type ServiceDataSource = DashboardDataSource & {
  getRuntime(): DashboardServiceRuntimeV1 | null;
};

/** Applies warm service snapshots/events into {@link DashboardDataStore}. */
export class DashboardServiceStoreSync {
  private disposables: vscode.Disposable[] = [];
  private running = false;

  constructor(
    private readonly dataSource: ServiceDataSource,
    private readonly store: DashboardDataStore
  ) {}

  async start(): Promise<void> {
    if (this.running) {
      return;
    }
    this.running = true;
    await this.dataSource.start();
    if (this.dataSource.subscribe) {
      const sub = this.dataSource.subscribe((event) => {
        void this.handleServiceEvent(event);
      });
      this.disposables.push(sub);
    }
    await this.ingestFullSnapshot();
  }

  async stop(): Promise<void> {
    this.running = false;
    for (const d of this.disposables) {
      d.dispose();
    }
    this.disposables = [];
    await this.dataSource.stop();
  }

  async refreshSlice(name: DashboardSliceName): Promise<void> {
    await this.dataSource.refreshSlice(name);
    await this.ingestSlice(name);
  }

  private async handleServiceEvent(event: DashboardServiceEvent): Promise<void> {
    if (!this.running) {
      return;
    }
    if (event.type === "dashboard.service.error") {
      return;
    }
    if (event.type === "dashboard.slice.updated") {
      const name = event.slice as DashboardSliceName;
      await this.ingestSlice(name);
      return;
    }
    if (event.type === "dashboard.snapshot.updated") {
      await this.ingestFullSnapshot();
    }
  }

  private async ingestFullSnapshot(): Promise<void> {
    const snapshot = await this.dataSource.getSnapshot();
    for (const name of Object.keys(snapshot.slices) as DashboardSliceName[]) {
      const slice = snapshot.slices[name];
      if (slice.status === "fresh" && slice.value) {
        this.store.updateSlice(name, slice.value, {
          source: slice.source,
          sourceArgs: slice.sourceArgs,
          planningGeneration: slice.planningGeneration
        });
      } else if (slice.status === "error") {
        this.store.markError(name, slice.error ?? "service slice error");
      }
    }
  }

  private async ingestSlice(name: DashboardSliceName): Promise<void> {
    const runtime = this.dataSource.getRuntime();
    if (!runtime) {
      return;
    }
    const base = `http://${runtime.host}:${runtime.port}`;
    const res = await fetch(`${base}/dashboard/slices/${encodeURIComponent(name)}`);
    if (!res.ok) {
      this.store.markError(name, `service slice fetch failed (${res.status})`);
      return;
    }
    const body = (await res.json()) as Record<string, unknown>;
    const mapped = mapServiceSliceRecordToStoreUpdate(name, body);
    if (mapped.status === "error") {
      this.store.markError(name, mapped.error ?? "service slice error");
      return;
    }
    if (mapped.value) {
      this.store.updateSlice(name, mapped.value, {
        source: mapped.source,
        planningGeneration: mapped.planningGeneration
      });
    }
  }
}
