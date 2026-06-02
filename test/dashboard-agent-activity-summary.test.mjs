import test from "node:test";
import assert from "node:assert/strict";
import { buildDashboardAgentActivitySummary } from "../dist/modules/task-engine/dashboard/build-dashboard-agent-activity-summary.js";

test("buildDashboardAgentActivitySummary merges live activity with assignment context", () => {
  const now = "2026-06-02T17:00:00.000Z";
  const summary = buildDashboardAgentActivitySummary({
    now,
    tasks: [{ id: "T100650", title: "Agent activity docs", phaseKey: "128" }],
    liveActivityLeases: [
      {
        schemaVersion: 1,
        activityId: "copilot:session-1",
        agentId: "copilot",
        sessionId: "session-1",
        agentDefinitionId: "orchestrator-main",
        assignmentId: "assign-1",
        kind: "working_task",
        label: "Working on Agent Activity",
        currentStep: null,
        hostHint: "cursor",
        modelTier: "balanced",
        modelHint: null,
        startedAt: now,
        updatedAt: now,
        expiresAt: "2026-06-02T17:05:00.000Z",
        taskId: "T100650",
        command: null,
        phaseKey: "128",
        prNumber: null,
        version: null,
        details: { detail: "live lease" }
      }
    ],
    derivedAgentStatus: {
      schemaVersion: 1,
      source: "derived",
      kind: "ready_task",
      label: "Ready Task T100650",
      confidence: "low",
      updatedAt: now,
      taskId: "T100650",
      phaseKey: "128",
      command: null,
      prNumber: null,
      version: null,
      detail: null
    },
    teamExecution: {
      schemaVersion: 1,
      available: true,
      totalCount: 1,
      activeCount: 1,
      byStatus: { assigned: 1, submitted: 0, blocked: 0, reconciled: 0, cancelled: 0 },
      topActive: [
        {
          id: "assign-1",
          executionTaskId: "T100650",
          executionTaskTitle: "Agent activity docs",
          supervisorId: "phase-128-orchestrator",
          workerId: "codex-worker-01",
          status: "assigned",
          updatedAt: now
        }
      ]
    },
    subagentRegistry: {
      schemaVersion: 1,
      available: true,
      definitionsCount: 1,
      retiredDefinitionsCount: 0,
      openSessionsCount: 1,
      topOpenSessions: [
        {
          sessionId: "session-1",
          definitionId: "codex-worker-01",
          executionTaskId: "T100650",
          status: "open",
          updatedAt: now
        }
      ]
    }
  });

  assert.equal(summary.schemaVersion, 1);
  assert.equal(summary.source, "mixed");
  assert.equal(summary.activeCount, 1);
  assert.equal(summary.staleCount, 0);
  assert.equal(summary.needsAttentionCount, 0);
  assert.ok(summary.main);
  assert.equal(summary.main.rowId, "assignment:assign-1");
  assert.equal(summary.main.source, "live_activity");
  assert.equal(summary.main.work.taskId, "T100650");
  assert.equal(summary.main.refs.assignmentId, "assign-1");
  assert.equal(summary.sourceMap.liveActivityCount, 1);
  assert.equal(summary.sourceMap.teamExecutionCount, 1);
  assert.equal(summary.sourceMap.subagentSessionCount, 1);
  assert.equal(summary.sourceMap.derivedFallbackUsed, false);
  assert.equal(summary.inferredFallback, null);
  assert.equal(summary.active.length, 1);
  assert.equal(summary.needsAttention.length, 0);
});

test("buildDashboardAgentActivitySummary falls back to derived status when no sources exist", () => {
  const now = "2026-06-02T17:00:00.000Z";
  const summary = buildDashboardAgentActivitySummary({
    now,
    tasks: [],
    liveActivityLeases: [],
    derivedAgentStatus: {
      schemaVersion: 1,
      source: "derived",
      kind: "ready_task",
      label: "Ready Task T100650",
      confidence: "low",
      updatedAt: now,
      taskId: "T100650",
      phaseKey: "128",
      command: null,
      prNumber: null,
      version: null,
      detail: null
    },
    teamExecution: {
      schemaVersion: 1,
      available: false,
      totalCount: 0,
      activeCount: 0,
      byStatus: { assigned: 0, submitted: 0, blocked: 0, reconciled: 0, cancelled: 0 },
      topActive: []
    },
    subagentRegistry: {
      schemaVersion: 1,
      available: false,
      definitionsCount: 0,
      retiredDefinitionsCount: 0,
      openSessionsCount: 0,
      topOpenSessions: []
    }
  });

  assert.equal(summary.schemaVersion, 1);
  assert.equal(summary.source, "derived_only");
  assert.equal(summary.main, null);
  assert.equal(summary.activeCount, 0);
  assert.equal(summary.staleCount, 0);
  assert.equal(summary.needsAttentionCount, 0);
  assert.equal(summary.inferredFallback?.kind, "ready_task");
  assert.equal(summary.sourceMap.derivedFallbackUsed, true);
});
