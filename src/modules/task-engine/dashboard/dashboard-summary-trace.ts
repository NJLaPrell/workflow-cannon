import type { DashboardSummaryProjection } from "./dashboard-summary-projection.js";

type DashboardSummaryTraceSpan = {
  name: string;
  durationMs: number;
};

export type DashboardSummaryTracer = {
  projection: DashboardSummaryProjection | "unknown";
  span<T>(name: string, run: () => T): T;
  spanAsync<T>(name: string, run: () => Promise<T>): Promise<T>;
  flush(): void;
};

const TRACE_ENV_KEYS = ["WORKFLOW_CANNON_DASHBOARD_TRACE", "WORKSPACE_KIT_DASHBOARD_TRACE"] as const;

function isTruthyTraceValue(value: unknown): boolean {
  if (value === true) return true;
  if (typeof value !== "string") return false;
  return /^(1|true|yes|on)$/i.test(value.trim());
}

export function dashboardSummaryTraceRequested(args?: Record<string, unknown>): boolean {
  if (isTruthyTraceValue(args?.dashboardTrace) || isTruthyTraceValue(args?.traceDashboardSummary)) {
    return true;
  }
  return TRACE_ENV_KEYS.some((key) => isTruthyTraceValue(process.env[key]));
}

function nowMs(): number {
  const perf = globalThis.performance;
  return perf && typeof perf.now === "function" ? perf.now() : Date.now();
}

function formatMs(value: number): string {
  return value.toFixed(value >= 100 ? 0 : value >= 10 ? 1 : 2);
}

function writeTraceLine(message: string): void {
  process.stderr.write(`${message}\n`);
}

export function createDashboardSummaryTracer(
  args?: Record<string, unknown>
): DashboardSummaryTracer | undefined {
  if (!dashboardSummaryTraceRequested(args)) {
    return undefined;
  }
  const spans: DashboardSummaryTraceSpan[] = [];
  const startedAt = nowMs();
  let flushed = false;
  let projection: DashboardSummaryProjection | "unknown" = "unknown";

  const record = <T>(name: string, start: number, value: T): T => {
    spans.push({ name, durationMs: nowMs() - start });
    return value;
  };

  return {
    get projection() {
      return projection;
    },
    set projection(value) {
      projection = value;
    },
    span<T>(name: string, run: () => T): T {
      const start = nowMs();
      return record(name, start, run());
    },
    async spanAsync<T>(name: string, run: () => Promise<T>): Promise<T> {
      const start = nowMs();
      return record(name, start, await run());
    },
    flush(): void {
      if (flushed) return;
      flushed = true;
      const totalMs = nowMs() - startedAt;
      const top = [...spans]
        .sort((a, b) => b.durationMs - a.durationMs)
        .slice(0, 8)
        .map((span) => `${span.name}=${formatMs(span.durationMs)}ms`)
        .join(", ");
      writeTraceLine(
        `[dashboard-summary trace] projection=${projection} total=${formatMs(totalMs)}ms top=${top || "none"}`
      );
      for (const span of spans) {
        writeTraceLine(`[dashboard-summary trace] span=${span.name} durationMs=${formatMs(span.durationMs)}`);
      }
    }
  };
}
