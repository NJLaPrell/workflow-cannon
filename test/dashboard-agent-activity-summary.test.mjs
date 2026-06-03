import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { prepareKitSqliteDatabase, taskEngineModule, teamExecutionModule } from "../dist/index.js";
import { setAgentActivityLease } from "../dist/modules/task-engine/agent-activity-store.js";
import { buildDashboardAgentActivitySummary } from "../dist/modules/task-engine/dashboard/build-dashboard-agent-activity-summary.js";

async function tmpWorkspace(prefix = "dash-agent-activity-contract-") {
  return mkdtemp(path.join(os.tmpdir(), prefix));
}

async function seedTask(workspacePath, taskId, title) {
  await mkdir(path.join(workspacePath, ".workspace-kit", "tasks"), { recursive: true });
  const db = new Database(path.join(workspacePath, ".workspace-kit", "tasks", "workspace-kit.db"));
  try {
    prepareKitSqliteDatabase(db);
    const now = "2026-06-02T17:00:00.000Z";
    db.prepare(
      `INSERT OR REPLACE INTO task_engine_tasks (id, status, type, title, created_at, updated_at, archived, depends_on_json)
       VALUES (?, 'ready', 'workspace-kit', ?, ?, ?, 0, '[]')`
    ).run(taskId, title, now, now);
  } finally {
    db.close();
  }
}

function sqliteCtx(workspacePath) {
  return {
    runtimeVersion: "0.1",
    workspacePath,
    effectiveConfig: {
      tasks: {
        persistenceBackend: "sqlite",
        sqliteDatabaseRelativePath: ".workspace-kit/tasks/workspace-kit.db"
      }
    }
  };
}

test("buildDashboardAgentActivitySummary merges live activity with assignment context", () => {
  const now = "2026-06-02T17:00:00.000Z";
  const summary = buildDashboardAgentActivitySummary({
    now,
    tasks: [{ id: "T100650", title: "Agent activity docs", status: "in_progress", phaseKey: "128" }],
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
  assert.equal(summary.main.rowId, "row:assign-1");
  assert.equal(summary.main.source, "live_activity");
  assert.equal(summary.main.displayName, "T100650 · Agent activity docs");
  assert.equal(summary.main.work.taskId, "T100650");
  assert.equal(summary.main.work.title, "Agent activity docs");
  assert.equal(summary.main.work.phaseKey, "128");
  assert.equal(summary.main.work.taskStatus, "in_progress");
  assert.equal(summary.main.refs.assignmentId, "assign-1");
  assert.equal(summary.sourceMap.liveActivityCount, 1);
  assert.equal(summary.sourceMap.teamExecutionCount, 1);
  assert.equal(summary.sourceMap.subagentSessionCount, 1);
  assert.equal(summary.sourceMap.derivedFallbackUsed, false);
  assert.equal(summary.inferredFallback, null);
  assert.equal(summary.active.length, 2);
  assert.equal(summary.needsAttention.length, 0);
});

test("buildDashboardAgentActivitySummary keeps stale live leases visible and attentioned", () => {
  const now = "2026-06-02T17:00:00.000Z";
  const summary = buildDashboardAgentActivitySummary({
    now,
    tasks: [{ id: "T100651", title: "Stale lease task", phaseKey: "128" }],
    liveActivityLeases: [
      {
        schemaVersion: 1,
        activityId: "copilot:session-stale",
        agentId: "copilot",
        sessionId: "session-stale",
        agentDefinitionId: null,
        assignmentId: null,
        kind: "working_task",
        label: "Working on stale lease task",
        currentStep: null,
        hostHint: "cursor",
        modelTier: "balanced",
        modelHint: null,
        startedAt: "2026-06-02T16:55:00.000Z",
        updatedAt: "2026-06-02T16:58:15.000Z",
        expiresAt: "2026-06-02T17:30:00.000Z",
        taskId: "T100651",
        command: null,
        phaseKey: "128",
        prNumber: null,
        version: null,
        details: null
      }
    ],
    derivedAgentStatus: {
      schemaVersion: 1,
      source: "derived",
      kind: "ready_task",
      label: "Ready Task T100651",
      confidence: "low",
      updatedAt: now,
      taskId: "T100651",
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

  assert.equal(summary.source, "live_activity");
  assert.equal(summary.activeCount, 0);
  assert.equal(summary.active.length, 1);
  assert.equal(summary.active[0]?.freshness.state, "stale");
  assert.equal(summary.needsAttentionCount, 1);
  assert.equal(summary.needsAttention[0]?.attention.state, "stale");
  assert.equal(summary.main?.attention.state, "stale");
});

test("buildDashboardAgentActivitySummary collapses duplicate live leases by latest update", () => {
  const now = "2026-06-02T17:00:00.000Z";
  const summary = buildDashboardAgentActivitySummary({
    now,
    tasks: [{ id: "T100652", title: "Duplicate lease task", phaseKey: "128" }],
    liveActivityLeases: [
      {
        schemaVersion: 1,
        activityId: "copilot:session-dup",
        agentId: "copilot",
        sessionId: "session-dup",
        agentDefinitionId: null,
        assignmentId: "assign-dup",
        kind: "working_task",
        label: "Older name",
        currentStep: null,
        hostHint: "cursor",
        modelTier: "balanced",
        modelHint: null,
        startedAt: "2026-06-02T16:40:00.000Z",
        updatedAt: "2026-06-02T16:45:00.000Z",
        expiresAt: "2026-06-02T17:30:00.000Z",
        taskId: "T100652",
        command: null,
        phaseKey: "128",
        prNumber: null,
        version: null,
        details: { agentDisplayName: "Older name" }
      },
      {
        schemaVersion: 1,
        activityId: "copilot:session-dup",
        agentId: "copilot",
        sessionId: "session-dup",
        agentDefinitionId: null,
        assignmentId: "assign-dup",
        kind: "working_task",
        label: "Newer name",
        currentStep: null,
        hostHint: "cursor",
        modelTier: "balanced",
        modelHint: null,
        startedAt: "2026-06-02T16:40:00.000Z",
        updatedAt: "2026-06-02T16:59:59.000Z",
        expiresAt: "2026-06-02T17:30:00.000Z",
        taskId: "T100652",
        command: null,
        phaseKey: "128",
        prNumber: null,
        version: null,
        details: { agentDisplayName: "Newest name" }
      }
    ],
    derivedAgentStatus: {
      schemaVersion: 1,
      source: "derived",
      kind: "ready_task",
      label: "Ready Task T100652",
      confidence: "low",
      updatedAt: now,
      taskId: "T100652",
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

  assert.equal(summary.active.length, 1);
  assert.equal(summary.main?.rowId, "row:assign-dup");
  assert.equal(summary.main?.displayName, "T100652 · Duplicate lease task");
  assert.equal(summary.main?.source, "live_activity");
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

test("buildDashboardAgentActivitySummary enriches live rows with task title, phase, and status", () => {
  const now = "2026-06-02T17:00:00.000Z";
  const summary = buildDashboardAgentActivitySummary({
    now,
    tasks: [{ id: "T100653", title: "Projected task title", phaseKey: "129", status: "in_progress" }],
    liveActivityLeases: [
      {
        schemaVersion: 1,
        activityId: "worker:session-enriched",
        agentId: "worker",
        sessionId: "session-enriched",
        agentDefinitionId: null,
        assignmentId: null,
        kind: "working_task",
        label: "Worker activity",
        currentStep: null,
        hostHint: "cursor",
        modelTier: "balanced",
        modelHint: null,
        startedAt: "2026-06-02T16:50:00.000Z",
        updatedAt: "2026-06-02T16:59:59.000Z",
        expiresAt: "2026-06-02T17:30:00.000Z",
        taskId: "T100653",
        command: null,
        phaseKey: null,
        prNumber: null,
        version: null,
        details: null
      }
    ],
    derivedAgentStatus: {
      schemaVersion: 1,
      source: "derived",
      kind: "ready_task",
      label: "Ready Task T100653",
      confidence: "low",
      updatedAt: now,
      taskId: "T100653",
      phaseKey: "129",
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

  assert.equal(summary.active.length, 1);
  assert.equal(summary.main?.displayName, "T100653 · Projected task title");
  assert.equal(summary.main?.work.title, "Projected task title");
  assert.equal(summary.main?.work.phaseKey, "129");
  assert.equal(summary.main?.work.taskStatus, "in_progress");
});

test("buildDashboardAgentActivitySummary preserves live activity rows when task metadata is missing", () => {
  const now = "2026-06-02T17:00:00.000Z";
  const summary = buildDashboardAgentActivitySummary({
    now,
    tasks: [],
    liveActivityLeases: [
      {
        schemaVersion: 1,
        activityId: "worker:session-missing-task",
        agentId: "worker",
        sessionId: "session-missing-task",
        agentDefinitionId: null,
        assignmentId: null,
        kind: "working_task",
        label: "Worker activity",
        currentStep: null,
        hostHint: "cursor",
        modelTier: "balanced",
        modelHint: null,
        startedAt: "2026-06-02T16:50:00.000Z",
        updatedAt: "2026-06-02T16:59:59.000Z",
        expiresAt: "2026-06-02T17:30:00.000Z",
        taskId: "T999999",
        command: null,
        phaseKey: "129",
        prNumber: null,
        version: null,
        details: null
      }
    ],
    derivedAgentStatus: {
      schemaVersion: 1,
      source: "derived",
      kind: "ready_task",
      label: "Ready Task T999999",
      confidence: "low",
      updatedAt: now,
      taskId: "T999999",
      phaseKey: "129",
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

  assert.equal(summary.active.length, 1);
  assert.equal(summary.main?.displayName, "T999999");
  assert.equal(summary.main?.work.taskId, "T999999");
  assert.equal(summary.main?.work.title, "Worker activity");
  assert.equal(summary.main?.work.phaseKey, "129");
  assert.equal(summary.main?.work.taskStatus, null);
  assert.equal(summary.sourceMap.derivedFallbackUsed, false);
});

test("buildDashboardAgentActivitySummary keeps multiple live activities separate and title-enriched", () => {
  const now = "2026-06-02T17:00:00.000Z";
  const summary = buildDashboardAgentActivitySummary({
    now,
    tasks: [
      { id: "T100650", title: "Agent activity docs", status: "in_progress", phaseKey: "128" },
      { id: "T100651", title: "Second live activity", status: "ready", phaseKey: "128" }
    ],
    liveActivityLeases: [
      {
        schemaVersion: 1,
        activityId: "orchestrator-main:session-1",
        agentId: "orchestrator-main",
        sessionId: "session-1",
        agentDefinitionId: "orchestrator-main",
        assignmentId: "assign-1",
        kind: "working_task",
        label: "Working on Agent Activity",
        currentStep: null,
        hostHint: "cursor",
        modelTier: "balanced",
        modelHint: null,
        startedAt: "2026-06-02T16:40:00.000Z",
        updatedAt: "2026-06-02T16:59:59.000Z",
        expiresAt: "2026-06-02T17:30:00.000Z",
        taskId: "T100650",
        command: null,
        phaseKey: "128",
        prNumber: null,
        version: null,
        details: { agentDisplayName: "Orchestrator Main" }
      },
      {
        schemaVersion: 1,
        activityId: "worker-main:session-2",
        agentId: "worker-main",
        sessionId: "session-2",
        agentDefinitionId: null,
        assignmentId: "assign-2",
        kind: "working_task",
        label: "Working on Second Activity",
        currentStep: null,
        hostHint: "cursor",
        modelTier: "balanced",
        modelHint: null,
        startedAt: "2026-06-02T16:41:00.000Z",
        updatedAt: "2026-06-02T17:00:00.000Z",
        expiresAt: "2026-06-02T17:30:00.000Z",
        taskId: "T100651",
        command: null,
        phaseKey: "128",
        prNumber: null,
        version: null,
        details: { displayName: "Worker Main" }
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
  assert.equal(summary.source, "live_activity");
  assert.equal(summary.activeCount, 2);
  assert.equal(summary.active.length, 2);
  assert.deepEqual(
    summary.active.map((row) => row.displayName).sort(),
    ["T100650 · Agent activity docs", "T100651 · Second live activity"]
  );
  assert.deepEqual(
    summary.active.map((row) => row.work.title).sort(),
    ["Agent activity docs", "Second live activity"]
  );
  assert.equal(summary.main?.rowId, "row:assign-1");
  assert.equal(summary.main?.source, "live_activity");
  assert.equal(summary.sourceMap.liveActivityCount, 2);
  assert.equal(summary.sourceMap.derivedFallbackUsed, false);
});

test("buildDashboardAgentActivitySummary merges duplicate sources into a single active row", () => {
  const now = "2026-06-02T17:00:00.000Z";
  const summary = buildDashboardAgentActivitySummary({
    now,
    tasks: [{ id: "T100652", title: "Duplicate source task", status: "ready", phaseKey: "128" }],
    liveActivityLeases: [
      {
        schemaVersion: 1,
        activityId: "copilot:session-dup",
        agentId: "copilot",
        sessionId: "session-dup",
        agentDefinitionId: null,
        assignmentId: "assign-dup",
        kind: "working_task",
        label: "Older label",
        currentStep: null,
        hostHint: "cursor",
        modelTier: "balanced",
        modelHint: null,
        startedAt: "2026-06-02T16:40:00.000Z",
        updatedAt: "2026-06-02T16:45:00.000Z",
        expiresAt: "2026-06-02T17:30:00.000Z",
        taskId: "T100652",
        command: null,
        phaseKey: "128",
        prNumber: null,
        version: null,
        details: { agentDisplayName: "Older name" }
      }
    ],
    derivedAgentStatus: {
      schemaVersion: 1,
      source: "derived",
      kind: "ready_task",
      label: "Ready Task T100652",
      confidence: "low",
      updatedAt: now,
      taskId: "T100652",
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
          id: "assign-dup",
          executionTaskId: "T100652",
          executionTaskTitle: "Assignment title",
          supervisorId: "phase-128-orchestrator",
          workerId: "copilot",
          status: "assigned",
          updatedAt: now
        }
      ]
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
  assert.equal(summary.source, "live_activity");
  assert.equal(summary.activeCount, 0);
  assert.equal(summary.active.length, 1);
  assert.equal(summary.main?.rowId, "row:assign-dup");
  assert.equal(summary.main?.source, "live_activity");
  assert.equal(summary.main?.displayName, "T100652 · Duplicate source task");
  assert.equal(summary.active[0]?.work.title, "Duplicate source task");
  assert.equal(summary.sourceMap.liveActivityCount, 1);
  assert.equal(summary.sourceMap.teamExecutionCount, 1);
});

test("buildDashboardAgentActivitySummary preserves missing task ids and lease phase fallback", () => {
  const now = "2026-06-02T17:00:00.000Z";
  const summary = buildDashboardAgentActivitySummary({
    now,
    tasks: [],
    liveActivityLeases: [
      {
        schemaVersion: 1,
        activityId: "copilot:session-missing",
        agentId: "copilot",
        sessionId: "session-missing",
        agentDefinitionId: null,
        assignmentId: null,
        kind: "working_task",
        label: "Working on missing task",
        currentStep: null,
        hostHint: "cursor",
        modelTier: "balanced",
        modelHint: null,
        startedAt: "2026-06-02T16:55:00.000Z",
        updatedAt: "2026-06-02T16:59:59.000Z",
        expiresAt: "2026-06-02T17:30:00.000Z",
        taskId: "T999999",
        command: null,
        phaseKey: "128",
        prNumber: null,
        version: null,
        details: null
      }
    ],
    derivedAgentStatus: {
      schemaVersion: 1,
      source: "derived",
      kind: "ready_task",
      label: "Ready Task T999999",
      confidence: "low",
      updatedAt: now,
      taskId: "T999999",
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

  assert.equal(summary.activeCount, 1);
  assert.equal(summary.main?.displayName, "T999999");
  assert.equal(summary.main?.work.taskId, "T999999");
  assert.equal(summary.main?.work.title, "Working on missing task");
  assert.equal(summary.main?.work.phaseKey, "128");
  assert.equal(summary.main?.work.taskStatus, null);
  assert.equal(summary.main?.source, "live_activity");
});
