import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";

import { prepareKitSqliteDatabase, taskEngineModule, teamExecutionModule } from "../dist/index.js";

async function tmpDir(prefix = "team-exec-mod-") {
  return mkdtemp(path.join(os.tmpdir(), prefix));
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

async function seedExecutionTask(workspace, taskId, title) {
  const tasksDir = path.join(workspace, ".workspace-kit", "tasks");
  await mkdir(tasksDir, { recursive: true });
  const dbPath = path.join(tasksDir, "workspace-kit.db");
  const db = new Database(dbPath);
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

test("report-assignment-blocker blocks assignment and creates linked defect task", async () => {
  const workspace = await tmpDir();
  const ctx = sqliteCtx(workspace);
  await seedExecutionTask(workspace, "T8601", "Worker task");

  const registered = await teamExecutionModule.onCommand(
    {
      name: "register-assignment",
      args: {
        assignmentId: "asg-8601",
        executionTaskId: "T8601",
        supervisorId: "sup-1",
        workerId: "wrk-1"
      }
    },
    ctx
  );
  assert.equal(registered.ok, true);

  const submitted = await teamExecutionModule.onCommand(
    {
      name: "submit-assignment-handoff",
      args: {
        assignmentId: "asg-8601",
        workerId: "wrk-1",
        handoff: {
          schemaVersion: 1,
          summary: "Attempted implementation but hit runtime blocker",
          evidenceRefs: ["artifacts/repro-8601.log"]
        }
      }
    },
    ctx
  );
  assert.equal(submitted.ok, true);

  const blocker = await teamExecutionModule.onCommand(
    {
      name: "report-assignment-blocker",
      args: {
        assignmentId: "asg-8601",
        workerId: "wrk-1",
        reason: "Planner crashes during synthesis",
        defectTitle: "Planner synthesis crash while executing assignment",
        severity: "high",
        outputRefs: ["artifacts/stacktrace-8601.txt"],
        expectedPlanningGeneration: submitted.data.planningGeneration
      }
    },
    ctx
  );

  assert.equal(blocker.ok, true);
  assert.equal(blocker.code, "assignment-blocker-reported");
  assert.equal(blocker.data.assignment.status, "blocked");
  assert.equal(blocker.data.assignment.blockReason, "Planner crashes during synthesis");
  assert.equal(blocker.data.blockerReport.defectCreated, true);
  assert.deepEqual(blocker.data.blockerReport.outputRefs, [
    "artifacts/stacktrace-8601.txt",
    "artifacts/repro-8601.log"
  ]);

  const defectTaskId = blocker.data.defectTask?.id;
  assert.ok(defectTaskId);

  const fetched = await taskEngineModule.onCommand(
    { name: "get-task", args: { taskId: defectTaskId } },
    ctx
  );
  assert.equal(fetched.ok, true);
  assert.equal(fetched.data.task.type, "improvement");
  assert.equal(fetched.data.task.status, "proposed");
  assert.equal(fetched.data.task.priority, "P1");
  assert.equal(fetched.data.task.metadata.relatedTaskId, "T8601");
  assert.match(fetched.data.task.metadata.issue, /asg-8601/);
});

test("report-assignment-blocker supports blocker-only mode without defect creation", async () => {
  const workspace = await tmpDir();
  const ctx = sqliteCtx(workspace);
  await seedExecutionTask(workspace, "T8602", "Worker task 2");

  const registered = await teamExecutionModule.onCommand(
    {
      name: "register-assignment",
      args: {
        assignmentId: "asg-8602",
        executionTaskId: "T8602",
        supervisorId: "sup-2",
        workerId: "wrk-2"
      }
    },
    ctx
  );
  assert.equal(registered.ok, true);

  const blocker = await teamExecutionModule.onCommand(
    {
      name: "report-assignment-blocker",
      args: {
        assignmentId: "asg-8602",
        workerId: "wrk-2",
        reason: "Awaiting upstream API schema decision",
        createDefect: false,
        expectedPlanningGeneration: registered.data.planningGeneration
      }
    },
    ctx
  );

  assert.equal(blocker.ok, true);
  assert.equal(blocker.code, "assignment-blocker-reported");
  assert.equal(blocker.data.assignment.status, "blocked");
  assert.equal(blocker.data.blockerReport.defectCreated, false);
  assert.equal(blocker.data.defectTask, undefined);
});
