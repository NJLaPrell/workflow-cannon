import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { DashboardReadPathCoordinator } from "../dist/views/dashboard/dashboard-read-path-coordinator.js";
import { DashboardDataStore } from "../dist/views/dashboard/dashboard-data-store.js";
import { DashboardPollerCoordinator } from "../dist/views/dashboard/dashboard-pollers.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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
