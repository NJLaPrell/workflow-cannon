import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { DashboardRefreshController } from "../dist/views/dashboard/dashboard-refresh-controller.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const controllerSrc = readFileSync(
  path.join(__dirname, "../src/views/dashboard/dashboard-refresh-controller.ts"),
  "utf8"
);

test("DashboardRefreshController module exports coalesce + generation API", () => {
  assert.match(controllerSrc, /class DashboardRefreshController/);
  assert.match(controllerSrc, /request\(req: DashboardRefreshRequest\)/);
  assert.match(controllerSrc, /bumpGeneration/);
  assert.match(controllerSrc, /isStale/);
  assert.match(controllerSrc, /notifyMutationStart/);
});

test("DashboardRefreshController coalesces rapid refresh requests", async () => {
  let runs = 0;
  const controller = new DashboardRefreshController({
    executeRefresh: async () => {
      runs += 1;
    },
    isDeferred: () => false,
    debounceMs: 30
  });
  controller.request({ reason: "a" });
  controller.request({ reason: "b" });
  controller.request({ reason: "c" });
  await new Promise((r) => setTimeout(r, 80));
  assert.equal(runs, 1);
});

test("DashboardRefreshController bumps generation on mutation start", () => {
  const controller = new DashboardRefreshController({
    executeRefresh: async () => {},
    isDeferred: () => false
  });
  const before = controller.currentGeneration();
  controller.notifyMutationStart();
  assert.ok(controller.currentGeneration() > before);
  assert.equal(controller.isSuppressed(), true);
});
