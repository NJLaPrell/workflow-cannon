/**
 * In-memory warm snapshot for the dashboard read service (Option 2).
 * Wire shape: `DashboardServiceSnapshot` in `src/contracts/dashboard-snapshot.ts`.
 * Failed refreshes keep the last-good slice value (mirrors extension `DashboardDataStore`).
 */
import type {
  DashboardServiceSlicePayload,
  DashboardServiceSnapshot
} from "../../contracts/dashboard-snapshot.js";
import { DASHBOARD_SERVICE_SNAPSHOT_SCHEMA_VERSION } from "../../contracts/dashboard-snapshot.js";
import {
  DASHBOARD_SERVICE_SLICE_DEFINITIONS,
  type DashboardServiceSliceDefinition
} from "./slice-definitions.js";

export type DashboardSnapshotStoreListener = (event: {
  type: "slice.updated" | "snapshot.updated";
  slice?: string;
  changedSlices: string[];
  generation: number;
  updatedAt: string;
}) => void;

export class DashboardSnapshotStore {
  private generation = 0;
  private planningGeneration: number | null = null;
  private readonly slices = new Map<string, DashboardServiceSlicePayload>();
  private readonly listeners = new Set<DashboardSnapshotStoreListener>();
  private readonly startedAt = Date.now();

  constructor(
    private readonly serviceVersion: string,
    definitions: readonly DashboardServiceSliceDefinition[] = DASHBOARD_SERVICE_SLICE_DEFINITIONS
  ) {
    for (const def of definitions) {
      this.slices.set(def.name, {
        status: "empty",
        updatedAt: null,
        source: def.source,
        value: null
      });
    }
  }

  getUptimeMs(): number {
    return Date.now() - this.startedAt;
  }

  getGeneration(): number {
    return this.generation;
  }

  getPlanningGeneration(): number | null {
    return this.planningGeneration;
  }

  subscribe(listener: DashboardSnapshotStoreListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  markSliceLoading(name: string): void {
    const prev = this.slices.get(name);
    if (!prev) {
      return;
    }
    this.slices.set(name, { ...prev, status: "loading" });
  }

  applySliceSuccess(
    name: string,
    source: string,
    value: Record<string, unknown>,
    planningGeneration: number | null
  ): string[] {
    const now = new Date().toISOString();
    this.generation += 1;
    if (planningGeneration !== null) {
      this.planningGeneration = planningGeneration;
    }
    this.slices.set(name, {
      status: "fresh",
      updatedAt: now,
      source,
      value,
      planningGeneration: planningGeneration ?? undefined
    });
    this.emit("slice.updated", [name], now);
    return [name];
  }

  applySliceError(name: string, source: string, message: string): string[] {
    const prev = this.slices.get(name);
    if (!prev) {
      return [];
    }
    const now = new Date().toISOString();
    this.generation += 1;
    this.slices.set(name, {
      ...prev,
      status: "error",
      updatedAt: now,
      source,
      value: prev.value,
      error: message
    });
    this.emit("slice.updated", [name], now);
    return [name];
  }

  getSnapshot(): DashboardServiceSnapshot {
    const now = new Date().toISOString();
    const sliceRecord: Record<string, DashboardServiceSlicePayload> = {};
    for (const [name, payload] of this.slices.entries()) {
      sliceRecord[name] = payload;
    }
    return {
      schemaVersion: DASHBOARD_SERVICE_SNAPSHOT_SCHEMA_VERSION,
      serviceVersion: this.serviceVersion,
      generatedAt: now,
      generation: this.generation,
      planningGeneration: this.planningGeneration,
      slices: sliceRecord
    };
  }

  getSlice(name: string): DashboardServiceSlicePayload | undefined {
    return this.slices.get(name);
  }

  private emit(type: "slice.updated" | "snapshot.updated", changedSlices: string[], updatedAt: string): void {
    const payload = {
      type,
      changedSlices,
      generation: this.generation,
      updatedAt
    } as const;
    for (const listener of this.listeners) {
      listener(
        type === "slice.updated"
          ? { ...payload, type: "slice.updated", slice: changedSlices[0] }
          : { ...payload, type: "snapshot.updated" }
      );
    }
  }
}
