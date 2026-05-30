export type DashboardSliceObservabilityRecord = {
  status: "empty" | "loading" | "fresh" | "error";
  lastRefreshAt: string | null;
  lastDurationMs: number | null;
  avgDurationMs: number | null;
  refreshCount: number;
  errorCount: number;
  lastError: string | null;
  source: string | null;
};

export type DashboardSliceObservabilitySummary = {
  failingSlices: string[];
  slowestSlice: string | null;
  slowestDurationMs: number | null;
  totalRefreshes: number;
  totalErrors: number;
};

function emptyRecord(source: string | null = null): DashboardSliceObservabilityRecord {
  return {
    status: "empty",
    lastRefreshAt: null,
    lastDurationMs: null,
    avgDurationMs: null,
    refreshCount: 0,
    errorCount: 0,
    lastError: null,
    source
  };
}

/** Per-slice refresh timing + error counters for `/health` observability (T100600). */
export class DashboardSliceObservabilityTracker {
  private readonly records = new Map<string, DashboardSliceObservabilityRecord>();
  private readonly inFlightStarted = new Map<string, number>();

  markLoading(name: string, source: string): void {
    const rec = this.records.get(name) ?? emptyRecord(source);
    rec.status = "loading";
    rec.source = source;
    this.records.set(name, rec);
    this.inFlightStarted.set(name, Date.now());
  }

  markSuccess(name: string, source: string): void {
    const rec = this.records.get(name) ?? emptyRecord(source);
    const started = this.inFlightStarted.get(name);
    const duration = typeof started === "number" ? Math.max(0, Date.now() - started) : null;
    if (duration !== null) {
      rec.lastDurationMs = duration;
      rec.avgDurationMs =
        rec.avgDurationMs === null
          ? duration
          : Math.round(rec.avgDurationMs * 0.7 + duration * 0.3);
    }
    rec.refreshCount += 1;
    rec.status = "fresh";
    rec.lastError = null;
    rec.lastRefreshAt = new Date().toISOString();
    rec.source = source;
    this.records.set(name, rec);
    this.inFlightStarted.delete(name);
  }

  markError(name: string, source: string, message: string): void {
    const rec = this.records.get(name) ?? emptyRecord(source);
    const started = this.inFlightStarted.get(name);
    const duration = typeof started === "number" ? Math.max(0, Date.now() - started) : null;
    if (duration !== null) {
      rec.lastDurationMs = duration;
    }
    rec.errorCount += 1;
    rec.lastError = message;
    rec.status = "error";
    rec.lastRefreshAt = new Date().toISOString();
    rec.source = source;
    this.records.set(name, rec);
    this.inFlightStarted.delete(name);
  }

  getSliceRecords(): Record<string, DashboardSliceObservabilityRecord> {
    const out: Record<string, DashboardSliceObservabilityRecord> = {};
    for (const [name, rec] of this.records.entries()) {
      out[name] = { ...rec };
    }
    return out;
  }

  summarize(): DashboardSliceObservabilitySummary {
    let slowestSlice: string | null = null;
    let slowestDurationMs: number | null = null;
    let totalRefreshes = 0;
    let totalErrors = 0;
    const failingSlices: string[] = [];

    for (const [name, rec] of this.records.entries()) {
      totalRefreshes += rec.refreshCount;
      totalErrors += rec.errorCount;
      if (rec.status === "error" || rec.lastError) {
        failingSlices.push(name);
      }
      if (rec.lastDurationMs !== null) {
        if (slowestDurationMs === null || rec.lastDurationMs > slowestDurationMs) {
          slowestDurationMs = rec.lastDurationMs;
          slowestSlice = name;
        }
      }
    }

    return {
      failingSlices,
      slowestSlice,
      slowestDurationMs,
      totalRefreshes,
      totalErrors
    };
  }
}

export function buildDashboardServiceHealthPayload(args: {
  uptimeMs: number;
  generation: number;
  planningGeneration: number | null;
  sseClients: number;
  sliceCount: number;
  sliceObservability: Record<string, DashboardSliceObservabilityRecord>;
  summary: DashboardSliceObservabilitySummary;
}): Record<string, unknown> {
  return {
    ok: true,
    uptimeMs: args.uptimeMs,
    generation: args.generation,
    planningGeneration: args.planningGeneration,
    sseClients: args.sseClients,
    sliceCount: args.sliceCount,
    slices: args.sliceObservability,
    summary: args.summary
  };
}
