import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { DashboardReadPathCoordinator } from "../dist/views/dashboard/dashboard-read-path-coordinator.js";
import { DashboardDataStore } from "../dist/views/dashboard/dashboard-data-store.js";
import { DashboardPollerCoordinator } from "../dist/views/dashboard/dashboard-pollers.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test("T100612: auto mode selects warm service when health probe succeeds", async () => {
  const server = http.createServer((req, res) => {
    const url = req.url ?? "";
    if (url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
      return;
    }
    if (url === "/dashboard/snapshot") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          schemaVersion: 1,
          serviceVersion: "0.99.21",
          generatedAt: "2026-05-30T03:00:00.000Z",
          generation: 1,
          planningGeneration: 42,
          slices: {}
        })
      );
      return;
    }
    if (url.startsWith("/dashboard/events")) {
      res.writeHead(200, { "Content-Type": "text/event-stream" });
      res.end("");
      return;
    }
    res.writeHead(404);
    res.end("");
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  const workspace = await fsMkdtemp();
  const runtimeDir = path.join(workspace, ".workspace-kit", "dashboard-service");
  await mkdir(runtimeDir, { recursive: true });
  await writeFile(
    path.join(runtimeDir, "runtime.json"),
    JSON.stringify({
      schemaVersion: 1,
      pid: 1,
      host: "127.0.0.1",
      port,
      startedAt: "2026-05-30T03:00:00.000Z",
      serviceVersion: "0.99.21",
      generation: 1,
      planningGeneration: 42
    })
  );

  let pollersStarted = 0;
  let pushSafetyNetEnabled = 0;
  const pollers = {
    start: () => {
      pollersStarted += 1;
    },
    stop: () => {},
    pause: () => {},
    resume: () => {},
    useFullCadence: () => {},
    usePushSafetyNetCadence: () => {
      pushSafetyNetEnabled += 1;
    },
    recordPushSliceUpdate: () => {},
    refreshCriticalNow: async () => {},
    refreshSlicesNow: async () => {},
    setVisibleSections: () => {}
  };
  const coordinator = new DashboardReadPathCoordinator({
    workspacePath: workspace,
    client: { run: async () => ({ ok: false }) },
    store: new DashboardDataStore(),
    pollers,
    log: () => {}
  });
  await coordinator.start();
  assert.equal(coordinator.getModeBadge().active, "service");
  assert.equal(coordinator.getModeBadge().pollingCadence, "push-safety-net");
  assert.equal(coordinator.isServicePathActive(), true);
  assert.equal(pollersStarted, 1);
  assert.equal(pushSafetyNetEnabled, 1);
  await coordinator.stop();
  await new Promise((resolve) => server.close(resolve));
});

async function fsMkdtemp() {
  const { mkdtemp } = await import("node:fs/promises");
  return mkdtemp(path.join(os.tmpdir(), "wk-read-path-"));
}

test("T100599: auto mode falls back to CLI pollers when service health fails", async () => {
  const store = new DashboardDataStore();
  let pollersStarted = 0;
  const pollers = {
    start: () => {
      pollersStarted += 1;
    },
    stop: () => {},
    pause: () => {},
    resume: () => {},
    useFullCadence: () => {},
    usePushSafetyNetCadence: () => {},
    recordPushSliceUpdate: () => {},
    refreshCriticalNow: async () => {},
    refreshSlicesNow: async () => {},
    setVisibleSections: () => {}
  };
  const coordinator = new DashboardReadPathCoordinator({
    workspacePath: "/tmp/no-service",
    client: { run: async () => ({ ok: false }) },
    store,
    pollers,
    log: () => {}
  });
  await coordinator.start();
  assert.equal(pollersStarted, 1);
  assert.equal(coordinator.getModeBadge().active, "cli-polling");
  assert.equal(coordinator.getModeBadge().pollingCadence, "full");
  assert.match(coordinator.getModeBadge().detail ?? "", /unavailable/i);
  await coordinator.stop();
});

test("T100599: service health failure resumes full-cadence CLI polling", async () => {
  let healthy = true;
  const server = http.createServer((req, res) => {
    const url = req.url ?? "";
    if (url === "/health") {
      res.writeHead(healthy ? 200 : 503, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: healthy }));
      return;
    }
    if (url === "/dashboard/snapshot") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          schemaVersion: 1,
          serviceVersion: "0.99.21",
          generatedAt: "2026-05-30T03:00:00.000Z",
          generation: 1,
          planningGeneration: 42,
          slices: {}
        })
      );
      return;
    }
    if (url.startsWith("/dashboard/events")) {
      res.writeHead(200, { "Content-Type": "text/event-stream" });
      res.end("");
      return;
    }
    res.writeHead(404);
    res.end("");
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  const workspace = await fsMkdtemp();
  const runtimeDir = path.join(workspace, ".workspace-kit", "dashboard-service");
  await mkdir(runtimeDir, { recursive: true });
  await writeFile(
    path.join(runtimeDir, "runtime.json"),
    JSON.stringify({
      schemaVersion: 1,
      pid: 1,
      host: "127.0.0.1",
      port,
      startedAt: "2026-05-30T03:00:00.000Z",
      serviceVersion: "0.99.21",
      generation: 1,
      planningGeneration: 42
    })
  );

  const originalSetInterval = globalThis.setInterval;
  const originalClearInterval = globalThis.clearInterval;
  const intervals = [];
  globalThis.setInterval = (fn, ms) => {
    const handle = { fn, ms };
    intervals.push(handle);
    return handle;
  };
  globalThis.clearInterval = () => {};

  let pollersStarted = 0;
  let fullCadenceEnabled = 0;
  let pushSafetyNetEnabled = 0;
  const pollers = {
    start: () => {
      pollersStarted += 1;
    },
    stop: () => {},
    pause: () => {},
    resume: () => {},
    useFullCadence: () => {
      fullCadenceEnabled += 1;
    },
    usePushSafetyNetCadence: () => {
      pushSafetyNetEnabled += 1;
    },
    recordPushSliceUpdate: () => {},
    refreshCriticalNow: async () => {},
    refreshSlicesNow: async () => {},
    setVisibleSections: () => {}
  };
  const coordinator = new DashboardReadPathCoordinator({
    workspacePath: workspace,
    client: { run: async () => ({ ok: false }) },
    store: new DashboardDataStore(),
    pollers,
    log: () => {}
  });

  try {
    await coordinator.start();
    assert.equal(coordinator.getModeBadge().active, "service");
    assert.equal(pushSafetyNetEnabled, 1);
    assert.equal(pollersStarted, 1);

    healthy = false;
    const healthMonitor = intervals.find((entry) => entry.ms === 3000);
    assert.ok(healthMonitor);
    healthMonitor.fn();
    await waitFor(() => coordinator.getModeBadge().active === "cli-polling");

    assert.equal(coordinator.getModeBadge().pollingCadence, "full");
    assert.match(coordinator.getModeBadge().detail ?? "", /became unhealthy/i);
    assert.equal(fullCadenceEnabled >= 1, true);
    assert.equal(pollersStarted >= 2, true);
  } finally {
    await coordinator.stop();
    globalThis.setInterval = originalSetInterval;
    globalThis.clearInterval = originalClearInterval;
    await new Promise((resolve) => server.close(resolve));
  }
});

test("T100599: forceCliPollingMode keeps CLI path for session", async () => {
  const store = new DashboardDataStore();
  const pollers = {
    start: () => {},
    stop: () => {},
    pause: () => {},
    resume: () => {},
    useFullCadence: () => {},
    usePushSafetyNetCadence: () => {},
    recordPushSliceUpdate: () => {},
    refreshCriticalNow: async () => {},
    refreshSlicesNow: async () => {},
    setVisibleSections: () => {}
  };
  const coordinator = new DashboardReadPathCoordinator({
    workspacePath: "/tmp/no-service",
    client: { run: async () => ({ ok: false }) },
    store,
    pollers
  });
  await coordinator.forceCliPollingMode();
  assert.equal(coordinator.getModeBadge().configured, "cli-polling");
});

async function waitFor(predicate, timeoutMs = 1000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.equal(predicate(), true);
}

test("T100599: provider wires DashboardReadPathCoordinator", () => {
  const providerSrc = readFileSync(
    path.join(__dirname, "../src/views/dashboard/DashboardViewProvider.ts"),
    "utf8"
  );
  assert.match(providerSrc, /DashboardReadPathCoordinator/);
  assert.match(providerSrc, /readPath\.startForPaint\(\)/);
  assert.match(providerSrc, /readPath\.promoteToService\(\)/);
  assert.match(providerSrc, /wcDashboardReadMode/);
});

test("T100599: extension registers restart + CLI mode commands", () => {
  const extSrc = readFileSync(path.join(__dirname, "../src/extension.ts"), "utf8");
  const pkg = JSON.parse(readFileSync(path.join(__dirname, "../package.json"), "utf8"));
  assert.match(extSrc, /workflowCannon\.dashboard\.restartService/);
  assert.match(extSrc, /workflowCannon\.dashboard\.useCliRefreshMode/);
  const commands = pkg.contributes.commands.map((c) => c.command);
  assert.ok(commands.includes("workflowCannon.dashboard.restartService"));
  assert.ok(commands.includes("workflowCannon.dashboard.useCliRefreshMode"));
});

test("T100601: coordinator forwards ok=false SSE events as isSuccess=false to pollers", async () => {
  // Use a minimal test-double for pollers that records isSuccess per call.
  const pushUpdates = [];
  const pollers = {
    start: () => {},
    stop: () => {},
    pause: () => {},
    resume: () => {},
    useFullCadence: () => {},
    usePushSafetyNetCadence: () => {},
    recordPushSliceUpdate: (name, _now, isSuccess = true) => {
      pushUpdates.push({ name, isSuccess });
    },
    setRequestServiceRefresh: () => {},
    getServiceRetrySliceCount: () => 0,
    refreshCriticalNow: async () => {},
    refreshSlicesNow: async () => {},
    setVisibleSections: () => {}
  };

  // Build a fake SSE server that immediately sends one ok=false slice event.
  const server = http.createServer((req, res) => {
    const url = req.url ?? "";
    if (url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
      return;
    }
    if (url === "/dashboard/snapshot") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          schemaVersion: 1,
          serviceVersion: "0.99.21",
          generatedAt: new Date().toISOString(),
          generation: 1,
          planningGeneration: 42,
          slices: {}
        })
      );
      return;
    }
    if (url.startsWith("/dashboard/events")) {
      res.writeHead(200, { "Content-Type": "text/event-stream" });
      // Send an error-status slice event (ok=false) then a success event (ok=true).
      res.write(
        `data: ${JSON.stringify({ type: "dashboard.slice.updated", generation: 2, slice: "queue", updatedAt: new Date().toISOString(), ok: false })}\n\n`
      );
      res.write(
        `data: ${JSON.stringify({ type: "dashboard.slice.updated", generation: 3, slice: "overview", updatedAt: new Date().toISOString(), ok: true })}\n\n`
      );
      // Keep connection open briefly, then end.
      setTimeout(() => res.end(), 100);
      return;
    }
    if (url.startsWith("/dashboard/slices/")) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ name: "queue", status: "error", value: null, source: "test" }));
      return;
    }
    res.writeHead(404);
    res.end("");
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  const workspace = await fsMkdtemp();
  const runtimeDir = path.join(workspace, ".workspace-kit", "dashboard-service");
  await mkdir(runtimeDir, { recursive: true });
  await writeFile(
    path.join(runtimeDir, "runtime.json"),
    JSON.stringify({
      schemaVersion: 1,
      pid: 1,
      host: "127.0.0.1",
      port,
      startedAt: new Date().toISOString(),
      serviceVersion: "0.99.21",
      generation: 1,
      planningGeneration: 42
    })
  );

  const coordinator = new DashboardReadPathCoordinator({
    workspacePath: workspace,
    client: { run: async () => ({ ok: false }) },
    store: new DashboardDataStore(),
    pollers,
    log: () => {}
  });
  await coordinator.start();

  // Wait for SSE events to be delivered.
  await new Promise((resolve) => setTimeout(resolve, 300));

  await coordinator.stop();
  await new Promise((resolve) => server.close(resolve));

  const queueUpdate = pushUpdates.find((u) => u.name === "queue");
  const overviewUpdate = pushUpdates.find((u) => u.name === "overview");

  assert.ok(queueUpdate, "queue push event should be recorded");
  assert.equal(
    queueUpdate?.isSuccess,
    false,
    "ok=false SSE event must be forwarded as isSuccess=false to the poller"
  );
  assert.ok(overviewUpdate, "overview push event should be recorded");
  assert.equal(
    overviewUpdate?.isSuccess,
    true,
    "ok=true SSE event must be forwarded as isSuccess=true to the poller"
  );
});

test("T100601: coordinator source-checks document error-vs-success forwarding", () => {
  const coordSrc = readFileSync(
    path.join(__dirname, "../src/views/dashboard/dashboard-read-path-coordinator.ts"),
    "utf8"
  );
  // Must check event.ok to distinguish error from success push.
  assert.match(coordSrc, /event\.ok !== false/);
  // Must pass isSuccess to pollers (call may span multiple lines, use dotAll).
  assert.match(coordSrc, /recordPushSliceUpdate[\s\S]{0,120}isSuccess/);
});

test("T100844/T100845: auto cold path does not call service start before CLI bootstrap", async () => {
  const store = new DashboardDataStore();
  const runCalls = [];
  let pollersStarted = 0;
  const pollers = {
    start: () => {
      pollersStarted += 1;
    },
    stop: () => {},
    pause: () => {},
    resume: () => {},
    useFullCadence: () => {},
    usePushSafetyNetCadence: () => {},
    recordPushSliceUpdate: () => {},
    refreshCriticalNow: async () => {},
    refreshSlicesNow: async () => {},
    setVisibleSections: () => {}
  };
  const coordinator = new DashboardReadPathCoordinator({
    workspacePath: "/tmp/no-service-t100844",
    client: {
      run: async (command, args) => {
        runCalls.push({ command, args });
        if (command === "dashboard-service-start") {
          return { ok: false, message: "should not be called during startForPaint" };
        }
        if (command === "dashboard-bootstrap-slices") {
          return {
            ok: true,
            data: {
              overview: { workspaceStatus: { phaseKey: "146" }, dashboardProjection: "overview" },
              queue: { readyQueueCount: 3, readyImprovementsSummary: { count: 3, top: [], phaseBuckets: [] } }
            }
          };
        }
        return { ok: false };
      }
    },
    store,
    pollers,
    log: () => {}
  });

  await coordinator.startForPaint();
  assert.equal(pollersStarted >= 1, true);
  assert.equal(coordinator.getModeBadge().active, "cli-polling");
  assert.ok(
    runCalls.some((c) => c.command === "dashboard-bootstrap-slices"),
    "cold path should call dashboard-bootstrap-slices without waiting on service start"
  );
  assert.equal(
    runCalls.some((c) => c.command === "dashboard-service-start"),
    false,
    "startForPaint must not call dashboard-service-start"
  );
  const bootstrapCall = runCalls.find((c) => c.command === "dashboard-bootstrap-slices");
  assert.deepEqual(bootstrapCall.args?.slices, ["overview", "queue"]);
  assert.equal(store.getSlice("overview").status, "fresh");
  assert.equal(store.getSlice("queue").status, "fresh");
  await coordinator.stop();
});

test("T100844/T100845: coordinator source keeps service restart off cold critical path", () => {
  const coordSrc = readFileSync(
    path.join(__dirname, "../src/views/dashboard/dashboard-read-path-coordinator.ts"),
    "utf8"
  );
  assert.match(coordSrc, /async startForPaint\(\)/);
  assert.match(coordSrc, /async promoteToService\(\)/);
  assert.match(coordSrc, /slices:\s*\["overview",\s*"queue"\]/);
  const paintBlock = coordSrc.slice(
    coordSrc.indexOf("private async activateReadPathForPaint"),
    coordSrc.indexOf("private async runPromoteToService")
  );
  assert.doesNotMatch(paintBlock, /dashboard-service-start/);
  assert.doesNotMatch(paintBlock, /await this\.restartDashboardService\(\)/);
  assert.doesNotMatch(paintBlock, /attemptBackgroundServiceStart/);
});

test("T100845: promoteToService starts service after cold paint and swaps quietly", async () => {
  const store = new DashboardDataStore();
  const runCalls = [];
  let serviceHealthy = false;
  const server = http.createServer((req, res) => {
    const url = req.url ?? "";
    if (url === "/health") {
      res.writeHead(serviceHealthy ? 200 : 503, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: serviceHealthy }));
      return;
    }
    if (url === "/dashboard/snapshot") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          schemaVersion: 1,
          serviceVersion: "0.99.21",
          generatedAt: "2026-05-30T03:00:00.000Z",
          generation: 2,
          planningGeneration: 42,
          slices: {
            overview: {
              name: "overview",
              status: "fresh",
              value: {
                workspaceStatus: { phaseKey: "146" },
                dashboardProjection: "overview"
              },
              source: "service",
              planningGeneration: 42
            },
            queue: {
              name: "queue",
              status: "fresh",
              value: { readyQueueCount: 3 },
              source: "service",
              planningGeneration: 42
            }
          }
        })
      );
      return;
    }
    if (url.startsWith("/dashboard/events")) {
      res.writeHead(200, { "Content-Type": "text/event-stream" });
      res.end("");
      return;
    }
    res.writeHead(404);
    res.end("");
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  const workspace = await fsMkdtemp();
  const runtimeDir = path.join(workspace, ".workspace-kit", "dashboard-service");
  await mkdir(runtimeDir, { recursive: true });
  await writeFile(
    path.join(runtimeDir, "runtime.json"),
    JSON.stringify({
      schemaVersion: 1,
      pid: 1,
      host: "127.0.0.1",
      port,
      startedAt: "2026-05-30T03:00:00.000Z",
      serviceVersion: "0.99.21",
      generation: 1,
      planningGeneration: 42
    })
  );

  const pollers = {
    start: () => {},
    stop: () => {},
    pause: () => {},
    resume: () => {},
    useFullCadence: () => {},
    usePushSafetyNetCadence: () => {},
    recordPushSliceUpdate: () => {},
    setRequestServiceRefresh: () => {},
    refreshCriticalNow: async () => {},
    refreshSlicesNow: async () => {},
    setVisibleSections: () => {}
  };
  const coordinator = new DashboardReadPathCoordinator({
    workspacePath: workspace,
    client: {
      run: async (command, args) => {
        runCalls.push({ command, args });
        if (command === "dashboard-service-start") {
          serviceHealthy = true;
          return { ok: true };
        }
        if (command === "dashboard-bootstrap-slices") {
          return {
            ok: true,
            data: {
              overview: { workspaceStatus: { phaseKey: "146" }, dashboardProjection: "overview" },
              queue: { readyQueueCount: 3 }
            }
          };
        }
        return { ok: false };
      }
    },
    store,
    pollers,
    log: () => {}
  });

  await coordinator.startForPaint();
  assert.equal(coordinator.getModeBadge().active, "cli-polling");
  assert.equal(
    runCalls.some((c) => c.command === "dashboard-service-start"),
    false
  );
  assert.equal(store.getSlice("overview").status, "fresh");

  await coordinator.promoteToService();
  assert.equal(coordinator.isServicePathActive(), true);
  assert.equal(coordinator.getModeBadge().active, "service");
  assert.ok(runCalls.some((c) => c.command === "dashboard-service-start"));
  assert.equal(store.getSlice("overview").status, "fresh");
  assert.ok(store.getSlice("overview").value?.workspaceStatus);

  await coordinator.stop();
  await new Promise((resolve) => server.close(resolve));
});

test("T100845: promote failure keeps CLI path and usable overview", async () => {
  const store = new DashboardDataStore();
  const pollers = {
    start: () => {},
    stop: () => {},
    pause: () => {},
    resume: () => {},
    useFullCadence: () => {},
    usePushSafetyNetCadence: () => {},
    recordPushSliceUpdate: () => {},
    refreshCriticalNow: async () => {},
    refreshSlicesNow: async () => {},
    setVisibleSections: () => {}
  };
  const coordinator = new DashboardReadPathCoordinator({
    workspacePath: "/tmp/no-service-promote-fail",
    client: {
      run: async (command) => {
        if (command === "dashboard-service-start") {
          return { ok: false, message: "boom" };
        }
        if (command === "dashboard-bootstrap-slices") {
          return {
            ok: true,
            data: {
              overview: { workspaceStatus: { phaseKey: "146" }, dashboardProjection: "overview" },
              queue: { readyQueueCount: 7 }
            }
          };
        }
        return { ok: false };
      }
    },
    store,
    pollers,
    log: () => {}
  });

  await coordinator.startForPaint();
  assert.equal(coordinator.getModeBadge().active, "cli-polling");
  assert.equal(store.getSlice("overview").value?.workspaceStatus?.phaseKey, "146");

  await coordinator.promoteToService();
  assert.equal(coordinator.getModeBadge().active, "cli-polling");
  assert.equal(coordinator.isServicePathActive(), false);
  assert.equal(store.getSlice("overview").status, "fresh");
  assert.equal(store.getSlice("overview").value?.workspaceStatus?.phaseKey, "146");
  assert.equal(store.getSlice("queue").value?.readyQueueCount, 7);

  await coordinator.stop();
});
