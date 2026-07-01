import test from "node:test";
import assert from "node:assert/strict";
import {
  mergeDashboardProjectionIntoSummary,
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

test("mergeDashboardProjectionIntoSummary merges every slice for queue projection (ideas + planArtifact)", () => {
  const prior = {
    ideas: { schemaVersion: 1, available: true, totalCount: 2, openCount: 2, top: [{ id: "I1", title: "One" }] },
    planArtifact: {
      schemaVersion: 1,
      current: { planId: "P1", planRef: "ref", version: "1", status: "draft" },
      recent: []
    }
  };
  const queueSummary = {
    schemaVersion: 7,
    dashboardProjection: "queue",
    ideas: { schemaVersion: 1, available: false, totalCount: 0, openCount: 0, top: [] },
    planArtifact: null,
    readyQueueCount: 0,
    readyExecutionSummary: { schemaVersion: 1, count: 0, top: [], phaseBuckets: [] },
    readyImprovementsSummary: { schemaVersion: 1, count: 0, top: [], phaseBuckets: [] }
  };
  const merged = mergeDashboardProjectionIntoSummary(prior, "queue", queueSummary);
  assert.equal(merged.ideas.available, true);
  assert.equal(merged.ideas.top[0].id, "I1");
  assert.equal(merged.planArtifact.current.planId, "P1");
});

test("mergeSlicePayloadIntoSummary preserves prior planArtifact when status slice returns null", () => {
  const prior = {
    planArtifact: {
      schemaVersion: 1,
      current: { planId: "P9", planRef: "ref", version: "3", status: "draft" },
      recent: []
    }
  };
  const payload = lookupDashboardSlice("planArtifact").extractPayload({
    schemaVersion: 1,
    dashboardProjection: "status",
    planArtifact: null
  });
  const merged = mergeSlicePayloadIntoSummary(prior, "planArtifact", payload);
  assert.equal(merged.planArtifact.current.planId, "P9");
});

test("mergeSlicePayloadIntoSummary preserves prior wbsRows when refreshed plan row drops table payload", () => {
  const prior = {
    planArtifact: {
      schemaVersion: 1,
      current: {
        planId: "P1",
        wbsRowCount: 2,
        wbsRows: [{ wbsId: "W1", title: "First row", description: "Do thing" }]
      },
      recent: []
    }
  };
  const payload = lookupDashboardSlice("planArtifact").extractPayload({
    schemaVersion: 1,
    dashboardProjection: "status",
    planArtifact: {
      schemaVersion: 1,
      current: { planId: "P1", wbsRowCount: 2 },
      recent: []
    }
  });
  const merged = mergeSlicePayloadIntoSummary(prior, "planArtifact", payload);
  assert.equal(merged.planArtifact.current.wbsRows[0].title, "First row");
});

test("mergeSlicePayloadIntoSummary preserves prior riskRows when refreshed plan row drops risk table payload", () => {
  const prior = {
    planArtifact: {
      schemaVersion: 1,
      current: {
        planId: "P1",
        riskCount: 2,
        riskRows: [{ id: "R1", description: "Bad thing", severity: "High", mitigation: "Fix it" }]
      },
      recent: []
    }
  };
  const payload = lookupDashboardSlice("planArtifact").extractPayload({
    schemaVersion: 1,
    dashboardProjection: "status",
    planArtifact: {
      schemaVersion: 1,
      current: { planId: "P1", riskCount: 2 },
      recent: []
    }
  });
  const merged = mergeSlicePayloadIntoSummary(prior, "planArtifact", payload);
  assert.equal(merged.planArtifact.current.riskRows[0].id, "R1");
});

test("mergeSlicePayloadIntoSummary preserves prior openQuestionRows when refreshed plan row drops question table payload", () => {
  const prior = {
    planArtifact: {
      schemaVersion: 1,
      current: {
        planId: "P1",
        openQuestionCount: 1,
        openQuestionRows: [{ question: "Who owns finalize?", critical: false }]
      },
      recent: []
    }
  };
  const payload = lookupDashboardSlice("planArtifact").extractPayload({
    schemaVersion: 1,
    dashboardProjection: "status",
    planArtifact: {
      schemaVersion: 1,
      current: { planId: "P1", openQuestionCount: 1 },
      recent: []
    }
  });
  const merged = mergeSlicePayloadIntoSummary(prior, "planArtifact", payload);
  assert.equal(merged.planArtifact.current.openQuestionRows[0].question, "Who owns finalize?");
});

test("mergeSlicePayloadIntoSummary preserves prior tier-2 plan rows when refreshed plan row drops them", () => {
  const prior = {
    planArtifact: {
      count: 1,
      current: {
        planId: "P-tier2",
        goalRows: [{ text: "Keep goals visible" }],
        userStoryRows: [{ id: "US-1", priority: "High", story: "See goals on card" }],
        valueAssessment: { impact: "High", confidence: "Medium", rationale: "Context at a glance" }
      },
      recent: []
    }
  };
  const payload = lookupDashboardSlice("planArtifact").extractPayload({
    schemaVersion: 1,
    dashboardProjection: "planArtifact",
    planArtifact: {
      count: 1,
      current: { planId: "P-tier2", title: "Refreshed without tier-2 rows" },
      recent: []
    }
  });
  const merged = mergeSlicePayloadIntoSummary(prior, "planArtifact", payload);
  assert.equal(merged.planArtifact.current.goalRows[0].text, "Keep goals visible");
  assert.equal(merged.planArtifact.current.userStoryRows[0].id, "US-1");
  assert.equal(merged.planArtifact.current.valueAssessment.impact, "High");
});

test("mergeSlicePayloadIntoSummary preserves prior tier-3 plan rows when refreshed plan row drops them", () => {
  const prior = {
    planArtifact: {
      count: 1,
      current: {
        planId: "P-tier3",
        architectureOverview: "Keep architecture context on card",
        architectureDecisionRows: [{ id: "ADR-1", decision: "Stay additive", rationale: "No breaking changes" }],
        technicalImpact: { systemsTouched: ["dashboard"] },
        testingStrategy: { layers: ["unit"], criticalPaths: ["render"] },
        implementationGuidanceRows: [{ text: "Follow tier rollup pattern" }],
        whatNotToDoRows: [{ text: "No inline mermaid render yet" }],
        uiUxSummary: { hasUiChanges: true, summary: "Collapsible sections" }
      },
      recent: []
    }
  };
  const payload = lookupDashboardSlice("planArtifact").extractPayload({
    schemaVersion: 1,
    dashboardProjection: "planArtifact",
    planArtifact: {
      count: 1,
      current: { planId: "P-tier3", title: "Refreshed without tier-3 rows" },
      recent: []
    }
  });
  const merged = mergeSlicePayloadIntoSummary(prior, "planArtifact", payload);
  assert.equal(merged.planArtifact.current.architectureOverview, "Keep architecture context on card");
  assert.equal(merged.planArtifact.current.architectureDecisionRows[0].id, "ADR-1");
  assert.equal(merged.planArtifact.current.technicalImpact.systemsTouched[0], "dashboard");
  assert.equal(merged.planArtifact.current.testingStrategy.layers[0], "unit");
  assert.equal(merged.planArtifact.current.implementationGuidanceRows[0].text, "Follow tier rollup pattern");
  assert.equal(merged.planArtifact.current.whatNotToDoRows[0].text, "No inline mermaid render yet");
  assert.equal(merged.planArtifact.current.uiUxSummary.summary, "Collapsible sections");
});

test("mergeSlicePayloadIntoSummary preserves WBS linked-task fields when refreshed plan row drops them", () => {
  const prior = {
    planArtifact: {
      count: 1,
      current: {
        planId: "P-wbs-link",
        wbsRowCount: 1,
        wbsRows: [
          {
            wbsId: "WBS-1",
            title: "Row one",
            description: "Do thing",
            dependsOn: "—",
            blocks: "—",
            size: "Medium",
            linkedTaskId: "T77",
            linkedTaskStatus: "Ready"
          }
        ],
        linkedTaskCount: 1,
        executionLinkageRows: [
          { taskId: "T77", wbsId: "WBS-1", taskStatus: "Ready", linkedAt: "2026-05-27", linkedBy: "finalize" }
        ]
      },
      recent: []
    }
  };
  const payload = lookupDashboardSlice("planArtifact").extractPayload({
    schemaVersion: 1,
    dashboardProjection: "planArtifact",
    planArtifact: {
      count: 1,
      current: {
        planId: "P-wbs-link",
        wbsRowCount: 1,
        wbsRows: [
          {
            wbsId: "WBS-1",
            title: "Row one",
            description: "Do thing",
            dependsOn: "—",
            blocks: "—",
            size: "Medium"
          }
        ]
      },
      recent: []
    }
  });
  const merged = mergeSlicePayloadIntoSummary(prior, "planArtifact", payload);
  assert.equal(merged.planArtifact.current.wbsRows[0].linkedTaskId, "T77");
  assert.equal(merged.planArtifact.current.wbsRows[0].linkedTaskStatus, "Ready");
  assert.equal(merged.planArtifact.current.linkedTaskCount, 1);
  assert.equal(merged.planArtifact.current.executionLinkageRows[0].taskId, "T77");
});
