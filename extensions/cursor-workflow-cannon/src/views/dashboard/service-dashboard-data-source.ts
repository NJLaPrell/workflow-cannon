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
};

type FetchFn = typeof fetch;

/** Lightweight health probe for auto mode (no SSE connection). */
export async function probeDashboardServiceHealth(
  workspacePath: string,
  options?: Pick<ServiceDashboardDataSourceOptions, "fetchFn" | "readRuntimeFile">
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
    const res = await fetchFn(`${base}/health`);
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

  constructor(private readonly options: ServiceDashboardDataSourceOptions) {
    this.fetchFn = options.fetchFn ?? fetch;
    this.readRuntimeFile = options.readRuntimeFile ?? ((absPath) => readFile(absPath, "utf8"));
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
    const res = await this.fetchFn(`${base}/dashboard/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slices: [name] })
    });
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
      const res = await this.fetchFn(`${base}/health`);
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
    const res = await this.fetchFn(`${base}/dashboard/snapshot`);
    if (!res.ok) {
      throw new Error(`dashboard snapshot failed (${res.status})`);
    }
    return (await res.json()) as DashboardServiceSnapshot;
  }

  private connectSse(): void {
    const base = this.baseUrl();
    if (!base) {
      return;
    }
    this.sseAbort = new AbortController();
    const signal = this.sseAbort.signal;
    this.sseTask = (async () => {
      const res = await this.fetchFn(`${base}/dashboard/events`, { signal });
      if (!res.ok || !res.body) {
        return;
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
            const event = JSON.parse(line.slice(6)) as DashboardServiceEvent;
            for (const listener of this.listeners) {
              listener(event);
            }
          } catch {
            // ignore malformed SSE payloads
          }
        }
      }
    })().catch(() => {
      // SSE disconnect is normal on stop()
    });
  }
}
