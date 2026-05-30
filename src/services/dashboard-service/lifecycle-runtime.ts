import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import { openSync } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import type { ModuleCommandResult, ModuleLifecycleContext } from "../../contracts/module-contract.js";
import { createDashboardService } from "./server.js";
import {
  dashboardServiceDir,
  dashboardServiceLogPath,
  dashboardServicePidPath,
  dashboardServiceRuntimePath,
  type DashboardServiceRuntimeV1
} from "./lifecycle-paths.js";

function daemonScriptPath(): string {
  return path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "dashboard-service-daemon.js"
  );
}

function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function readRuntime(workspacePath: string): Promise<DashboardServiceRuntimeV1 | null> {
  try {
    const raw = JSON.parse(await readFile(dashboardServiceRuntimePath(workspacePath), "utf8")) as unknown;
    if (!raw || typeof raw !== "object") {
      return null;
    }
    const r = raw as DashboardServiceRuntimeV1;
    if (r.schemaVersion !== 1 || typeof r.port !== "number") {
      return null;
    }
    return r;
  } catch {
    return null;
  }
}

async function writeRuntime(workspacePath: string, runtime: DashboardServiceRuntimeV1): Promise<void> {
  await mkdir(dashboardServiceDir(workspacePath), { recursive: true });
  await writeFile(dashboardServiceRuntimePath(workspacePath), `${JSON.stringify(runtime, null, 2)}\n`, "utf8");
  await writeFile(dashboardServicePidPath(workspacePath), `${runtime.pid}\n`, "utf8");
}

async function clearRuntimeArtifacts(workspacePath: string): Promise<void> {
  for (const fp of [dashboardServiceRuntimePath(workspacePath), dashboardServicePidPath(workspacePath)]) {
    try {
      await unlink(fp);
    } catch {
      // ignore
    }
  }
}

async function probeHealth(runtime: DashboardServiceRuntimeV1): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(`http://${runtime.host}:${runtime.port}/health`);
    if (!res.ok) {
      return null;
    }
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function waitForRuntime(
  workspacePath: string,
  timeoutMs = 10_000
): Promise<DashboardServiceRuntimeV1 | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const runtime = await readRuntime(workspacePath);
    if (runtime && isPidAlive(runtime.pid)) {
      const health = await probeHealth(runtime);
      if (health?.ok === true) {
        return runtime;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return null;
}

/** Detached daemon entry — spawned by `dashboard-service-start`. */
export async function runDashboardServiceDaemonMain(workspacePath: string): Promise<void> {
  await mkdir(dashboardServiceDir(workspacePath), { recursive: true });
  const logPath = dashboardServiceLogPath(workspacePath);
  const logFd = openSync(logPath, "a");

  const svc = await createDashboardService({ workspacePath });
  const runtime: DashboardServiceRuntimeV1 = {
    schemaVersion: 1,
    pid: process.pid,
    host: svc.host,
    port: svc.port,
    startedAt: new Date().toISOString(),
    serviceVersion: svc.snapshotStore.getSnapshot().serviceVersion,
    generation: svc.snapshotStore.getGeneration(),
    planningGeneration: svc.snapshotStore.getPlanningGeneration()
  };
  await writeRuntime(workspacePath, runtime);

  const shutdown = async (): Promise<void> => {
    await svc.stop();
    await clearRuntimeArtifacts(workspacePath);
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());

  // Keep process alive; stdio redirected to log by parent spawn when detached.
  void logFd;
}

export async function runDashboardServiceStart(
  ctx: ModuleLifecycleContext
): Promise<ModuleCommandResult> {
  const workspacePath = ctx.workspacePath;
  const existing = await readRuntime(workspacePath);
  if (existing && isPidAlive(existing.pid)) {
    const health = await probeHealth(existing);
    if (health?.ok === true) {
      return {
        ok: true,
        code: "dashboard-service-already-running",
        message: "Dashboard service already running",
        data: { runtime: existing, health, idempotent: true }
      };
    }
  }
  await clearRuntimeArtifacts(workspacePath);
  await mkdir(dashboardServiceDir(workspacePath), { recursive: true });

  const logPath = dashboardServiceLogPath(workspacePath);
  const logFd = openSync(logPath, "a");
  const child = spawn(process.execPath, [daemonScriptPath()], {
    detached: true,
    stdio: ["ignore", logFd, logFd],
    env: {
      ...process.env,
      WORKSPACE_KIT_DASHBOARD_SERVICE_WORKSPACE: workspacePath
    }
  });
  child.unref();

  const runtime = await waitForRuntime(workspacePath);
  if (!runtime) {
    return {
      ok: false,
      code: "dashboard-service-start-timeout",
      message: "Dashboard service did not become healthy within 10s; see .workspace-kit/dashboard-service/service.log"
    };
  }
  return {
    ok: true,
    code: "dashboard-service-started",
    message: `Dashboard service listening on http://${runtime.host}:${runtime.port}`,
    data: { runtime }
  };
}

export async function runDashboardServiceStop(
  ctx: ModuleLifecycleContext
): Promise<ModuleCommandResult> {
  const runtime = await readRuntime(ctx.workspacePath);
  if (!runtime) {
    return {
      ok: true,
      code: "dashboard-service-not-running",
      message: "Dashboard service is not running",
      data: { idempotent: true }
    };
  }
  if (isPidAlive(runtime.pid)) {
    process.kill(runtime.pid, "SIGTERM");
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  await clearRuntimeArtifacts(ctx.workspacePath);
  return {
    ok: true,
    code: "dashboard-service-stopped",
    message: "Dashboard service stopped",
    data: { runtime }
  };
}

export async function runDashboardServiceStatus(
  ctx: ModuleLifecycleContext
): Promise<ModuleCommandResult> {
  const runtime = await readRuntime(ctx.workspacePath);
  const workspaceRoot = ctx.workspacePath;
  if (!runtime || !isPidAlive(runtime.pid)) {
    return {
      ok: true,
      code: "dashboard-service-status",
      message: "Dashboard service is not running",
      data: { running: false, workspaceRoot, runtime: runtime ?? null }
    };
  }
  const health = await probeHealth(runtime);
  return {
    ok: true,
    code: "dashboard-service-status",
    message: health?.ok === true ? "Dashboard service is healthy" : "Dashboard service is unhealthy",
    data: {
      running: true,
      workspaceRoot,
      runtime,
      health,
      uptimeMs: typeof health?.uptimeMs === "number" ? health.uptimeMs : null,
      generation: typeof health?.generation === "number" ? health.generation : runtime.generation
    }
  };
}

export async function runDashboardServiceSnapshot(
  ctx: ModuleLifecycleContext
): Promise<ModuleCommandResult> {
  const runtime = await readRuntime(ctx.workspacePath);
  if (!runtime || !isPidAlive(runtime.pid)) {
    return {
      ok: false,
      code: "dashboard-service-not-running",
      message: "Dashboard service is not running; run dashboard-service-start first"
    };
  }
  try {
    const res = await fetch(`http://${runtime.host}:${runtime.port}/dashboard/snapshot`);
    if (!res.ok) {
      return {
        ok: false,
        code: "dashboard-service-snapshot-failed",
        message: `Snapshot request failed with HTTP ${res.status}`
      };
    }
    const snapshot = await res.json();
    return {
      ok: true,
      code: "dashboard-service-snapshot",
      message: "Dashboard service snapshot retrieved",
      data: snapshot as Record<string, unknown>
    };
  } catch (error) {
    return {
      ok: false,
      code: "dashboard-service-snapshot-failed",
      message: error instanceof Error ? error.message : String(error)
    };
  }
}

/** In-process start for tests (no detached spawn). */
export async function runDashboardServiceStartInProcess(
  ctx: ModuleLifecycleContext
): Promise<{ handle: Awaited<ReturnType<typeof createDashboardService>>; runtime: DashboardServiceRuntimeV1 }> {
  const svc = await createDashboardService({ workspacePath: ctx.workspacePath });
  const runtime: DashboardServiceRuntimeV1 = {
    schemaVersion: 1,
    pid: process.pid,
    host: svc.host,
    port: svc.port,
    startedAt: new Date().toISOString(),
    serviceVersion: svc.snapshotStore.getSnapshot().serviceVersion,
    generation: svc.snapshotStore.getGeneration(),
    planningGeneration: svc.snapshotStore.getPlanningGeneration()
  };
  await writeRuntime(ctx.workspacePath, runtime);
  return { handle: svc, runtime };
}
