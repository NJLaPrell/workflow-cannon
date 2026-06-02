import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";

import { prepareKitSqliteDatabase, taskEngineModule, teamExecutionModule } from "../dist/index.js";
import { setAgentActivityLease } from "../dist/modules/task-engine/agent-activity-store.js";

async function tmpDir(prefix = "orch-happy-") {
  return mkdtemp(path.join(os.tmpdir(), prefix));
}

async function seedTask(workspace, taskId, title) {
  await mkdir(path.join(workspace, ".workspace-kit", "tasks"), { recursive: true });
  const db = new Database(path.join(workspace, ".workspace-kit", "tasks", "workspace-kit.db"));
  try {
    prepareKitSqliteDatabase(db);
    const now = new Date().toISOString();
    db.prepare(
      `INSERT OR REPLACE INTO task_engine_tasks (id, status, type, title, created_at, updated_at, archived, depends_on_json)
       VALUES (?, 'ready', 'workspace-kit', ?, ?, ?, 0, '[]')`
    ).run(taskId, title, now, now);
  } finally {
    db.close();
  }
}

function sqliteCtx(workspace) {
  return {
    runtimeVersion: "0.1",
    workspacePath: workspace,
    effectiveConfig: {
      tasks: {
        persistenceBackend: "sqlite",
        sqliteDatabaseRelativePath: ".workspace-kit/tasks/workspace-kit.db"
      }
    }
  };
}

test("agent orchestration happy path keeps activity, assignment, and handoff aligned", async () => {
  const workspace = await tmpDir();
  await seedTask(workspace, "T100657", "Orchestration happy path");
  const ctx = sqliteCtx(workspace);

  const registeredDefinition = await taskEngineModule.onCommand(
    {
      name: "register-agent-definition",
      args: {
        agentDefinition: {
          agentDefinitionId: "orchestrator-main",
          displayName: "Orchestrator Main",
          description: "Phase 128 orchestrator",
          role: "orchestrator",
          hostCompatibility: ["cursor", "cli"],
          requiredCapabilities: ["receive_assignment", "run_commands"],
          optionalCapabilities: ["stream_activity"],
          allowedCommands: ["dashboard-summary", "agent-session-snapshot"],
          accessProfileId: "orchestrator_access_v1",
          contextProfileId: "orchestrator_context_v1",
          modelProfileId: "high_reasoning_or_balanced_v1",
          handoffContractId: "handoff.v2",
          activityContractId: "agent-activity.v1",
          retired: false,
          version: 1
        }
      }
    },
    ctx
  );
  assert.equal(registeredDefinition.ok, true);

  const openedSession = await taskEngineModule.onCommand(
    {
      name: "open-agent-session",
      args: {
        sessionId: "session-happy",
        agentId: "orchestrator-main",
        hostHint: "cursor",
        modelTier: "balanced"
      }
    },
    ctx
  );
  assert.equal(openedSession.ok, true);

  const assignment = await teamExecutionModule.onCommand(
    {
      name: "register-assignment",
      args: {
        assignmentId: "asg-happy",
        executionTaskId: "T100657",
        supervisorId: "orchestrator-main",
        workerId: "worker-main"
      }
    },
    ctx
  );
  assert.equal(assignment.ok, true);

  const db = new Database(path.join(workspace, ".workspace-kit", "tasks", "workspace-kit.db"));
  try {
    prepareKitSqliteDatabase(db);
    setAgentActivityLease(db, {
      activityId: "orchestrator-main:session-happy",
      agentId: "orchestrator-main",
      sessionId: "session-happy",
      assignmentId: "asg-happy",
      kind: "working_task",
      label: "Working on T100657",
      taskId: "T100657",
      phaseKey: "128",
      now: "2026-06-02T17:00:00.000Z",
      expiresAt: "2999-01-01T00:00:00.000Z"
    });
  } finally {
    db.close();
  }

  const handoff = await teamExecutionModule.onCommand(
    {
      name: "submit-assignment-handoff",
      args: {
        assignmentId: "asg-happy",
        workerId: "worker-main",
        handoff: {
          schemaVersion: 2,
          assignmentId: "asg-happy",
          agentId: "worker-main",
          status: "completed",
          summary: "Implemented the happy-path orchestration fixture.",
          evidenceRefs: ["test/agent-orchestration-happy-path.e2e.test.mjs"]
        },
        expectedPlanningGeneration: assignment.data.planningGeneration
      }
    },
    ctx
  );
  assert.equal(handoff.ok, true);

  const summary = await taskEngineModule.onCommand({ name: "dashboard-summary", args: {} }, ctx);
  assert.equal(summary.ok, true);
  assert.equal(summary.data.agentActivitySummary.source, "live_activity");
  assert.ok(summary.data.agentActivitySummary.main);
  assert.equal(summary.data.agentActivitySummary.main.source, "live_activity");
  assert.equal(summary.data.agentActivitySummary.main.work.taskId, "T100657");
  assert.equal(summary.data.teamExecution.activeCount, 1);
  assert.equal(summary.data.agentRegistrySessions.openSessionsCount, 1);
});
