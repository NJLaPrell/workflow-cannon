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

test("mergeSlicePayloadIntoSummary preserves prior agentActivitySummary when new payload is empty", () => {
  const prior = {
    agentActivitySummary: {
      schemaVersion: 1,
      generatedAt: "2026-06-22T00:00:00.000Z",
      source: "live_activity",
      activeCount: 1,
      staleCount: 0,
      needsAttentionCount: 0,
      main: {
        schemaVersion: 1,
        rowId: "main",
        displayName: "Orchestrator",
        role: "orchestrator",
        source: "live_activity",
        sourceConfidence: "high",
        status: "working_task",
        statusLabel: "Working",
        work: {
          taskId: "T1",
          title: "Task",
          command: null,
          phaseKey: "132",
          assignmentId: null,
          sessionId: null,
          currentStep: null
        },
        refs: {
          activityId: "a1",
          agentId: "orchestrator",
          sessionId: null,
          assignmentId: null,
          agentDefinitionId: "orchestration-agent",
          subagentDefinitionId: null,
          taskId: "T1",
          prNumber: null
        },
        freshness: {
          updatedAt: "2026-06-22T00:00:00.000Z",
          startedAt: null,
          expiresAt: null,
          state: "fresh"
        },
        attention: { state: "none", message: null }
      },
      active: [],
      needsAttention: [],
      inferredFallback: null,
      sourceMap: {
        liveActivityCount: 1,
        teamExecutionCount: 0,
        subagentSessionCount: 0,
        derivedFallbackUsed: false
      }
    }
  };

  const payload = lookupDashboardSlice("agentActivity").extractPayload({
    schemaVersion: 1,
    dashboardProjection: "agentActivity",
    agentActivitySummary: null
  });

  const merged = mergeSlicePayloadIntoSummary(prior, "agentActivity", payload);
  assert.equal(merged.agentActivitySummary.main.displayName, "Orchestrator");
});

test("mergeSlicePayloadIntoSummary enriches activity rows from agentTypes registry sessions", () => {
  const prior = {
    agentActivitySummary: {
      schemaVersion: 1,
      generatedAt: "2026-06-22T00:00:00.000Z",
      source: "team_execution",
      activeCount: 1,
      staleCount: 0,
      needsAttentionCount: 0,
      main: {
        schemaVersion: 1,
        rowId: "row-1",
        displayName: "Worker",
        role: "task_worker",
        source: "team_execution",
        sourceConfidence: "medium",
        status: "working_task",
        statusLabel: "Working",
        work: {
          taskId: "T1",
          title: "Task",
          command: null,
          phaseKey: "132",
          assignmentId: "A1",
          sessionId: null,
          currentStep: null
        },
        refs: {
          activityId: null,
          agentId: "worker-1",
          sessionId: null,
          assignmentId: "A1",
          agentDefinitionId: null,
          subagentDefinitionId: null,
          taskId: "T1",
          prNumber: null
        },
        freshness: {
          updatedAt: "2026-06-22T00:00:00.000Z",
          startedAt: null,
          expiresAt: null,
          state: "unknown"
        },
        attention: { state: "none", message: null }
      },
      active: [],
      needsAttention: [],
      inferredFallback: null,
      sourceMap: {
        liveActivityCount: 0,
        teamExecutionCount: 1,
        subagentSessionCount: 0,
        derivedFallbackUsed: false
      }
    }
  };
  const payload = {
    schemaVersion: 7,
    dashboardProjection: "agentTypes",
    subagentRegistry: { schemaVersion: 1, available: false, definitionsCount: 0, retiredDefinitionsCount: 0, openSessionsCount: 0, topOpenSessions: [] },
    agentRegistrySessions: {
      schemaVersion: 1,
      available: true,
      definitionsCount: 1,
      orchestrationReadyDefinitionsCount: 1,
      retiredDefinitionsCount: 0,
      openSessionsCount: 1,
      activeAssignmentsCount: 1,
      linkedOpenSessionsCount: 1,
      hostAvailability: { cursor: 1, vscode: 0, cli: 0, manual: 0, unknown: 0 },
      capabilityAvailability: { required: [], optional: [] },
      currentPointers: { assignment: 1, task: 1, activity: 0 },
      topOpenSessions: [
        {
          sessionId: "sess-1",
          agentId: "worker-1",
          hostHint: "cursor",
          modelTier: "balanced",
          currentAssignmentId: "A1",
          currentTaskId: "T1",
          currentActivityId: null,
          status: "open",
          updatedAt: "2026-06-22T00:00:00.000Z"
        }
      ]
    }
  };
  const merged = mergeSlicePayloadIntoSummary(prior, "agentTypes", payload);
  assert.equal(merged.agentActivitySummary.main.agentProfile.thinkingLevel, "Balanced");
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

test("mergeSlicePayloadIntoSummary preserves prior phase delivery fields when slice zeros them", () => {
  const prior = {
    deliveredPhaseKeys: ["121", "130"],
    rolledOutPhaseKeys: ["113"],
    legacyDeliveredMaxOrdinal: 120,
    phaseReleaseDates: { "130": "2026-06-01T00:00:00.000Z" }
  };
  const payload = lookupDashboardSlice("overview").extractPayload({
    schemaVersion: 7,
    dashboardProjection: "overview",
    deliveredPhaseKeys: [],
    rolledOutPhaseKeys: [],
    legacyDeliveredMaxOrdinal: null,
    phaseReleaseDates: {},
    stateSummary: { ready: 0, proposed: 0, blocked: 0, done: 0 },
    workspaceStatus: {},
    humanGatesSummary: { schemaVersion: 1, count: 0, top: [] },
    approvalQueue: { schemaVersion: 1, count: 0, top: [] },
    taskStateProjection: { schemaVersion: 1, available: false },
    currentPhaseDelivery: { schemaVersion: 2, phaseKey: null }
  });
  const merged = mergeSlicePayloadIntoSummary(prior, "overview", payload);
  assert.deepEqual(merged.deliveredPhaseKeys, ["121", "130"]);
  assert.deepEqual(merged.rolledOutPhaseKeys, ["113"]);
  assert.equal(merged.legacyDeliveredMaxOrdinal, 120);
  assert.equal(merged.phaseReleaseDates["130"], "2026-06-01T00:00:00.000Z");
});
