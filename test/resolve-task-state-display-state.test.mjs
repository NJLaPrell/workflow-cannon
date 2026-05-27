import test from "node:test";
import assert from "node:assert/strict";

import { resolveTaskStateDisplayState } from "../dist/modules/task-engine/dashboard/build-dashboard-task-state-projection.js";

test("resolveTaskStateDisplayState maps git missing to offline", () => {
  const r = resolveTaskStateDisplayState({ gitSyncState: "missing", projectionSyncStatus: "fresh" });
  assert.equal(r.displayState, "offline");
  assert.ok(r.remediation);
});

test("resolveTaskStateDisplayState maps conflict and behind", () => {
  assert.equal(
    resolveTaskStateDisplayState({ gitSyncState: "conflict", projectionSyncStatus: "fresh" }).displayState,
    "conflict"
  );
  assert.equal(
    resolveTaskStateDisplayState({ gitSyncState: "behind", projectionSyncStatus: "fresh" }).displayState,
    "behind"
  );
});

test("resolveTaskStateDisplayState maps stale projection to behind", () => {
  const r = resolveTaskStateDisplayState({ gitSyncState: "current", projectionSyncStatus: "stale" });
  assert.equal(r.displayState, "behind");
});

test("resolveTaskStateDisplayState current when git and projection agree", () => {
  const r = resolveTaskStateDisplayState({ gitSyncState: "current", projectionSyncStatus: "fresh" });
  assert.equal(r.displayState, "current");
  assert.equal(r.remediation, null);
});
