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
  const pollers = {
    start: () => {
      pollersStarted += 1;
    },
    stop: () => {},
    pause: () => {},
    resume: () => {},
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
  assert.equal(coordinator.isServicePathActive(), true);
  assert.equal(pollersStarted, 0);
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
  assert.match(coordinator.getModeBadge().detail ?? "", /unavailable/i);
  await coordinator.stop();
});

test("T100599: forceCliPollingMode keeps CLI path for session", async () => {
  const store = new DashboardDataStore();
  const pollers = {
    start: () => {},
    stop: () => {},
    pause: () => {},
    resume: () => {},
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

test("T100599: provider wires DashboardReadPathCoordinator", () => {
  const providerSrc = readFileSync(
    path.join(__dirname, "../src/views/dashboard/DashboardViewProvider.ts"),
    "utf8"
  );
  assert.match(providerSrc, /DashboardReadPathCoordinator/);
  assert.match(providerSrc, /readPath\.start\(\)/);
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
