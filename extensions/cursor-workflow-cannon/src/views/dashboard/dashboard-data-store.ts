import {
  DASHBOARD_SLICE_REGISTRY,
  lookupDashboardSlice
} from "./dashboard-slice-registry.js";
import type {
  DashboardSlice,
  DashboardSliceName,
  DashboardSliceUpdate,
  DashboardSnapshot,
  DashboardSliceValue
} from "./dashboard-snapshot-types.js";

export type DashboardSliceUpdateMeta = {
  source?: string;
  sourceArgs?: Record<string, unknown>;
  planningGeneration?: number | null;
};

export type DashboardDataStoreListener = (
  update: DashboardSliceUpdate,
  snapshot: DashboardSnapshot
) => void;

function sliceValuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) {
    return true;
  }
  if (a == null || b == null) {
    return false;
  }
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

function ingestPlanningGeneration(
  storePlanningGeneration: number | null,
  value: DashboardSliceValue | null,
  meta?: DashboardSliceUpdateMeta
): number | null {
  if (meta?.planningGeneration != null && Number.isFinite(meta.planningGeneration)) {
    return meta.planningGeneration;
  }
  const fromValue = value?.planningGeneration;
  if (typeof fromValue === "number" && Number.isFinite(fromValue)) {
    return fromValue;
  }
  return storePlanningGeneration;
}

function emptySlice(name: DashboardSliceName): DashboardSlice {
  const descriptor = lookupDashboardSlice(name);
  return {
    name,
    value: null,
    status: "empty",
    updatedAt: null,
    startedAt: null,
    source: descriptor.command,
    sourceArgs: { ...descriptor.args },
    planningGeneration: null,
    error: null
  };
}

function createInitialSnapshot(now = Date.now()): DashboardSnapshot {
  const slices = {} as Record<DashboardSliceName, DashboardSlice>;
  for (const descriptor of DASHBOARD_SLICE_REGISTRY) {
    slices[descriptor.name] = emptySlice(descriptor.name);
  }
  return {
    schemaVersion: 1,
    generation: 0,
    createdAt: now,
    updatedAt: now,
    planningGeneration: null,
    slices
  };
}

/** In-memory dashboard slice store — emits updates only when value or status changes. */
export class DashboardDataStore {
  private snapshot: DashboardSnapshot;
  private readonly listeners = new Set<DashboardDataStoreListener>();
  private disposed = false;

  constructor(initialSnapshot?: DashboardSnapshot) {
    this.snapshot = initialSnapshot ?? createInitialSnapshot();
  }

  start(): void {
    if (this.disposed) {
      return;
    }
    this.snapshot = {
      ...this.snapshot,
      generation: this.snapshot.generation + 1,
      updatedAt: Date.now()
    };
  }

  dispose(): void {
    this.disposed = true;
    this.listeners.clear();
  }

  subscribe(listener: DashboardDataStoreListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getSnapshot(): DashboardSnapshot {
    const slices = {} as Record<DashboardSliceName, DashboardSlice>;
    for (const descriptor of DASHBOARD_SLICE_REGISTRY) {
      slices[descriptor.name] = this.getSlice(descriptor.name);
    }
    return {
      ...this.snapshot,
      slices
    };
  }

  getSlice<T = DashboardSliceValue>(name: DashboardSliceName): DashboardSlice<T> {
    return (this.snapshot.slices[name] ?? emptySlice(name)) as DashboardSlice<T>;
  }

  markLoading(name: DashboardSliceName, source?: string, args?: Record<string, unknown>): void {
    const descriptor = lookupDashboardSlice(name);
    const previous = this.getSlice(name);
    const next: DashboardSlice = {
      ...previous,
      status: "loading",
      startedAt: Date.now(),
      source: source ?? descriptor.command,
      sourceArgs: args ?? previous.sourceArgs ?? { ...descriptor.args },
      error: null
    };
    this.commitSliceUpdate(name, previous, next);
  }

  markStale(name: DashboardSliceName, reason?: string): void {
    const previous = this.getSlice(name);
    const next: DashboardSlice = {
      ...previous,
      status: "stale",
      error: reason ?? previous.error ?? null
    };
    this.commitSliceUpdate(name, previous, next);
  }

  /** Keep last-good value on error. */
  markError(name: DashboardSliceName, error: unknown): void {
    const previous = this.getSlice(name);
    const message = error instanceof Error ? error.message : String(error);
    const next: DashboardSlice = {
      ...previous,
      status: "error",
      error: message,
      value: previous.value
    };
    this.commitSliceUpdate(name, previous, next);
  }

  updateSlice(
    name: DashboardSliceName,
    value: DashboardSliceValue,
    meta?: DashboardSliceUpdateMeta
  ): void {
    const previous = this.getSlice(name);
    const now = Date.now();
    const planningGeneration = ingestPlanningGeneration(
      this.snapshot.planningGeneration,
      value,
      meta
    );
    const next: DashboardSlice = {
      ...previous,
      value,
      status: "fresh",
      updatedAt: now,
      startedAt: null,
      source: meta?.source ?? previous.source,
      sourceArgs: meta?.sourceArgs ?? previous.sourceArgs,
      planningGeneration:
        meta?.planningGeneration ??
        (typeof value.planningGeneration === "number" ? value.planningGeneration : previous.planningGeneration) ??
        null,
      error: null
    };

    this.snapshot = {
      ...this.snapshot,
      planningGeneration,
      updatedAt: now
    };
    this.commitSliceUpdate(name, previous, next);
  }

  isFresh(name: DashboardSliceName, maxAgeMs?: number, now = Date.now()): boolean {
    const slice = this.getSlice(name);
    if (slice.status !== "fresh" || slice.updatedAt == null) {
      return false;
    }
    const ttl = maxAgeMs ?? lookupDashboardSlice(name).freshnessSlaMs;
    if (ttl == null) {
      return true;
    }
    return now - slice.updatedAt <= ttl;
  }

  staleSlices(now = Date.now()): DashboardSliceName[] {
    return DASHBOARD_SLICE_REGISTRY.filter((descriptor) => !this.isFresh(descriptor.name, undefined, now)).map(
      (descriptor) => descriptor.name
    );
  }

  private commitSliceUpdate(
    name: DashboardSliceName,
    previous: DashboardSlice,
    next: DashboardSlice
  ): void {
    if (this.disposed) {
      return;
    }
    const valueChanged = !sliceValuesEqual(previous.value, next.value);
    const statusChanged = previous.status !== next.status;
    if (!valueChanged && !statusChanged) {
      return;
    }

    const update: DashboardSliceUpdate = {
      name,
      previous,
      next,
      changed: true
    };
    this.snapshot = {
      ...this.snapshot,
      updatedAt: Date.now(),
      slices: {
        ...this.snapshot.slices,
        [name]: next
      }
    };

    for (const listener of this.listeners) {
      listener(update, this.getSnapshot());
    }
  }
}
