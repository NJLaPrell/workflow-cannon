import { performance } from "node:perf_hooks";

type Span = {
  name: string;
  start: number;
  end?: number;
  durationMs?: number;
};

class CliPerfTracerImpl {
  private enabled = false;
  private spans: Span[] = [];
  private activeSpans = new Map<string, number>();
  private startedAt = performance.now();
  private flushed = false;

  constructor() {
    const envTrace = process.env.WORKSPACE_KIT_CLI_PERF_TRACE || process.env.WORKSPACE_KIT_PERF_TRACE;
    if (envTrace && /^(1|true|yes|on)$/i.test(envTrace.trim())) {
      this.enabled = true;
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  startSpan(name: string): void {
    if (!this.enabled) return;
    this.activeSpans.set(name, performance.now());
  }

  endSpan(name: string): void {
    if (!this.enabled) return;
    const start = this.activeSpans.get(name);
    if (start === undefined) return;
    this.activeSpans.delete(name);
    const end = performance.now();
    this.spans.push({
      name,
      start,
      end,
      durationMs: end - start
    });
  }

  span<T>(name: string, fn: () => T): T {
    if (!this.enabled) return fn();
    this.startSpan(name);
    try {
      return fn();
    } finally {
      this.endSpan(name);
    }
  }

  async spanAsync<T>(name: string, fn: () => Promise<T>): Promise<T> {
    if (!this.enabled) return fn();
    this.startSpan(name);
    try {
      return await fn();
    } finally {
      this.endSpan(name);
    }
  }

  flush(): void {
    if (!this.enabled || this.flushed) return;
    this.flushed = true;
    const totalMs = performance.now() - this.startedAt;
    const top = [...this.spans]
      .sort((a, b) => (b.durationMs ?? 0) - (a.durationMs ?? 0))
      .slice(0, 10)
      .map((span) => `${span.name}=${(span.durationMs ?? 0).toFixed(2)}ms`)
      .join(", ");

    process.stderr.write(`[cli-perf trace] total=${totalMs.toFixed(2)}ms top=${top || "none"}\n`);
    for (const span of this.spans) {
      process.stderr.write(`[cli-perf trace] span=${span.name} durationMs=${(span.durationMs ?? 0).toFixed(2)}\n`);
    }
  }

  reset(): void {
    const envTrace = process.env.WORKSPACE_KIT_CLI_PERF_TRACE || process.env.WORKSPACE_KIT_PERF_TRACE;
    if (envTrace && /^(1|true|yes|on)$/i.test(envTrace.trim())) {
      this.enabled = true;
    } else {
      this.enabled = false;
    }
    this.spans = [];
    this.activeSpans.clear();
    this.startedAt = performance.now();
    this.flushed = false;
  }
}

export const cliPerfTracer = new CliPerfTracerImpl();

// Helper to emit a metric line when performance tracing is enabled
export function recordMetric(metric: string, value: any): void {
  if (cliPerfTracer.isEnabled()) {
    const payload = { metric, value };
    // Prefix with [benchmark] to allow downstream parsing
    process.stderr.write(`[benchmark] ${JSON.stringify(payload)}\n`);
  }
}
