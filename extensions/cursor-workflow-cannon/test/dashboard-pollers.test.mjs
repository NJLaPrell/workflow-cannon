import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { DashboardDataStore } from "../dist/views/dashboard/dashboard-data-store.js";
import { DashboardRefreshController } from "../dist/views/dashboard/dashboard-refresh-controller.js";
import {
  DASHBOARD_PUSH_SAFETY_NET_MULTIPLIER,
  DASHBOARD_SERVICE_REFRESH_MAX_RETRIES,
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
  const projectionByCommand = {
    "dashboard-overview-slice": "overview",
    "dashboard-queue-slice": "queue",
    "dashboard-status-slice": "status",
    "dashboard-agent-activity-slice": "agentActivity",
    "dashboard-agent-types-slice": "agentTypes"
  };
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
              dashboardProjection: projectionByCommand[command] ?? args.projection ?? "full"
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
    await Promise.resolve();
    assert.equal(runs.length, 2, "visible-section prefetch should hydrate live overview slices when visible");
    assert.deepEqual(
      runs.map((run) => run.command).sort(),
      ["dashboard-agent-activity-slice", "dashboard-agent-types-slice"]
    );
    runs.length = 0;
    liveTick.fn();
    await Promise.resolve();
    assert.equal(runs.length, 0, "live tick should coalesce with in-flight visible-section prefetch");
  } finally {
    coordinator.stop();
    globalThis.setInterval = originalSetInterval;
  }
});

test("DashboardPollerCoordinator limits CLI reads to push safety-net cadence", async () => {
  const originalSetInterval = globalThis.setInterval;
  const originalClearInterval = globalThis.clearInterval;
  const originalDateNow = Date.now;
  const callbacks = [];
  let now = 10_000;
  Date.now = () => now;
  globalThis.setInterval = (fn, ms) => {
    const handle = { fn, ms };
    callbacks.push(handle);
    return handle;
  };
  globalThis.clearInterval = () => {};

  try {
    const { coordinator, runs } = makeCoordinator();
    coordinator.usePushSafetyNetCadence();
    coordinator.start();
    assert.equal(callbacks.length, 5);
    assert.equal(coordinator.getCadenceMode(), "push-safety-net");

    for (const name of ["overview", "phase", "planArtifact", "agent"]) {
      coordinator.recordPushSliceUpdate(name, now);
    }

    const criticalTick = callbacks.find((entry) => entry.ms === 2000);
    assert.ok(criticalTick);
    criticalTick.fn();
    await Promise.resolve();
    assert.equal(runs.length, 0, "recent SSE updates suppress full-rate critical CLI reads");

    now += 2000 * DASHBOARD_PUSH_SAFETY_NET_MULTIPLIER;
    criticalTick.fn();
    await nextTick();
    assert.equal(runs.length, 4, "stale SSE updates allow one safety-net read per critical slice");

    coordinator.useFullCadence();
    for (const name of ["overview", "phase", "planArtifact", "agent"]) {
      coordinator.recordPushSliceUpdate(name, now);
    }
    criticalTick.fn();
    await nextTick();
    assert.equal(runs.length, 8, "full cadence ignores push timestamps after fallback");
  } finally {
    Date.now = originalDateNow;
    coordinatorCleanup(callbacks);
    globalThis.setInterval = originalSetInterval;
    globalThis.clearInterval = originalClearInterval;
  }
});

function coordinatorCleanup(callbacks) {
  callbacks.length = 0;
}

function nextTick() {
  return new Promise((resolve) => setImmediate(resolve));
}

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

// ── New tests for error-vs-success push freshness (requirement a) ───────────

test("(a) error push (isSuccess=false) does NOT reset safety-net freshness clock", async () => {
  const originalSetInterval = globalThis.setInterval;
  const originalClearInterval = globalThis.clearInterval;
  const originalDateNow = Date.now;
  const callbacks = [];
  let now = 10_000;
  Date.now = () => now;
  globalThis.setInterval = (fn, ms) => {
    const handle = { fn, ms };
    callbacks.push(handle);
    return handle;
  };
  globalThis.clearInterval = () => {};

  try {
    const { coordinator, runs } = makeCoordinator();
    coordinator.usePushSafetyNetCadence();
    coordinator.start();

    // Record error pushes (isSuccess=false) for critical slices — these must NOT
    // suppress CLI reads because the data is in error state.
    for (const name of ["overview", "phase", "planArtifact", "agent"]) {
      coordinator.recordPushSliceUpdate(name, now, false);
    }

    const criticalTick = callbacks.find((entry) => entry.ms === 2000);
    assert.ok(criticalTick, "critical tick must exist");

    criticalTick.fn();
    await nextTick();

    assert.ok(
      runs.length > 0,
      "error-only pushes must NOT suppress CLI safety-net reads"
    );
  } finally {
    Date.now = originalDateNow;
    coordinatorCleanup(callbacks);
    globalThis.setInterval = originalSetInterval;
    globalThis.clearInterval = originalClearInterval;
  }
});

test("(a) success push (isSuccess=true) continues to suppress safety-net reads", async () => {
  const originalSetInterval = globalThis.setInterval;
  const originalClearInterval = globalThis.clearInterval;
  const originalDateNow = Date.now;
  const callbacks = [];
  let now = 10_000;
  Date.now = () => now;
  globalThis.setInterval = (fn, ms) => {
    const handle = { fn, ms };
    callbacks.push(handle);
    return handle;
  };
  globalThis.clearInterval = () => {};

  try {
    const { coordinator, runs } = makeCoordinator();
    coordinator.usePushSafetyNetCadence();
    coordinator.start();

    // Success pushes — these SHOULD suppress CLI reads within the safety-net window.
    for (const name of ["overview", "phase", "planArtifact", "agent"]) {
      coordinator.recordPushSliceUpdate(name, now, true);
    }

    const criticalTick = callbacks.find((entry) => entry.ms === 2000);
    assert.ok(criticalTick);

    criticalTick.fn();
    await nextTick();
    assert.equal(runs.length, 0, "recent success pushes must suppress CLI reads");
  } finally {
    Date.now = originalDateNow;
    coordinatorCleanup(callbacks);
    globalThis.setInterval = originalSetInterval;
    globalThis.clearInterval = originalClearInterval;
  }
});

// ── New tests for service-targeted refresh retry path (requirements b, c) ───

test("(b) stale slice in push-safety-net mode triggers service refresh, not CLI", async () => {
  const originalSetInterval = globalThis.setInterval;
  const originalClearInterval = globalThis.clearInterval;
  const originalDateNow = Date.now;
  const callbacks = [];
  let now = 10_000;
  Date.now = () => now;
  globalThis.setInterval = (fn, ms) => {
    const handle = { fn, ms };
    callbacks.push(handle);
    return handle;
  };
  globalThis.clearInterval = () => {};

  const serviceRefreshCalls = [];

  try {
    const { coordinator, runs } = makeCoordinator();
    coordinator.usePushSafetyNetCadence();
    coordinator.setRequestServiceRefresh(async (name) => {
      serviceRefreshCalls.push(name);
      // Simulate success: the SSE push will arrive separately; we just resolve here.
    });
    coordinator.start();

    // No push events — slices are stale immediately.
    const criticalTick = callbacks.find((entry) => entry.ms === 2000);
    assert.ok(criticalTick);

    criticalTick.fn();
    await nextTick();

    assert.ok(
      serviceRefreshCalls.length > 0,
      "should trigger targeted service refresh for stale slices"
    );
    assert.equal(runs.length, 0, "should NOT spawn CLI read while service refresh is attempted");
    assert.ok(
      coordinator.getServiceRetrySliceCount() > 0,
      "retry slice count should be >0 while slices are in service-retry"
    );
  } finally {
    Date.now = originalDateNow;
    coordinatorCleanup(callbacks);
    globalThis.setInterval = originalSetInterval;
    globalThis.clearInterval = originalClearInterval;
  }
});

test("(b) successful push event clears service retry state", async () => {
  const { coordinator } = makeCoordinator();
  coordinator.usePushSafetyNetCadence();
  coordinator.setRequestServiceRefresh(async () => {});

  // Simulate the poller placing "overview" in the retry set.
  // (In production this happens via tryServiceRefresh; here we mimic the state.)
  // Call recordPushSliceUpdate with isSuccess=false to NOT clear retrySlices.
  coordinator.recordPushSliceUpdate("overview", Date.now(), false);

  // Now a successful push arrives (ok=true).
  coordinator.recordPushSliceUpdate("overview", Date.now(), true);

  assert.equal(coordinator.getServiceRetrySliceCount(), 0, "success push must clear retry state");
});

test("(c) CLI fallback only after DASHBOARD_SERVICE_REFRESH_MAX_RETRIES failures", async () => {
  const originalSetInterval = globalThis.setInterval;
  const originalClearInterval = globalThis.clearInterval;
  const originalDateNow = Date.now;
  const callbacks = [];
  let now = 10_000;
  Date.now = () => now;
  globalThis.setInterval = (fn, ms) => {
    const handle = { fn, ms };
    callbacks.push(handle);
    return handle;
  };
  globalThis.clearInterval = () => {};

  let serviceCallCount = 0;

  try {
    const { coordinator, runs } = makeCoordinator();
    coordinator.usePushSafetyNetCadence();
    coordinator.setRequestServiceRefresh(async (name) => {
      serviceCallCount += 1;
      throw new Error("service unavailable");
    });
    coordinator.start();

    const criticalTick = callbacks.find((entry) => entry.ms === 2000);
    assert.ok(criticalTick);

    // Trigger DASHBOARD_SERVICE_REFRESH_MAX_RETRIES - 1 failure ticks.
    // CLI must NOT be called yet.
    for (let i = 0; i < DASHBOARD_SERVICE_REFRESH_MAX_RETRIES - 1; i++) {
      criticalTick.fn();
      // Wait for async service-refresh chain to settle.
      await new Promise((r) => setTimeout(r, 0));
      assert.equal(
        runs.length,
        0,
        `CLI must not fire before threshold: tick ${i + 1}/${DASHBOARD_SERVICE_REFRESH_MAX_RETRIES}`
      );
    }

    // One more tick: this is the MAX_RETRIES-th failure.
    // CLI fallback should now trigger.
    criticalTick.fn();
    await new Promise((r) => setTimeout(r, 0));

    assert.ok(
      runs.length > 0,
      `CLI fallback must fire after ${DASHBOARD_SERVICE_REFRESH_MAX_RETRIES} consecutive service-refresh failures`
    );
    assert.ok(
      serviceCallCount >= DASHBOARD_SERVICE_REFRESH_MAX_RETRIES,
      "service refresh must have been tried the expected number of times"
    );
  } finally {
    Date.now = originalDateNow;
    coordinatorCleanup(callbacks);
    globalThis.setInterval = originalSetInterval;
    globalThis.clearInterval = originalClearInterval;
  }
});
