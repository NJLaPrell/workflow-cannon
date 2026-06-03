import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { DashboardDataStore } from "../dist/views/dashboard/dashboard-data-store.js";
import { DashboardRefreshController } from "../dist/views/dashboard/dashboard-refresh-controller.js";
import {
  DashboardPollerCoordinator,
  sliceNamesForMutation
} from "../dist/views/dashboard/dashboard-pollers.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function makeCoordinator(overrides = {}) {
  const store = overrides.store ?? new DashboardDataStore();
  const refreshController =
    overrides?.refreshController ??
    new DashboardRefreshController({
      executeRefresh: async () => {},
      isDeferred: overrides.isDeferred ?? (() => false)
    });
  const runs = [];
  const client = {
    run: overrides.run
      ? overrides.run
      : async (command, args) => {
          runs.push({ command, args });
          return {
            ok: true,
            data: {
              schemaVersion: 7,
              planningGeneration: 42,
              dashboardProjection: args.projection ?? "full"
            }
          };
        }
  };
  const coordinator = new DashboardPollerCoordinator({
    client,
    store,
    refreshController,
    isDeferred: overrides.isDeferred ?? (() => false),
    isSliceVisible: overrides.isSliceVisible ?? (() => true),
    isRefreshPaused: overrides.isRefreshPaused ?? (() => false)
  });
  return { coordinator, store, refreshController, runs, client };
}

test("dashboard-pollers module exports coordinator + mutation helper", () => {
  const src = readFileSync(
    path.join(__dirname, "../src/views/dashboard/dashboard-pollers.ts"),
    "utf8"
  );
  assert.match(src, /class DashboardPollerCoordinator/);
  assert.match(src, /export function sliceNamesForMutation/);
  assert.match(src, /inFlight/);
  assert.match(src, /isStale/);
});

test("DashboardPollerCoordinator start/stop manages poll group intervals", () => {
  const originalSetInterval = globalThis.setInterval;
  const originalClearInterval = globalThis.clearInterval;
  const created = [];
  const cleared = [];

  globalThis.setInterval = (fn, ms) => {
    const handle = originalSetInterval(fn, ms);
    created.push(handle);
    return handle;
  };
  globalThis.clearInterval = (handle) => {
    cleared.push(handle);
    originalClearInterval(handle);
  };

  try {
    const { coordinator } = makeCoordinator();
    assert.equal(created.length, 0);
    coordinator.start();
    assert.equal(created.length, 5, "critical, live, queue, ops, status groups");
    coordinator.stop();
    assert.equal(cleared.length, 5);
    coordinator.start();
    assert.equal(created.length, 10);
    coordinator.stop();
    assert.equal(cleared.length, 10);
  } finally {
    globalThis.setInterval = originalSetInterval;
    globalThis.clearInterval = originalClearInterval;
  }
});

test("DashboardPollerCoordinator single-flights concurrent slice refresh", async () => {
  let inFlight = 0;
  let maxInFlight = 0;
  let resolveRun;
  const gate = new Promise((resolve) => {
    resolveRun = resolve;
  });

  const { coordinator } = makeCoordinator({
    run: async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await gate;
      inFlight -= 1;
      return { ok: true, data: { schemaVersion: 7, planningGeneration: 1 } };
    }
  });

  const first = coordinator.refreshSlicesNow(["overview"]);
  const second = coordinator.refreshSlicesNow(["overview"]);
  assert.equal(maxInFlight, 1, "only one kit run at a time per slice");
  resolveRun?.();
  await Promise.all([first, second]);
});

test("DashboardPollerCoordinator pause and suppression skip kit reads", async () => {
  const { coordinator, runs, refreshController } = makeCoordinator();

  coordinator.pause();
  await coordinator.refreshCriticalNow();
  assert.equal(runs.length, 0, "paused coordinator skips fetch");

  coordinator.resume();
  refreshController.notifyMutationStart();
  await coordinator.refreshSlicesNow(["queue"]);
  assert.equal(runs.length, 0, "suppressed refresh controller skips fetch");

  refreshController.notifyMutationEnd();
  await coordinator.refreshSlicesNow(["queue"]);
  assert.equal(runs.length, 1);
});

test("DashboardPollerCoordinator only polls agentActivity while overview is visible", async () => {
  const runs = [];
  const { coordinator } = makeCoordinator({
    isSliceVisible: () => false,
    run: async (command, args) => {
      runs.push({ command, args });
      return { ok: true, data: { schemaVersion: 7, planningGeneration: 1 } };
    }
  });

  const originalSetInterval = globalThis.setInterval;
  const callbacks = [];
  globalThis.setInterval = (fn, ms) => {
    callbacks.push({ fn, ms });
    return originalSetInterval(fn, ms);
  };

  try {
    coordinator.start();
    assert.equal(callbacks.length, 5);
    const liveTick = callbacks[1];
    liveTick.fn();
    await Promise.resolve();
    assert.equal(runs.length, 0, "live poll is gated when overview is hidden");

    coordinator.setVisibleSections(["overview"]);
    liveTick.fn();
    await Promise.resolve();
    assert.equal(runs.length, 1, "live poll runs when overview is visible");
    assert.equal(runs[0].args.projection, "agentActivity");
  } finally {
    coordinator.stop();
    globalThis.setInterval = originalSetInterval;
  }
});

test("DashboardPollerCoordinator discards stale generation results", async () => {
  const { coordinator, store, refreshController } = makeCoordinator({
    run: async () => {
      refreshController.bumpGeneration();
      return {
        ok: true,
        data: { schemaVersion: 7, planningGeneration: 99, marker: "stale-batch" }
      };
    }
  });

  await coordinator.refreshSlicesNow(["agent"]);
  const slice = store.getSlice("agent");
  assert.notEqual(slice.value?.marker, "stale-batch");
  assert.notEqual(slice.status, "fresh");
});

test("sliceNamesForMutation maps registry staleOnMutationKinds", () => {
  const queueSlices = sliceNamesForMutation("task-queue");
  assert.ok(queueSlices.includes("queue"));
  assert.ok(queueSlices.includes("overview"));
  assert.ok(queueSlices.includes("agentActivity"));
  assert.ok(!queueSlices.includes("cae"));
});
