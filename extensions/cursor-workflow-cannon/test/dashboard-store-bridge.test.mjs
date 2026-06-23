import test from "node:test";
import assert from "node:assert/strict";
import {
  mergeSlicePayloadIntoSummary,
  sliceNamesForDashboardSummaryProjection
} from "../dist/views/dashboard/dashboard-store-bridge.js";
import { lookupDashboardSlice } from "../dist/views/dashboard/dashboard-slice-registry.js";

test("overview slice merge does not clobber queue rollups hydrated from queue slice", () => {
  const queuePayload = lookupDashboardSlice("queue").extractPayload({
    schemaVersion: 1,
    planningGeneration: 42,
    dashboardProjection: "queue",
    readyQueueCount: 83,
    readyExecutionSummary: {
      schemaVersion: 1,
      count: 11,
      phaseBuckets: [{ phaseKey: "126", count: 11, taskIds: ["T100623"] }]
    },
    readyImprovementsSummary: { schemaVersion: 1, count: 0, top: [], phaseBuckets: [] }
  });

  let summary = mergeSlicePayloadIntoSummary({}, "queue", queuePayload);
  assert.equal(summary.readyQueueCount, 83);
  assert.equal(summary.readyExecutionSummary.count, 11);

  const overviewPayload = lookupDashboardSlice("overview").extractPayload({
    schemaVersion: 1,
    planningGeneration: 43,
    dashboardProjection: "overview",
    stateSummary: { proposed: 0, ready: 83, in_progress: 0, completed: 0, total: 1493 },
    readyQueueCount: 0,
    readyExecutionSummary: { schemaVersion: 1, count: 0, top: [], phaseBuckets: [] },
    workspaceStatus: { currentKitPhase: "126", nextKitPhase: "127" }
  });

  summary = mergeSlicePayloadIntoSummary(summary, "overview", overviewPayload);
  assert.equal(summary.stateSummary.ready, 83);
  assert.equal(summary.workspaceStatus.currentKitPhase, "126");
  assert.equal(summary.readyQueueCount, 83, "queue-owned readyQueueCount must survive overview poll");
  assert.equal(summary.readyExecutionSummary.count, 11, "queue-owned rollups must survive overview poll");
});

test("agentActivity dashboard-summary projection maps to the agentActivity slice only", () => {
  assert.deepEqual(sliceNamesForDashboardSummaryProjection("agentActivity"), ["agentActivity"]);
});

test("mergeSlicePayloadIntoSummary preserves prior available data when new payload shows unavailable", () => {
  const summary = {
    subagentRegistry: {
      schemaVersion: 1,
      available: true,
      definitionsCount: 2,
      topOpenSessions: []
    }
  };

  const payloadUnavailable = lookupDashboardSlice("subagents").extractPayload({
    schemaVersion: 1,
    dashboardProjection: "status",
    subagentRegistry: {
      schemaVersion: 1,
      available: false,
      definitionsCount: 0,
      topOpenSessions: []
    }
  });

  const merged = mergeSlicePayloadIntoSummary(summary, "subagents", payloadUnavailable);
  assert.equal(merged.subagentRegistry.available, true);
  assert.equal(merged.subagentRegistry.definitionsCount, 2);
});
