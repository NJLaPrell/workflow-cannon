import test from "node:test";
import assert from "node:assert/strict";
import {
  computeQueueContentFingerprint,
  computeQueueSummaryFingerprint
} from "../dist/views/dashboard/dashboard-queue-fingerprint.js";

test("computeQueueSummaryFingerprint is stable for identical rollup data", () => {
  const data = {
    taskStoreLastUpdated: "2026-05-26T12:00:00.000Z",
    proposedImprovementsSummary: {
      count: 2,
      phaseBuckets: [
        {
          phaseKey: "109",
          count: 2,
          taskIds: ["T100601", "T100602"]
        }
      ]
    }
  };
  const a = computeQueueSummaryFingerprint(data);
  const b = computeQueueSummaryFingerprint(data);
  assert.equal(a, b);
  assert.match(a, /pi:proposed-improvement\|109\|2\|T100601,T100602/);
});

test("computeQueueSummaryFingerprint changes when task ids change", () => {
  const base = {
    taskStoreLastUpdated: "2026-05-26T12:00:00.000Z",
    proposedImprovementsSummary: {
      count: 1,
      phaseBuckets: [{ phaseKey: "109", count: 1, taskIds: ["T100601"] }]
    }
  };
  const changed = {
    ...base,
    proposedImprovementsSummary: {
      count: 1,
      phaseBuckets: [{ phaseKey: "109", count: 1, taskIds: ["T100602"] }]
    }
  };
  assert.notEqual(computeQueueSummaryFingerprint(base), computeQueueSummaryFingerprint(changed));
});

test("computeQueueContentFingerprint ignores store timestamp-only changes", () => {
  const a = computeQueueContentFingerprint({
    taskStoreLastUpdated: "2026-05-26T12:00:00.000Z",
    proposedImprovementsSummary: {
      count: 1,
      phaseBuckets: [{ phaseKey: "109", count: 1, taskIds: ["T100601"] }]
    }
  });
  const b = computeQueueContentFingerprint({
    taskStoreLastUpdated: "2026-05-26T12:00:01.000Z",
    proposedImprovementsSummary: {
      count: 1,
      phaseBuckets: [{ phaseKey: "109", count: 1, taskIds: ["T100601"] }]
    }
  });
  assert.equal(a, b);
});

test("computeQueueSummaryFingerprint includes store timestamp", () => {
  const a = computeQueueSummaryFingerprint({ taskStoreLastUpdated: "2026-05-26T12:00:00.000Z" });
  const b = computeQueueSummaryFingerprint({ taskStoreLastUpdated: "2026-05-26T12:00:01.000Z" });
  assert.notEqual(a, b);
});

test("dashboardSummaryNeedsQueueRollupHydration detects overview stub", async () => {
  const mod = await import("../dist/views/dashboard/dashboard-queue-fingerprint.js");
  assert.equal(mod.dashboardSummaryNeedsQueueRollupHydration(null), true);
  assert.equal(mod.dashboardSummaryNeedsQueueRollupHydration({ dashboardProjection: "overview" }), true);
  assert.equal(mod.dashboardSummaryNeedsQueueRollupHydration({ dashboardProjection: "full" }), false);
  assert.equal(mod.dashboardSummaryNeedsQueueRollupHydration({ dashboardProjection: "queue" }), false);
});

test("dashboardSummaryProjectionForSectionPatch prefers queue slice for queue-only patches", async () => {
  const mod = await import("../dist/views/dashboard/dashboard-queue-fingerprint.js");
  assert.equal(mod.dashboardSummaryProjectionForSectionPatch(["queue"]), "queue");
  assert.equal(mod.dashboardSummaryProjectionForSectionPatch(["overview", "queue"]), "queue");
});
