import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import Database from "better-sqlite3";

import {
  TaskStore,
  SqliteDualPlanningStore
} from "../dist/index.js";
import {
  buildPhaseDrainDelta,
  parsePhaseDrainDeltaCursor,
  PHASE_DRAIN_DELTA_ASSIGNMENT_LIMIT,
  PHASE_DRAIN_DELTA_TASK_LIMIT
} from "../dist/modules/task-engine/phase-release-orchestration-state-runtime.js";
import { prepareKitSqliteDatabase } from "../dist/core/state/workspace-kit-sqlite.js";
import { insertAssignment, listAssignments } from "../dist/modules/team-execution/assignment-store.js";

function makeTask(id, status, overrides = {}) {
  return {
    id,
    status,
    type: "execution",
    title: `Task ${id}`,
    createdAt: "2026-06-03T20:00:00.000Z",
    updatedAt: "2026-06-03T20:00:00.000Z",
    archived: false,
    phaseKey: "130",
    dependsOn: [],
    ...overrides
  };
}

async function tmpDir(prefix = "phase-drain-delta-") {
  return mkdtemp(path.join(os.tmpdir(), prefix));
}

async function seedSqliteStore(workspace, fn) {
  await mkdir(path.join(workspace, ".workspace-kit", "tasks"), { recursive: true });
  const dual = new SqliteDualPlanningStore(workspace, ".workspace-kit/tasks/workspace-kit.db");
  dual.loadFromDisk();
  const store = TaskStore.forSqliteDual(dual);
  await store.load();
  fn(store, dual.getDatabase());
  await store.save();
}

function readTasksAndAssignments(workspace) {
  const dbPath = path.join(workspace, ".workspace-kit", "tasks", "workspace-kit.db");
  const db = new Database(dbPath);
  try {
    prepareKitSqliteDatabase(db);
    const tasks = db
      .prepare("SELECT id, status, type, title, created_at, updated_at, archived, phase_key, depends_on_json FROM task_engine_tasks ORDER BY id")
      .all()
      .map((row) => ({
        id: String(row.id),
        status: String(row.status),
        type: String(row.type),
        title: String(row.title),
        createdAt: String(row.created_at),
        updatedAt: String(row.updated_at),
        archived: Number(row.archived) === 1,
        phaseKey: typeof row.phase_key === "string" ? row.phase_key : null,
        dependsOn: typeof row.depends_on_json === "string" ? JSON.parse(row.depends_on_json) : []
      }));
    const assignments = listAssignments(db, {});
    return { tasks, assignments };
  } finally {
    db.close();
  }
}

test("parsePhaseDrainDeltaCursor rejects malformed cursors", () => {
  assert.equal(parsePhaseDrainDeltaCursor({ schemaVersion: 1 }), null);
  assert.equal(parsePhaseDrainDeltaCursor({ schemaVersion: 1, phaseKey: "130", planningGeneration: 1 }), null);
});

test("buildPhaseDrainDelta returns full-refresh recommendation for initial and stale cursors", async () => {
  const workspace = await tmpDir();
  await seedSqliteStore(workspace, (store) => {
    store.addTask(makeTask("T100683", "ready"));
  });
  const { tasks, assignments } = readTasksAndAssignments(workspace);

  const initial = buildPhaseDrainDelta({
    workspacePath: workspace,
    effectiveConfig: undefined,
    tasks,
    assignments,
    phaseKey: "130",
    currentKitPhase: "130",
    rolledOut: false,
    planningGeneration: 10
  });

  assert.equal(initial.refreshRecommendation.mode, "full-refresh");
  assert.equal(initial.cursorStatus, "initial");

  const stale = buildPhaseDrainDelta({
    workspacePath: workspace,
    effectiveConfig: undefined,
    tasks,
    assignments,
    phaseKey: "130",
    currentKitPhase: "130",
    rolledOut: false,
    planningGeneration: 10,
    cursor: {
      schemaVersion: 1,
      phaseKey: "129",
      planningGeneration: 9,
      verdict: "tasks-remaining",
      task: { updatedAt: "2026-06-03T20:00:00.000Z", ids: ["T100683"] },
      assignment: { updatedAt: null, ids: [] }
    }
  });

  assert.equal(stale.refreshRecommendation.mode, "full-refresh");
  assert.equal(stale.cursorStatus, "stale");
  assert.equal(stale.cursorStatusReason, "Cursor phase does not match the selected phase.");
});

test("buildPhaseDrainDelta returns only material task and assignment changes with bounded overflow refs", async () => {
  const workspace = await tmpDir();
  await mkdir(path.join(workspace, ".workspace-kit", "tasks"), { recursive: true });
  const dbPath = path.join(workspace, ".workspace-kit", "tasks", "workspace-kit.db");
  const db = new Database(dbPath);
  try {
    prepareKitSqliteDatabase(db);
    const insertTask = db.prepare(
      `INSERT INTO task_engine_tasks (
        id, status, type, title, created_at, updated_at, archived, phase_key, depends_on_json
      ) VALUES (?, ?, 'execution', ?, ?, ?, 0, '130', ?)`
    );
    insertTask.run(
      "T-base",
      "in_progress",
      "Task T-base",
      "2026-06-03T20:00:00.000Z",
      "2026-06-03T20:00:00.000Z",
      "[]"
    );
    for (let index = 0; index < PHASE_DRAIN_DELTA_TASK_LIMIT + 2; index += 1) {
      insertTask.run(
        `T-new-${index}`,
        index % 2 === 0 ? "ready" : "blocked",
        `Task ${index}`,
        `2026-06-03T20:00:${String(10 + index).padStart(2, "0")}.000Z`,
        `2026-06-03T20:00:${String(10 + index).padStart(2, "0")}.000Z`,
        JSON.stringify(index % 2 === 0 ? [] : ["T-missing"])
      );
    }
    insertAssignment(db, {
      id: "asg-base",
      executionTaskId: "T-base",
      supervisorId: "sup",
      workerId: "wrk-base",
      metadata: null,
      now: "2026-06-03T20:00:00.000Z"
    });
    for (let index = 0; index < PHASE_DRAIN_DELTA_TASK_LIMIT + 2; index += 1) {
      insertAssignment(db, {
        id: `asg-${index}`,
        executionTaskId: `T-new-${index}`,
        supervisorId: "sup",
        workerId: `wrk-${index}`,
        metadata: { schemaVersion: 1, packetDigest: `digest-${index}` },
        now: `2026-06-03T20:01:${String(index).padStart(2, "0")}.000Z`
      });
      if (index % 2 === 1) {
        db.prepare("UPDATE kit_team_assignments SET status = 'submitted', updated_at = ? WHERE id = ?").run(
          `2026-06-03T20:02:${String(index).padStart(2, "0")}.000Z`,
          `asg-${index}`
        );
      }
    }
  } finally {
    db.close();
  }

  const { tasks, assignments } = readTasksAndAssignments(workspace);
  const delta = buildPhaseDrainDelta({
    workspacePath: workspace,
    effectiveConfig: undefined,
    tasks,
    assignments,
    phaseKey: "130",
    currentKitPhase: "130",
    rolledOut: false,
    planningGeneration: 11,
    cursor: {
      schemaVersion: 1,
      phaseKey: "130",
      planningGeneration: 10,
      verdict: "tasks-remaining",
      task: { updatedAt: "2026-06-03T20:00:00.000Z", ids: ["T-base"] },
      assignment: { updatedAt: "2026-06-03T20:00:00.000Z", ids: ["asg-base"] }
    }
  });

  assert.equal(delta.refreshRecommendation.mode, "delta");
  assert.equal(delta.cursorAccepted, true);
  assert.equal(delta.changedTasks.length, PHASE_DRAIN_DELTA_TASK_LIMIT);
  assert.equal(delta.overflow.changedTasks.truncated, true);
  assert.equal(delta.overflow.changedTasks.overflowRefs.length > 0, true);
  assert.equal(delta.changedAssignments.length, PHASE_DRAIN_DELTA_ASSIGNMENT_LIMIT);
  assert.equal(delta.overflow.changedAssignments.truncated, true);
  assert.equal(delta.newlyReadyTop.length > 0, true);
  assert.equal(delta.blockedDecisionTop.length > 0, true);
  assert.equal(delta.submittedAssignmentsTop.length > 0, true);
  assert.equal(delta.phasePath.verdict, "blocked");
  assert.equal(delta.nextCursor.phaseKey, "130");
});
