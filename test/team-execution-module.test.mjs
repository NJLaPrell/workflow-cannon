import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { mkdir, mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { fileURLToPath } from "node:url";

import { prepareKitSqliteDatabase, taskEngineModule, teamExecutionModule } from "../dist/index.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const assignmentMetadataFixture = JSON.parse(
  fs.readFileSync(path.join(root, "fixtures/agent-orchestration/assignment-metadata-task-worker.v1.json"), "utf8")
);

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

function sqliteCtxWithActor(workspace, actor, adminIds = []) {
  return {
    runtimeVersion: "0.1",
    workspacePath: workspace,
    resolvedActor: actor,
    effectiveConfig: {
      tasks: {
        persistenceBackend: "sqlite",
        sqliteDatabaseRelativePath: ".workspace-kit/tasks/workspace-kit.db"
      },
      orchestration: {
        adminIds
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

test("register-assignment persists packet digest and tier recommendation in the response", async () => {
  const workspace = await tmpDir();
  const ctx = sqliteCtx(workspace);
  await seedExecutionTask(workspace, "T8600", "Worker packet task");

  const registered = await teamExecutionModule.onCommand(
    {
      name: "register-assignment",
      args: {
        assignmentId: "asg-8600",
        executionTaskId: "T8600",
        supervisorId: "sup-0",
        workerId: "wrk-0",
        metadata: assignmentMetadataFixture
      }
    },
    ctx
  );

  assert.equal(registered.ok, true);
  assert.equal(registered.data.assignment.metadata.packetDigest.length, 64);
  assert.equal(registered.data.assignment.orchestrationMetadataSummary.packetDigest, registered.data.assignment.metadata.packetDigest);
  assert.equal(registered.data.assignment.orchestrationMetadataSummary.modelTierRecommendation.label, "tier_2");
  assert.equal(
    registered.data.assignment.orchestrationMetadataSummary.modelTierRationale,
    registered.data.assignment.metadata.modelTierRationale
  );
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

test("worker cannot run supervisor-only reconcile action", async () => {
  const workspace = await tmpDir();
  const setupCtx = sqliteCtx(workspace);
  await seedExecutionTask(workspace, "T8603", "Worker task 3");

  const registered = await teamExecutionModule.onCommand(
    {
      name: "register-assignment",
      args: {
        assignmentId: "asg-8603",
        executionTaskId: "T8603",
        supervisorId: "sup-3",
        workerId: "wrk-3"
      }
    },
    setupCtx
  );
  assert.equal(registered.ok, true);

  const submitted = await teamExecutionModule.onCommand(
    {
      name: "submit-assignment-handoff",
      args: {
        assignmentId: "asg-8603",
        workerId: "wrk-3",
        handoff: {
          schemaVersion: 1,
          summary: "Initial handoff"
        },
        expectedPlanningGeneration: registered.data.planningGeneration
      }
    },
    sqliteCtxWithActor(workspace, "wrk-3")
  );
  assert.equal(submitted.ok, true);

  const denied = await teamExecutionModule.onCommand(
    {
      name: "reconcile-assignment",
      args: {
        assignmentId: "asg-8603",
        supervisorId: "wrk-3",
        checkpoint: {
          schemaVersion: 1,
          mergedSummary: "worker self-reconcile attempt"
        },
        expectedPlanningGeneration: submitted.data.planningGeneration
      }
    },
    sqliteCtxWithActor(workspace, "wrk-3")
  );

  assert.equal(denied.ok, false);
  assert.equal(denied.code, "assignment-authority-denied");
  assert.equal(denied.data.lifecycleError.reason, "assignment-role-mismatch");
  assert.equal(denied.data.lifecycleError.action, "reconcile-assignment");
});

test("handoff submit replay returns stable assignment-status-invalid code", async () => {
  const workspace = await tmpDir();
  const setupCtx = sqliteCtx(workspace);
  await seedExecutionTask(workspace, "T8604", "Worker task 4");

  const registered = await teamExecutionModule.onCommand(
    {
      name: "register-assignment",
      args: {
        assignmentId: "asg-8604",
        executionTaskId: "T8604",
        supervisorId: "sup-4",
        workerId: "wrk-4"
      }
    },
    setupCtx
  );
  assert.equal(registered.ok, true);

  const first = await teamExecutionModule.onCommand(
    {
      name: "submit-assignment-handoff",
      args: {
        assignmentId: "asg-8604",
        workerId: "wrk-4",
        handoff: {
          schemaVersion: 1,
          summary: "Completed"
        },
        expectedPlanningGeneration: registered.data.planningGeneration
      }
    },
    sqliteCtxWithActor(workspace, "wrk-4")
  );
  assert.equal(first.ok, true);

  const replay = await teamExecutionModule.onCommand(
    {
      name: "submit-assignment-handoff",
      args: {
        assignmentId: "asg-8604",
        workerId: "wrk-4",
        handoff: {
          schemaVersion: 1,
          summary: "Replay"
        },
        expectedPlanningGeneration: first.data.planningGeneration
      }
    },
    sqliteCtxWithActor(workspace, "wrk-4")
  );

  assert.equal(replay.ok, false);
  assert.equal(replay.code, "assignment-status-invalid");
  assert.equal(replay.data.lifecycleError.reason, "status-not-allowed");
  assert.deepEqual(replay.data.lifecycleError.allowedStatuses, ["assigned"]);
});

test("submit-assignment-handoff accepts handoff v2 payloads", async () => {
  const workspace = await tmpDir();
  const setupCtx = sqliteCtx(workspace);
  await seedExecutionTask(workspace, "T8606", "Worker task 6");

  const registered = await teamExecutionModule.onCommand(
    {
      name: "register-assignment",
      args: {
        assignmentId: "asg-8606",
        executionTaskId: "T8606",
        supervisorId: "sup-6",
        workerId: "wrk-6"
      }
    },
    setupCtx
  );
  assert.equal(registered.ok, true);

  const submitted = await teamExecutionModule.onCommand(
    {
      name: "submit-assignment-handoff",
      args: {
        assignmentId: "asg-8606",
        workerId: "wrk-6",
        handoff: {
          schemaVersion: 2,
          assignmentId: "asg-8606",
          agentId: "wrk-6",
          status: "completed",
          summary: "Worker completed the implementation",
          evidenceRefs: ["artifacts/evidence-8606.txt"]
        },
        expectedPlanningGeneration: registered.data.planningGeneration
      }
    },
    sqliteCtxWithActor(workspace, "wrk-6")
  );

  assert.equal(submitted.ok, true);
  assert.equal(submitted.code, "assignment-handoff-submitted");
  assert.equal(submitted.data.assignment.status, "submitted");
  assert.equal(submitted.data.assignment.handoff.schemaVersion, 2);
  assert.equal(submitted.data.assignment.handoff.assignmentId, "asg-8606");
  assert.equal(submitted.data.assignment.handoff.agentId, "wrk-6");
});

test("reconcile-assignment consumes handoff v2 context and supports decision hints", async () => {
  const workspace = await tmpDir();
  const setupCtx = sqliteCtx(workspace);
  const cases = [
    { assignmentId: "asg-8610", workerId: "wrk-8610", status: "blocked", expectedDecision: "assign_blocker" },
    { assignmentId: "asg-8611", workerId: "wrk-8611", status: "partial", expectedDecision: "request_rework" },
    { assignmentId: "asg-8612", workerId: "wrk-8612", status: "needs_review", expectedDecision: "assign_review" }
  ];

  for (const c of cases) {
    const taskId = `T-${c.assignmentId}`;
    await seedExecutionTask(workspace, taskId, `Worker task ${c.assignmentId}`);

    const registered = await teamExecutionModule.onCommand(
      {
        name: "register-assignment",
        args: {
          assignmentId: c.assignmentId,
          executionTaskId: taskId,
          supervisorId: "sup-8",
          workerId: c.workerId
        }
      },
      setupCtx
    );
    assert.equal(registered.ok, true);

    const submitted = await teamExecutionModule.onCommand(
      {
        name: "submit-assignment-handoff",
        args: {
          assignmentId: c.assignmentId,
          workerId: c.workerId,
          handoff: {
            schemaVersion: 2,
            assignmentId: c.assignmentId,
            agentId: c.workerId,
            status: c.status,
            summary: `handoff-${c.status}`,
            evidenceRefs: [`artifacts/${c.assignmentId}.txt`],
            nextRecommendedAction: "supersede current assignment"
          },
          expectedPlanningGeneration: registered.data.planningGeneration
        }
      },
      sqliteCtxWithActor(workspace, c.workerId)
    );
    assert.equal(submitted.ok, true);

    const reconcileArgs = {
      assignmentId: c.assignmentId,
      supervisorId: "sup-8",
      expectedPlanningGeneration: submitted.data.planningGeneration
    };
    if (c.status !== "blocked") {
      reconcileArgs.checkpoint = {
        schemaVersion: 1,
        mergedSummary: `supervisor-summary-${c.status}`
      };
    }

    const reconciled = await teamExecutionModule.onCommand(
      {
        name: "reconcile-assignment",
        args: reconcileArgs
      },
      sqliteCtxWithActor(workspace, "sup-8")
    );

    assert.equal(reconciled.ok, true);
    assert.equal(reconciled.data.assignment.status, "reconciled");
    assert.equal(reconciled.data.reconciliation.handoffContext.handoffSchemaVersion, 2);
    assert.equal(reconciled.data.reconciliation.handoffContext.handoffStatus, c.status);
    assert.equal(reconciled.data.reconciliation.suggestedDecision, c.expectedDecision);
    assert.equal(reconciled.data.assignment.reconcileCheckpoint.handoffContext.suggestedDecision, c.expectedDecision);
    assert.ok(reconciled.data.assignment.reconcileCheckpoint.handoffContext.suggestedDecisions.includes("cancel_supersede"));

    if (c.status === "blocked") {
      assert.equal(reconciled.data.reconciliation.checkpointDerivedFromHandoff, true);
      assert.equal(reconciled.data.assignment.reconcileCheckpoint.mergedSummary, "handoff-blocked");
    }
  }
});

test("admin actor may execute supervisor lifecycle actions", async () => {
  const workspace = await tmpDir();
  const setupCtx = sqliteCtx(workspace);
  await seedExecutionTask(workspace, "T8605", "Worker task 5");

  const registered = await teamExecutionModule.onCommand(
    {
      name: "register-assignment",
      args: {
        assignmentId: "asg-8605",
        executionTaskId: "T8605",
        supervisorId: "sup-5",
        workerId: "wrk-5"
      }
    },
    setupCtx
  );
  assert.equal(registered.ok, true);

  const submitted = await teamExecutionModule.onCommand(
    {
      name: "submit-assignment-handoff",
      args: {
        assignmentId: "asg-8605",
        workerId: "wrk-5",
        handoff: {
          schemaVersion: 1,
          summary: "Done"
        },
        expectedPlanningGeneration: registered.data.planningGeneration
      }
    },
    sqliteCtxWithActor(workspace, "wrk-5")
  );
  assert.equal(submitted.ok, true);

  const adminCtx = sqliteCtxWithActor(workspace, "admin-1", ["admin-1"]);

  const reconciled = await teamExecutionModule.onCommand(
    {
      name: "reconcile-assignment",
      args: {
        assignmentId: "asg-8605",
        supervisorId: "admin-1",
        checkpoint: {
          schemaVersion: 1,
          mergedSummary: "admin reconciled"
        },
        expectedPlanningGeneration: submitted.data.planningGeneration
      }
    },
    adminCtx
  );
  assert.equal(reconciled.ok, true);
  assert.equal(reconciled.data.assignment.status, "reconciled");
});
