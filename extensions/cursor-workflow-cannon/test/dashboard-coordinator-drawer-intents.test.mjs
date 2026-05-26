import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const providerSrc = readFileSync(
  path.join(__dirname, "../src/views/dashboard/DashboardViewProvider.ts"),
  "utf8"
);
const coordinatorSrc = readFileSync(
  path.join(__dirname, "../src/views/dashboard/dashboard-coordinator.ts"),
  "utf8"
);

test("drawerSubmit and drawerCancel route through coordinator.dispatch", () => {
  assert.match(providerSrc, /msg\?\.type === "drawerSubmit"[\s\S]*coordinator\.dispatch/);
  assert.match(providerSrc, /type: "drawer\.submit"/);
  assert.match(providerSrc, /msg\?\.type === "drawerCancel"[\s\S]*coordinator\.dispatch/);
  assert.match(providerSrc, /type: "drawer\.cancel"/);
  assert.doesNotMatch(providerSrc, /drawerSubmit ignored \(already in flight\)/);
});

test("DashboardCoordinator owns drawer mutation holds", () => {
  assert.match(coordinatorSrc, /beginDrawerMutationHold/);
  assert.match(coordinatorSrc, /endDrawerMutationHold/);
  assert.match(coordinatorSrc, /handleDrawerSubmitIntent/);
  assert.match(coordinatorSrc, /flushDrawerSubmitPendingEffects/);
});
