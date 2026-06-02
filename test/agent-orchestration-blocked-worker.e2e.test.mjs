import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";

import { prepareKitSqliteDatabase, taskEngineModule, teamExecutionModule } from "../dist/index.js";

async function tmpDir(prefix = "orch-blocked-") {
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

test("blocked worker flow keeps the assignment blocked and denies self-reconcile", async () => {
  const workspace = await tmpDir();
  await seedTask(workspace, "T100658", "Blocked worker orchestration");
  const ctx = sqliteCtx(workspace);

  const assignment = await teamExecutionModule.onCommand(
    {
      name: "register-assignment",
      args: {
        assignmentId: "asg-blocked",
        executionTaskId: "T100658",
        supervisorId: "orchestrator-main",
        workerId: "worker-blocked"
      }
    },
    ctx
  );
  assert.equal(assignment.ok, true);

  const blocker = await teamExecutionModule.onCommand(
    {
      name: "report-assignment-blocker",
      args: {
        assignmentId: "asg-blocked",
        workerId: "worker-blocked",
        reason: "Blocked on unresolved release ordering",
        createDefect: false,
        expectedPlanningGeneration: assignment.data.planningGeneration
      }
    },
    ctx
  );
  assert.equal(blocker.ok, true);
  assert.equal(blocker.data.assignment.status, "blocked");

  const denied = await teamExecutionModule.onCommand(
    {
      name: "reconcile-assignment",
      args: {
        assignmentId: "asg-blocked",
        supervisorId: "worker-blocked",
        checkpoint: {
          schemaVersion: 1,
          mergedSummary: "worker attempted self-reconcile"
        },
        expectedPlanningGeneration: blocker.data.planningGeneration
      }
    },
    ctx
  );
  assert.equal(denied.ok, false);
  assert.equal(denied.code, "assignment-authority-denied");

  const summary = await taskEngineModule.onCommand({ name: "dashboard-summary", args: {} }, ctx);
  assert.equal(summary.ok, true);
  assert.equal(summary.data.agentActivitySummary.source, "derived_only");
  assert.equal(summary.data.agentActivitySummary.needsAttentionCount, 1);
  assert.equal(summary.data.agentActivitySummary.main?.source, "team_execution");
  assert.equal(summary.data.agentActivitySummary.main?.attention.state, "blocked");
});
