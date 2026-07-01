import { readFile } from "node:fs/promises";
import path from "node:path";
import type { DashboardServiceEvent } from "@workflow-cannon/workspace-kit/contracts/dashboard-events";
import type { DashboardServiceSnapshot } from "@workflow-cannon/workspace-kit/contracts/dashboard-snapshot";
import type * as vscode from "vscode";
import type { DashboardDataSource } from "./dashboard-data-source.js";
import {
  DASHBOARD_SERVICE_RUNTIME_REL,
  mapServiceSnapshotToDashboardSnapshot,
  parseDashboardServiceRuntime,
  type DashboardServiceRuntimeV1
} from "./dashboard-service-mapper.js";
import type { DashboardSliceName, DashboardSnapshot } from "./dashboard-snapshot-types.js";

export type ServiceDashboardDataSourceOptions = {
  workspacePath: string;
  fetchFn?: typeof fetch;
  readRuntimeFile?: (absPath: string) => Promise<string>;
  /** Test hook: SSE reconnect backoff (default 1000ms). */
  sseReconnectDelayMs?: number;
  /** Test hook: bounded service health/read requests (default 1500ms). */
  requestTimeoutMs?: number;
};

type FetchFn = typeof fetch;
const DEFAULT_SERVICE_REQUEST_TIMEOUT_MS = 1_500;

type AgentActivityUpdatedEvent = {
  type: "agentActivity.updated";
  generation: number;
  updatedAt: string;
};

function normalizeDashboardServiceEvent(
  event: DashboardServiceEvent | AgentActivityUpdatedEvent
): DashboardServiceEvent {
  if (event.type === "agentActivity.updated") {
    return {
      type: "dashboard.slice.updated",
      generation: event.generation,
      slice: "agentActivity",
      updatedAt: event.updatedAt
    };
  }
  return event;
}

async function fetchWithTimeout(
  fetchFn: FetchFn,
  input: Parameters<FetchFn>[0],
  init: Parameters<FetchFn>[1] = {},
  timeoutMs = DEFAULT_SERVICE_REQUEST_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchFn(input, { ...init, signal: init?.signal ?? controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** Lightweight health probe for auto mode (no SSE connection). */
export async function probeDashboardServiceHealth(
  workspacePath: string,
  options?: Pick<ServiceDashboardDataSourceOptions, "fetchFn" | "readRuntimeFile" | "requestTimeoutMs">
): Promise<boolean> {
  const fetchFn = options?.fetchFn ?? fetch;
  const readRuntimeFile = options?.readRuntimeFile ?? ((absPath) => readFile(absPath, "utf8"));
  const abs = path.join(workspacePath, DASHBOARD_SERVICE_RUNTIME_REL);
  let runtime: DashboardServiceRuntimeV1 | null;
  try {
    const raw = JSON.parse(await readRuntimeFile(abs)) as unknown;
    runtime = parseDashboardServiceRuntime(raw);
  } catch {
    return false;
  }
  if (!runtime) {
    return false;
  }
  const base = `http://${runtime.host}:${runtime.port}`;
  try {
    const res = await fetchWithTimeout(fetchFn, `${base}/health`, {}, options?.requestTimeoutMs);
    if (!res.ok) {
      return false;
    }
    const body = (await res.json()) as { ok?: boolean };
    return body.ok === true;
  } catch {
    return false;
  }
}

export class ServiceDashboardDataSource implements DashboardDataSource {
  private runtime: DashboardServiceRuntimeV1 | null = null;
  private sseAbort: AbortController | null = null;
  private sseTask: Promise<void> | null = null;
  private readonly listeners = new Set<(event: DashboardServiceEvent) => void>();
  private readonly fetchFn: FetchFn;
  private readonly readRuntimeFile: (absPath: string) => Promise<string>;
  private readonly sseReconnectDelayMs: number;
  private readonly requestTimeoutMs: number;

  constructor(private readonly options: ServiceDashboardDataSourceOptions) {
    this.fetchFn = options.fetchFn ?? fetch;
    this.readRuntimeFile = options.readRuntimeFile ?? ((absPath) => readFile(absPath, "utf8"));
    this.sseReconnectDelayMs = options.sseReconnectDelayMs ?? 1000;
    this.requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_SERVICE_REQUEST_TIMEOUT_MS;
  }

  getRuntime(): DashboardServiceRuntimeV1 | null {
    return this.runtime;
  }

  async start(): Promise<void> {
    this.runtime = await this.loadRuntime();
    if (!this.runtime) {
      throw new Error("dashboard service runtime.json not found or invalid");
    }
    const health = await this.probeHealth();
    if (!health) {
      throw new Error("dashboard service health check failed");
    }
    this.connectSse();
  }

  async stop(): Promise<void> {
    this.sseAbort?.abort();
    this.sseAbort = null;
    this.sseTask = null;
    this.runtime = null;
    this.listeners.clear();
  }

  async refreshSlice(name: DashboardSliceName): Promise<void> {
    const base = this.baseUrl();
    if (!base) {
      throw new Error("dashboard service not started");
    }
    const res = await fetchWithTimeout(
      this.fetchFn,
      `${base}/dashboard/refresh`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slices: [name] })
      },
      this.requestTimeoutMs
    );
    if (!res.ok) {
      throw new Error(`dashboard refresh failed (${res.status})`);
    }
  }

  async getSnapshot(): Promise<DashboardSnapshot> {
    const service = await this.fetchServiceSnapshot();
    return mapServiceSnapshotToDashboardSnapshot(service);
  }

  subscribe(listener: (event: DashboardServiceEvent) => void): vscode.Disposable {
    this.listeners.add(listener);
    return {
      dispose: () => {
        this.listeners.delete(listener);
      }
    };
  }

  private baseUrl(): string | null {
    if (!this.runtime) {
      return null;
    }
    return `http://${this.runtime.host}:${this.runtime.port}`;
  }

  private async loadRuntime(): Promise<DashboardServiceRuntimeV1 | null> {
    const abs = path.join(this.options.workspacePath, DASHBOARD_SERVICE_RUNTIME_REL);
    try {
      const raw = JSON.parse(await this.readRuntimeFile(abs)) as unknown;
      return parseDashboardServiceRuntime(raw);
    } catch {
      return null;
    }
  }

  private async probeHealth(): Promise<boolean> {
    const base = this.baseUrl();
    if (!base) {
      return false;
    }
    try {
      const res = await fetchWithTimeout(this.fetchFn, `${base}/health`, {}, this.requestTimeoutMs);
      if (!res.ok) {
        return false;
      }
      const body = (await res.json()) as { ok?: boolean };
      return body.ok === true;
    } catch {
      return false;
    }
  }

  private async fetchServiceSnapshot(): Promise<DashboardServiceSnapshot> {
    const base = this.baseUrl();
    if (!base) {
      throw new Error("dashboard service not started");
    }
    const res = await fetchWithTimeout(this.fetchFn, `${base}/dashboard/snapshot`, {}, this.requestTimeoutMs);
    if (!res.ok) {
      throw new Error(`dashboard snapshot failed (${res.status})`);
    }
    return (await res.json()) as DashboardServiceSnapshot;
  }

  private connectSse(): void {
    this.sseAbort = new AbortController();
    const signal = this.sseAbort.signal;
    this.sseTask = this.runSseLoop(signal);
  }

  private async runSseLoop(signal: AbortSignal): Promise<void> {
    while (!signal.aborted) {
      const runtime = await this.loadRuntime();
      if (!runtime) {
        await this.delayReconnect(signal);
        continue;
      }
      this.runtime = runtime;
      const base = `http://${runtime.host}:${runtime.port}`;

      try {
        const res = await this.fetchFn(`${base}/dashboard/events`, { signal });
        if (!res.ok || !res.body) {
          await this.delayReconnect(signal);
          continue;
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (!signal.aborted) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }
          buffer += decoder.decode(value, { stream: true });
          const chunks = buffer.split("\n\n");
          buffer = chunks.pop() ?? "";
          for (const chunk of chunks) {
            const line = chunk.split("\n").find((l) => l.startsWith("data: "));
            if (!line) {
              continue;
            }
            try {
              const event = normalizeDashboardServiceEvent(
                JSON.parse(line.slice(6)) as DashboardServiceEvent
              );
              for (const listener of this.listeners) {
                listener(event);
              }
            } catch {
              // ignore malformed SSE payloads
            }
          }
        }
      } catch {
        // SSE disconnect is normal on stop() or transient network errors
      }

      if (!signal.aborted) {
        await this.delayReconnect(signal);
      }
    }
  }

  private delayReconnect(signal: AbortSignal): Promise<void> {
    return new Promise((resolve) => {
      const timer = setTimeout(resolve, this.sseReconnectDelayMs);
      signal.addEventListener(
        "abort",
        () => {
          clearTimeout(timer);
          resolve();
        },
        { once: true }
      );
    });
  }
}
