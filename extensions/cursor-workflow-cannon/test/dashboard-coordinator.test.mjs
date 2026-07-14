import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { DashboardCoordinator } from "../dist/views/dashboard/dashboard-coordinator.js";
import { DrawerSessionController } from "../dist/views/dashboard/drawer-session.js";
import { DashboardRefreshController } from "../dist/views/dashboard/dashboard-refresh-controller.js";
import { SideEffectBus } from "../dist/views/dashboard/dashboard-side-effects.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test("dashboard-coordinator module defines host snapshot + runMutation", () => {
  const src = readFileSync(
    path.join(__dirname, "../src/views/dashboard/dashboard-coordinator.ts"),
    "utf8"
  );
  assert.match(src, /schemaVersion: 1/);
  assert.match(src, /async runMutation/);
  assert.match(src, /finally/);
});

test("SideEffectBus schedules work on microtask (no sync notify)", () => {
  const src = readFileSync(
    path.join(__dirname, "../src/views/dashboard/dashboard-side-effects.ts"),
    "utf8"
  );
  assert.match(src, /queueMicrotask/);
  assert.doesNotMatch(src, /await this\.deps\.notify/);
});

test("DashboardCoordinator.runMutation holds refresh until fn completes", async () => {
  let holdActive = false;
  let refreshPaused = false;
  const emitted = [];
  const drawer = new DrawerSessionController(() => {});
  const refreshController = new DashboardRefreshController({
    executeRefresh: async () => {},
    isDeferred: () => false
  });
  const sideEffectCalls = [];
  const sideEffects = new SideEffectBus({
    notify: (message) => sideEffectCalls.push(["notify", message]),
    scheduleRefresh: (mode, reason) => sideEffectCalls.push(["refresh", mode, reason]),
    notifyKitChanged: () => sideEffectCalls.push(["kit"])
  });
  const noopDrawerDeps = {
    beginDrawerMutationHold: () => {},
    endDrawerMutationHold: () => {},
    onDrawerSubmit: async () => ({ refreshed: false }),
    onDrawerCancel: async () => {},
    hasActiveDrawerSession: () => false,
    closeDrawer: async () => {},
    resetDrawerSubmitPendingEffects: () => {},
    flushDrawerSubmitPendingEffects: () => {},
    isRefreshBusy: () => false,
    isRefreshDeferred: () => false
  };
  const coordinator = new DashboardCoordinator({
    drawerSession: drawer,
    refreshController,
    client: {
      setRefreshPaused: (paused) => {
        refreshPaused = paused;
      }
    },
    beginMutationHold: () => {
      holdActive = true;
      refreshController.notifyMutationStart();
    },
    endMutationHold: () => {
      holdActive = false;
      refreshController.notifyMutationEnd();
    },
    emitToWebview: (snapshot) => emitted.push(snapshot),
    sideEffects,
    ...noopDrawerDeps
  });

  const result = await coordinator.runMutation("Working…", async () => {
    assert.equal(holdActive, true);
    assert.equal(refreshController.isSuppressed(), true);
    assert.equal(coordinator.isMutationActive(), true);
    assert.equal(emitted.length, 1);
    assert.equal(emitted[0].interaction.mutationActive, true);
    sideEffects.notify("must not run sync during mutation");
    return 42;
  });

  assert.equal(result, 42);
  assert.equal(holdActive, false);
  assert.equal(refreshController.isSuppressed(), false);
  assert.equal(coordinator.isMutationActive(), false);
  assert.ok(emitted.length >= 2);
  assert.equal(emitted.at(-1).interaction.mutationActive, false);

  await new Promise((r) => setTimeout(r, 0));
  assert.ok(sideEffectCalls.some((c) => c[0] === "notify"));
});

test("dashboard-coordinator ignores concurrent drawer.submit while mutationActive", () => {
  const src = readFileSync(
    path.join(__dirname, "../src/views/dashboard/dashboard-coordinator.ts"),
    "utf8"
  );
  assert.match(src, /mutation already active/);
  assert.match(src, /drawerSubmit ignored/);
});

test("DashboardCoordinator.runMutation releases hold when fn throws", async () => {
  let holdActive = false;
  const drawer = new DrawerSessionController(() => {});
  const refreshController = new DashboardRefreshController({
    executeRefresh: async () => {},
    isDeferred: () => false
  });
  const coordinator = new DashboardCoordinator({
    drawerSession: drawer,
    refreshController,
    client: { setRefreshPaused: () => {} },
    beginMutationHold: () => {
      holdActive = true;
      refreshController.notifyMutationStart();
    },
    endMutationHold: () => {
      holdActive = false;
      refreshController.notifyMutationEnd();
    },
    emitToWebview: () => {},
    sideEffects: new SideEffectBus({
      notify: () => {},
      scheduleRefresh: () => {},
      notifyKitChanged: () => {}
    }),
    beginDrawerMutationHold: () => {},
    endDrawerMutationHold: () => {},
    onDrawerSubmit: async () => ({ refreshed: false }),
    onDrawerCancel: async () => {},
    hasActiveDrawerSession: () => false,
    closeDrawer: async () => {},
    resetDrawerSubmitPendingEffects: () => {},
    flushDrawerSubmitPendingEffects: () => {},
    isRefreshBusy: () => false,
    isRefreshDeferred: () => false
  });

  await assert.rejects(
    () =>
      coordinator.runMutation("Fail…", async () => {
        throw new Error("kit failed");
      }),
    /kit failed/
  );
  assert.equal(holdActive, false);
  assert.equal(refreshController.isSuppressed(), false);
});
