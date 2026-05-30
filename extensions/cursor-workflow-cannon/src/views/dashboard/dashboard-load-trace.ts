import { isWcTraceVerbose } from "../../runtime/workflow-cannon-log.js";
import type { DashboardSliceName } from "./dashboard-snapshot-types.js";

export type DashboardSliceTraceRecord = {
  slice: DashboardSliceName;
  phase: "start" | "complete" | "discard";
  at: number;
  source?: string;
  sourceArgs?: Record<string, unknown>;
  durationMs?: number;
  ok?: boolean;
  error?: string;
  detail?: string;
};

const moduleRecords: DashboardSliceTraceRecord[] = [];

/** True when verbose dashboard trace is enabled (`WORKSPACE_KIT_DEBUG_DASHBOARD=1`). */
export function isDashboardLoadTraceEnabled(): boolean {
  return isWcTraceVerbose();
}

export function recordSliceFetch(
  slice: DashboardSliceName,
  source?: string,
  sourceArgs?: Record<string, unknown>
): void {
  if (!isDashboardLoadTraceEnabled()) {
    return;
  }
  moduleRecords.push({
    slice,
    phase: "start",
    at: Date.now(),
    source,
    sourceArgs
  });
}

export function recordSliceComplete(
  slice: DashboardSliceName,
  source?: string,
  startedAt?: number,
  result?: { ok: boolean; error?: string }
): void {
  if (!isDashboardLoadTraceEnabled()) {
    return;
  }
  moduleRecords.push({
    slice,
    phase: "complete",
    at: Date.now(),
    source,
    durationMs: startedAt != null ? Date.now() - startedAt : undefined,
    ok: result?.ok ?? true,
    error: result?.error
  });
}

export function formatTraceLine(record: DashboardSliceTraceRecord): string {
  if (record.phase === "start") {
    const args =
      record.sourceArgs && Object.keys(record.sourceArgs).length > 0
        ? ` args=${JSON.stringify(record.sourceArgs)}`
        : "";
    return `slice=${record.slice} fetch start source=${record.source ?? "unknown"}${args}`;
  }
  if (record.phase === "discard") {
    return `slice=${record.slice} discard${record.detail ? ` (${record.detail})` : ""}`;
  }
  const status = record.ok === false ? "error" : "ok";
  const err = record.error ? ` err=${record.error}` : "";
  return `slice=${record.slice} fetch ${status} source=${record.source ?? "unknown"} ms=${String(record.durationMs ?? 0)}${err}`;
}

export function getDashboardLoadTraceRecords(): readonly DashboardSliceTraceRecord[] {
  return moduleRecords;
}

export function clearDashboardLoadTrace(): void {
  moduleRecords.length = 0;
}

type TraceEvent = {
  at: number;
  kind: "fetch" | "complete" | "discard";
  slice: DashboardSliceName;
  detail?: string;
};

/** Optional slice fetch trace for poller coordinator (`WORKSPACE_KIT_DEBUG_DASHBOARD=1`). */
export class DashboardLoadTrace {
  private readonly events: TraceEvent[] = [];

  constructor(private readonly enabled = isDashboardLoadTraceEnabled()) {}

  recordSliceFetch(slice: DashboardSliceName): void {
    if (!this.enabled) {
      return;
    }
    this.events.push({ at: Date.now(), kind: "fetch", slice });
    recordSliceFetch(slice);
  }

  recordSliceComplete(slice: DashboardSliceName): void {
    if (!this.enabled) {
      return;
    }
    this.events.push({ at: Date.now(), kind: "complete", slice });
    recordSliceComplete(slice);
  }

  recordSliceDiscard(slice: DashboardSliceName, detail: string): void {
    if (!this.enabled) {
      return;
    }
    this.events.push({ at: Date.now(), kind: "discard", slice, detail });
    if (isDashboardLoadTraceEnabled()) {
      moduleRecords.push({ slice, phase: "discard", at: Date.now(), detail });
    }
  }

  formatTraceLine(): string {
    return this.events
      .map((event) => {
        if (event.kind === "discard") {
          return formatTraceLine({ slice: event.slice, phase: "discard", at: event.at, detail: event.detail });
        }
        return `${event.kind} ${event.slice}${event.detail ? ` (${event.detail})` : ""}`;
      })
      .join(" · ");
  }

  clear(): void {
    this.events.length = 0;
  }
}
