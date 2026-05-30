import test from "node:test";
import assert from "node:assert/strict";

import { DashboardDataStore } from "../dist/views/dashboard/dashboard-data-store.js";
import { formatSliceFreshnessLabel } from "../dist/views/dashboard/dashboard-slice-freshness.js";
import {
  dashboardSliceNamesForMutation,
  lookupDashboardSlice
} from "../dist/views/dashboard/dashboard-slice-registry.js";

test("DashboardDataStore emits updates only when slice value or status changes", () => {
  const store = new DashboardDataStore();
  const updates = [];
  store.subscribe((update) => {
    updates.push(update);
  });

  store.updateSlice("overview", { count: 1 }, { source: "dashboard-summary" });
  assert.equal(updates.length, 1);
  assert.equal(updates[0]?.next.status, "fresh");

  store.updateSlice("overview", { count: 1 }, { source: "dashboard-summary" });
  assert.equal(updates.length, 1, "identical value while fresh should not emit");

  store.markLoading("overview", "dashboard-summary");
  assert.equal(updates.length, 2);
  assert.equal(updates[1]?.next.status, "loading");

  store.updateSlice("overview", { count: 2 }, { source: "dashboard-summary" });
  assert.equal(updates.length, 3);
  assert.equal(updates[2]?.next.status, "fresh");
});

test("DashboardDataStore markError preserves last good slice value", () => {
  const store = new DashboardDataStore();
  store.updateSlice("queue", { ready: 3 }, { source: "dashboard-summary" });
  store.markError("queue", new Error("cli timeout"));

  const slice = store.getSlice("queue");
  assert.equal(slice.status, "error");
  assert.deepEqual(slice.value, { ready: 3 });
  assert.match(String(slice.error), /timeout/);
});

test("DashboardDataStore ingests planningGeneration from slice meta", () => {
  const store = new DashboardDataStore();
  assert.equal(store.getSnapshot().planningGeneration, null);

  store.updateSlice("overview", {}, { planningGeneration: 4226 });
  assert.equal(store.getSnapshot().planningGeneration, 4226);

  store.updateSlice("queue", {}, { planningGeneration: 4227 });
  assert.equal(store.getSnapshot().planningGeneration, 4227);
});

test("DashboardDataStore staleSlices respects registry freshness SLA", () => {
  const store = new DashboardDataStore();
  const now = 10_000;
  store.updateSlice("overview", { ok: true });
  store.getSnapshot().slices.overview.updatedAt = now - 6_000;

  assert.ok(store.staleSlices(now).includes("overview"));
  assert.equal(
    store.isFresh("overview", lookupDashboardSlice("overview")?.freshnessSlaMs ?? 5_000, now),
    false
  );
});

test("formatSliceFreshnessLabel covers operator copy", () => {
  const now = Date.now();
  assert.equal(formatSliceFreshnessLabel({ status: "loading" }), "Refreshing…");
  assert.equal(formatSliceFreshnessLabel({ status: "stale" }), "Stale");
  assert.equal(
    formatSliceFreshnessLabel({ status: "error" }),
    "Failed (showing last good)"
  );
  assert.match(
    formatSliceFreshnessLabel({ status: "fresh", updatedAt: now - 3_000 }, now),
    /^Updated 3s ago$/
  );
});

test("dashboardSliceNamesForMutation maps task-queue to critical slices", () => {
  const names = dashboardSliceNamesForMutation("task-queue");
  assert.ok(names.includes("overview"));
  assert.ok(names.includes("queue"));
  assert.ok(names.includes("phase"));
  assert.ok(names.includes("agent"));
});
