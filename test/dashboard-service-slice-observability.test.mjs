import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DashboardSliceObservabilityTracker,
  buildDashboardServiceHealthPayload
} from "../dist/services/dashboard-service/slice-observability.js";

describe("dashboard slice observability", () => {
  it("tracks success timing and summary", () => {
    const tracker = new DashboardSliceObservabilityTracker();
    tracker.markLoading("overview", "dashboard-summary");
    tracker.markSuccess("overview", "dashboard-summary");
    const records = tracker.getSliceRecords();
    assert.equal(records.overview.status, "fresh");
    assert.equal(records.overview.refreshCount, 1);
    assert.equal(typeof records.overview.lastDurationMs, "number");
    const summary = tracker.summarize();
    assert.equal(summary.slowestSlice, "overview");
    assert.equal(summary.failingSlices.length, 0);
  });

  it("records failing slices in summary", () => {
    const tracker = new DashboardSliceObservabilityTracker();
    tracker.markLoading("queue", "dashboard-summary");
    tracker.markError("queue", "dashboard-summary", "boom");
    const summary = tracker.summarize();
    assert.deepEqual(summary.failingSlices, ["queue"]);
    assert.equal(summary.totalErrors, 1);
  });

  it("buildDashboardServiceHealthPayload includes slice map", () => {
    const payload = buildDashboardServiceHealthPayload({
      uptimeMs: 100,
      generation: 2,
      planningGeneration: 5,
      sseClients: 0,
      sliceCount: 1,
      sliceObservability: {
        overview: {
          status: "fresh",
          lastRefreshAt: "2026-05-30T00:00:00.000Z",
          lastDurationMs: 42,
          avgDurationMs: 42,
          refreshCount: 1,
          errorCount: 0,
          lastError: null,
          source: "dashboard-summary"
        }
      },
      summary: {
        failingSlices: [],
        slowestSlice: "overview",
        slowestDurationMs: 42,
        totalRefreshes: 1,
        totalErrors: 0
      }
    });
    assert.equal(payload.ok, true);
    assert.equal(payload.slices.overview.lastDurationMs, 42);
    assert.equal(payload.summary.slowestSlice, "overview");
  });
});
