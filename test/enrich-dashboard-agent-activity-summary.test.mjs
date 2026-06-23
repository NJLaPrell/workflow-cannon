import test from "node:test";
import assert from "node:assert/strict";
import { enrichDashboardAgentActivitySummaryWithRegistrySessions } from "../dist/modules/task-engine/dashboard/enrich-dashboard-agent-activity-summary.js";

const baseRow = {
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
};

test("enrichDashboardAgentActivitySummaryWithRegistrySessions fills model tier from open session", () => {
  const summary = {
    schemaVersion: 1,
    generatedAt: "2026-06-22T00:00:00.000Z",
    source: "mixed",
    activeCount: 1,
    staleCount: 0,
    needsAttentionCount: 0,
    main: baseRow,
    active: [],
    needsAttention: [],
    inferredFallback: null,
    sourceMap: {
      liveActivityCount: 0,
      teamExecutionCount: 1,
      subagentSessionCount: 0,
      derivedFallbackUsed: false
    }
  };
  const enriched = enrichDashboardAgentActivitySummaryWithRegistrySessions(summary, {
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
        modelTier: "high_reasoning",
        currentAssignmentId: "A1",
        currentTaskId: "T1",
        currentActivityId: null,
        status: "open",
        updatedAt: "2026-06-22T00:00:00.000Z"
      }
    ]
  });
  assert.equal(enriched.main?.agentProfile?.thinkingLevel, "High reasoning");
  assert.equal(enriched.main?.agentProfile?.agentNameOrId, "worker-1");
});
