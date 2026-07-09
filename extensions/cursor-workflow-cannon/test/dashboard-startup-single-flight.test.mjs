import test from "node:test";
import assert from "node:assert/strict";

import { DashboardStartupController } from "../dist/views/dashboard/dashboard-startup-controller.js";

test("DashboardStartupController coalesces concurrent startup triggers (single-flight)", async () => {
  let calls = 0;
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const controller = new DashboardStartupController({
    executeBootstrap: async () => {
      calls += 1;
      await gate;
    },
    executeBackgroundHydration: async () => {},
    log: () => {}
  });
  controller.markShellPainted();

  const a = controller.request("resolve-webview");
  const b = controller.request("webview-boot");
  const c = controller.request("startup-timeout");

  assert.equal(calls, 1);
  assert.equal(controller.isBootstrapInFlight(), true);
  release();
  await Promise.all([a, b, c]);
  assert.equal(controller.isBootstrapInFlight(), false);
  assert.equal(calls, 1);
});

test("DashboardStartupController clears bootstrap in-flight after rejection", async () => {
  let calls = 0;
  const controller = new DashboardStartupController({
    executeBootstrap: async () => {
      calls += 1;
      if (calls === 1) {
        throw new Error("boom");
      }
    },
    executeBackgroundHydration: async () => {},
    log: () => {}
  });
  controller.markShellPainted();
  await controller.request("webview-boot");
  assert.equal(controller.getPhase(), "error");
  await controller.request("startup-timeout");
  assert.equal(calls, 2);
  assert.equal(controller.getPhase(), "ready");
});
