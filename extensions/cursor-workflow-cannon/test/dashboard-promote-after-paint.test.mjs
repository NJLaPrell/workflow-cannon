/**
 * T100845 — Quiet promote to service after first paint (R-3).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { DashboardReadPathCoordinator } from "../dist/views/dashboard/dashboard-read-path-coordinator.js";
import { DashboardDataStore } from "../dist/views/dashboard/dashboard-data-store.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function fsMkdtemp() {
  const { mkdtemp } = await import("node:fs/promises");
  return mkdtemp(path.join(os.tmpdir(), "wk-promote-"));
}

function stubPollers() {
  return {
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
}

test("T100845: provider promote after ready never uses wcReplaceRoot", () => {
  const providerSrc = readFileSync(
    path.join(__dirname, "../src/views/dashboard/DashboardViewProvider.ts"),
    "utf8"
  );
  const onReadyBlock = providerSrc.slice(
    providerSrc.indexOf("onReady: () => {"),
    providerSrc.indexOf("log: (message) => logWc(\"dashboard\", message)")
  );
  assert.match(onReadyBlock, /promoteToService/);
  assert.doesNotMatch(onReadyBlock, /type:\s*"wcReplaceRoot"/);
  assert.doesNotMatch(onReadyBlock, /postMessage\(\{[\s\S]*wcReplaceRoot/);
  assert.doesNotMatch(onReadyBlock, /startupController\.reset/);
  assert.doesNotMatch(onReadyBlock, /requestDashboardStartup/);
  assert.doesNotMatch(onReadyBlock, /pushUpdate\(/);
});

test("T100845: promote after ready keeps CLI overview when service start fails", async () => {
  const store = new DashboardDataStore();
  const coordinator = new DashboardReadPathCoordinator({
    workspacePath: "/tmp/promote-fail-steady",
    client: {
      run: async (command) => {
        if (command === "dashboard-bootstrap-slices") {
          return {
            ok: true,
            data: {
              overview: {
                workspaceStatus: { phaseKey: "146", label: "Phase 146" },
                dashboardProjection: "overview"
              },
              queue: { readyQueueCount: 4 }
            }
          };
        }
        if (command === "dashboard-service-start") {
          return { ok: false, message: "service refused" };
        }
        return { ok: false };
      }
    },
    store,
    pollers: stubPollers(),
    log: () => {}
  });

  await coordinator.startForPaint();
  assert.equal(coordinator.getModeBadge().active, "cli-polling");
  const overviewBefore = store.getSlice("overview").value;

  await coordinator.promoteToService();

  assert.equal(coordinator.getModeBadge().active, "cli-polling");
  assert.equal(coordinator.isServicePathActive(), false);
  assert.deepEqual(store.getSlice("overview").value, overviewBefore);
  assert.equal(store.getSlice("queue").value?.readyQueueCount, 4);

  await coordinator.stop();
});

test("T100845: healthy-at-open prefers service without CLI bootstrap detour", async () => {
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
          slices: {
            overview: {
              name: "overview",
              status: "fresh",
              value: { workspaceStatus: { phaseKey: "146" }, dashboardProjection: "overview" },
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

  const runCalls = [];
  const coordinator = new DashboardReadPathCoordinator({
    workspacePath: workspace,
    client: {
      run: async (command, args) => {
        runCalls.push({ command, args });
        return { ok: false };
      }
    },
    store: new DashboardDataStore(),
    pollers: stubPollers(),
    log: () => {}
  });

  await coordinator.startForPaint();
  assert.equal(coordinator.isServicePathActive(), true);
  assert.equal(
    runCalls.some((c) => c.command === "dashboard-bootstrap-slices"),
    false,
    "healthy-at-open must skip CLI bootstrap detour"
  );
  assert.equal(
    runCalls.some((c) => c.command === "dashboard-service-start"),
    false,
    "healthy-at-open must not start service (already healthy)"
  );

  await coordinator.promoteToService();
  assert.equal(coordinator.isServicePathActive(), true);
  assert.equal(
    runCalls.some((c) => c.command === "dashboard-service-start"),
    false,
    "promote is a no-op when already on service"
  );

  await coordinator.stop();
  await new Promise((resolve) => server.close(resolve));
});

test("T100845: promote restores overview when service snapshot regresses usable CLI data", async () => {
  let serviceHealthy = false;
  const server = http.createServer((req, res) => {
    const url = req.url ?? "";
    if (url === "/health") {
      res.writeHead(serviceHealthy ? 200 : 503, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: serviceHealthy }));
      return;
    }
    if (url === "/dashboard/snapshot") {
      // Empty / partial overview — would regress the painted CLI overview.
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
              value: { dashboardProjection: "overview" },
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

  const store = new DashboardDataStore();
  const coordinator = new DashboardReadPathCoordinator({
    workspacePath: workspace,
    client: {
      run: async (command) => {
        if (command === "dashboard-bootstrap-slices") {
          return {
            ok: true,
            data: {
              overview: {
                workspaceStatus: { phaseKey: "146", label: "keep me" },
                dashboardProjection: "overview"
              },
              queue: { readyQueueCount: 9 }
            }
          };
        }
        if (command === "dashboard-service-start") {
          serviceHealthy = true;
          return { ok: true };
        }
        return { ok: false };
      }
    },
    store,
    pollers: stubPollers(),
    log: () => {}
  });

  await coordinator.startForPaint();
  assert.equal(store.getSlice("overview").value?.workspaceStatus?.phaseKey, "146");

  await coordinator.promoteToService();
  assert.equal(coordinator.isServicePathActive(), true);
  // Service snapshot lacked workspaceStatus — promote must restore prior CLI overview.
  assert.equal(store.getSlice("overview").value?.workspaceStatus?.phaseKey, "146");
  assert.equal(store.getSlice("overview").value?.workspaceStatus?.label, "keep me");

  await coordinator.stop();
  await new Promise((resolve) => server.close(resolve));
});
