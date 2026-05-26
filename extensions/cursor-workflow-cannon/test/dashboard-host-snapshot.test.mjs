import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildHostSnapshotApplierScript,
  buildDrawerStateApplierScript
} from "../dist/views/dashboard/drawer-session.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const coordinatorSrc = readFileSync(
  path.join(__dirname, "../src/views/dashboard/dashboard-coordinator.ts"),
  "utf8"
);
const providerSrc = readFileSync(
  path.join(__dirname, "../src/views/dashboard/DashboardViewProvider.ts"),
  "utf8"
);

test("buildHostSnapshotApplierScript wires drawer + refreshBusy", () => {
  const script = buildHostSnapshotApplierScript();
  assert.match(script, /applyHostSnapshot/);
  assert.match(script, /hostSnapshot/);
  assert.match(script, /refreshBusy/);
});

test("DashboardCoordinator snapshot includes refreshBusy", () => {
  assert.match(coordinatorSrc, /refreshBusy/);
  assert.match(coordinatorSrc, /isRefreshBusy/);
});

test("DashboardViewProvider emits wcHostSnapshot on drawer open", () => {
  assert.match(providerSrc, /postWcDrawerOpen/);
  assert.match(providerSrc, /emitSnapshot/);
});

test("drawer applier no longer references drawerSubmitInFlight", () => {
  const script = buildDrawerStateApplierScript();
  assert.doesNotMatch(script, /drawerSubmitInFlight/);
});
