import test from "node:test";
import assert from "node:assert/strict";

import {
  DashboardStartupController,
  DASHBOARD_STARTUP_ENTRYPOINT_INVENTORY
} from "../dist/views/dashboard/dashboard-startup-controller.js";

test("DashboardStartupController inventory lists inventoried startup entrypoints", () => {
  assert.deepEqual([...DASHBOARD_STARTUP_ENTRYPOINT_INVENTORY], [
    "resolve-webview",
    "webview-boot",
    "webview-ready",
    "startup-timeout",
    "startup-refresh",
    "push-update-fallback"
  ]);
});

test("DashboardStartupController owns idle → shell-painted → bootstrap-loading → hydrated → background-hydrating → ready", async () => {
  const phases = [];
  let bootstrapCalls = 0;
  let backgroundCalls = 0;
  const controller = new DashboardStartupController({
    executeBootstrap: async () => {
      bootstrapCalls += 1;
      phases.push(controller.getPhase());
    },
    executeBackgroundHydration: async () => {
      backgroundCalls += 1;
      phases.push(controller.getPhase());
    },
    log: () => {}
  });

  assert.equal(controller.getPhase(), "idle");
  controller.markShellPainted();
  assert.equal(controller.getPhase(), "shell-painted");

  await controller.request("resolve-webview");
  assert.equal(bootstrapCalls, 1);
  assert.equal(backgroundCalls, 1);
  assert.deepEqual(phases, ["bootstrap-loading", "background-hydrating"]);
  assert.equal(controller.getPhase(), "ready");
  assert.equal(controller.isHydrated(), true);
  assert.equal(controller.isReady(), true);
  assert.equal(controller.isBootstrapInFlight(), false);
});

test("DashboardStartupController coalesces concurrent startup triggers behind one bootstrap", async () => {
  let bootstrapCalls = 0;
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const controller = new DashboardStartupController({
    executeBootstrap: async () => {
      bootstrapCalls += 1;
      await gate;
    },
    executeBackgroundHydration: async () => {},
    log: () => {}
  });
  controller.markShellPainted();

  const a = controller.request("resolve-webview");
  const b = controller.request("webview-boot");
  const c = controller.request("startup-timeout");
  assert.equal(bootstrapCalls, 1);
  assert.equal(controller.isBootstrapInFlight(), true);
  assert.equal(controller.getPhase(), "bootstrap-loading");
  release();
  await Promise.all([a, b, c]);
  assert.equal(bootstrapCalls, 1);
  assert.equal(controller.getPhase(), "ready");
  assert.equal(controller.isBootstrapInFlight(), false);
});

test("DashboardStartupController enters error on bootstrap failure and allows retry", async () => {
  let bootstrapCalls = 0;
  const controller = new DashboardStartupController({
    executeBootstrap: async () => {
      bootstrapCalls += 1;
      if (bootstrapCalls === 1) {
        throw new Error("boom");
      }
    },
    executeBackgroundHydration: async () => {},
    log: () => {}
  });
  controller.markShellPainted();
  await controller.request("webview-boot");
  assert.equal(controller.getPhase(), "error");
  assert.equal(controller.isError(), true);
  assert.match(controller.getLastError() ?? "", /boom/);

  await controller.request("startup-timeout");
  assert.equal(bootstrapCalls, 2);
  assert.equal(controller.getPhase(), "ready");
});

test("DashboardStartupController webview-ready after hydrate schedules background only", async () => {
  let bootstrapCalls = 0;
  let backgroundCalls = 0;
  const controller = new DashboardStartupController({
    executeBootstrap: async () => {
      bootstrapCalls += 1;
    },
    executeBackgroundHydration: async () => {
      backgroundCalls += 1;
    },
    log: () => {}
  });
  controller.markShellPainted();
  await controller.request("resolve-webview");
  assert.equal(bootstrapCalls, 1);
  assert.equal(backgroundCalls, 1);

  await controller.request("webview-ready");
  assert.equal(bootstrapCalls, 1);
  assert.equal(backgroundCalls, 1);
  assert.equal(controller.getPhase(), "ready");
});

test("DashboardStartupController startup-refresh forces a new bootstrap after ready", async () => {
  let bootstrapCalls = 0;
  const controller = new DashboardStartupController({
    executeBootstrap: async () => {
      bootstrapCalls += 1;
    },
    executeBackgroundHydration: async () => {},
    log: () => {}
  });
  controller.markShellPainted();
  await controller.request("resolve-webview");
  assert.equal(bootstrapCalls, 1);
  await controller.request("startup-refresh");
  assert.equal(bootstrapCalls, 2);
  assert.equal(controller.getPhase(), "ready");
});

test("DashboardStartupController reset returns to idle", async () => {
  const controller = new DashboardStartupController({
    executeBootstrap: async () => {},
    executeBackgroundHydration: async () => {},
    log: () => {}
  });
  controller.markShellPainted();
  await controller.request("resolve-webview");
  assert.equal(controller.getPhase(), "ready");
  controller.reset();
  assert.equal(controller.getPhase(), "idle");
  assert.equal(controller.isBootstrapInFlight(), false);
});
