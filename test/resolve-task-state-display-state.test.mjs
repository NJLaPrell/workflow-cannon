import test from "node:test";
import assert from "node:assert/strict";

import { resolveTaskStateDisplayState } from "../dist/modules/task-engine/dashboard/build-dashboard-task-state-projection.js";

test("resolveTaskStateDisplayState maps git missing to offline", () => {
  const r = resolveTaskStateDisplayState({
    gitSyncState: "missing",
    projectionSyncStatus: "fresh",
    localProjection: "offline"
  });
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

test("resolveTaskStateDisplayState maps pending outbox to syncing", () => {
  const r = resolveTaskStateDisplayState({
    gitSyncState: "current",
    projectionSyncStatus: "fresh",
    localProjection: "fresh",
    outbox: {
      pending: 2,
      publishing: 0,
      failed: 0,
      conflict: 0,
      oldestPendingAgeMs: 500,
      latestPublishedAt: null
    },
    recommendedAction: "wait"
  });
  assert.equal(r.displayState, "syncing");
  assert.ok(r.remediation?.includes("no manual recovery"));
});

test("resolveTaskStateDisplayState maps failed outbox to conflict", () => {
  const r = resolveTaskStateDisplayState({
    gitSyncState: "current",
    projectionSyncStatus: "fresh",
    localProjection: "fresh",
    outbox: {
      pending: 0,
      publishing: 0,
      failed: 1,
      conflict: 0,
      oldestPendingAgeMs: 0,
      latestPublishedAt: null
    },
    recommendedAction: "resolve-conflict"
  });
  assert.equal(r.displayState, "conflict");
  assert.ok(r.remediation?.includes("Run recovery"));
});

test("resolveTaskStateDisplayState current when git and projection agree", () => {
  const r = resolveTaskStateDisplayState({ gitSyncState: "current", projectionSyncStatus: "fresh" });
  assert.equal(r.displayState, "current");
  assert.equal(r.remediation, null);
});
