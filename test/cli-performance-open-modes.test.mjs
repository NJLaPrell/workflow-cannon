import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import fs from "node:fs/promises";

import {
  openPlanningStoresFull,
  openPlanningStoresReadOnly,
  openPlanningStoresForDashboardSlice
} from "../dist/modules/task-engine/persistence/planning-open.js";

async function createDoctorFixture(rootDir) {
  const workspaceKitDir = path.join(rootDir, ".workspace-kit");
  const schemasDir = path.join(rootDir, "schemas");
  await fs.mkdir(workspaceKitDir, { recursive: true });
  await fs.mkdir(schemasDir, { recursive: true });

  await fs.writeFile(
    path.join(rootDir, "workspace-kit.profile.json"),
    JSON.stringify(
      {
        project: { name: "fixture-project" },
        packageManager: "pnpm",
        commands: { test: "pnpm test", lint: "pnpm lint", typecheck: "pnpm check" },
        github: { defaultBranch: "main" }
      },
      null,
      2
    )
  );

  await fs.writeFile(
    path.join(schemasDir, "workspace-kit-profile.schema.json"),
    JSON.stringify({ type: "object" }, null, 2)
  );

  await fs.writeFile(
    path.join(workspaceKitDir, "manifest.json"),
    JSON.stringify({ schemaVersion: 1 }, null, 2)
  );

  await fs.writeFile(
    path.join(workspaceKitDir, "owned-paths.json"),
    JSON.stringify({ schemaVersion: 1, ownedPaths: [] }, null, 2)
  );

  const stamp = {
    schemaVersion: 1,
    nodeExecutable: process.execPath,
    nodeVersion: "v22.11.0",
    arch: process.arch,
    platform: process.platform,
    abi: process.versions.modules,
    packageRoot: process.cwd(),
    checkedAt: "2026-05-12T00:00:00.000Z"
  };
  await fs.writeFile(path.join(workspaceKitDir, "runtime.json"), JSON.stringify(stamp, null, 2));
  await fs.mkdir(path.join(workspaceKitDir, "bin"), { recursive: true });
  await fs.writeFile(path.join(workspaceKitDir, "bin", "wk"), "# dummy launcher", "utf8");

  const tasksDir = path.join(workspaceKitDir, "tasks");
  await fs.mkdir(tasksDir, { recursive: true });
  const dbPath = path.join(tasksDir, "workspace-kit.db");
  const db = new Database(dbPath);
  db.exec(`CREATE TABLE IF NOT EXISTS workspace_planning_state (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    task_store_json TEXT NOT NULL,
    planning_generation INTEGER NOT NULL DEFAULT 0
  );`);
  const emptyTaskDoc = JSON.stringify({
    schemaVersion: 1,
    tasks: [],
    transitionLog: [],
    mutationLog: [],
    lastUpdated: new Date().toISOString()
  });
  db.prepare("INSERT OR REPLACE INTO workspace_planning_state (id, task_store_json, planning_generation) VALUES (1, ?, 0)").run(
    emptyTaskDoc
  );
  db.close();
}

test("T4 Split Planning Store Open Modes", async (t) => {
  const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), "wk-cli-perf-t4-"));
  await createDoctorFixture(fixtureRoot);

  const ctx = {
    runtimeVersion: "0.1",
    workspacePath: fixtureRoot,
    effectiveConfig: {
      kit: {
        taskStoreRelativePath: ".workspace-kit/tasks/workspace-kit.db"
      }
    }
  };

  // Step 1: Write a task using Full mode
  let fullStores = await openPlanningStoresFull(ctx);
  assert.equal(fullStores.sqliteDual.readOnly, false, "Full store should not be read-only");
  
  const initialTaskCount = fullStores.taskStore.getAllTasks().length;
  assert.equal(initialTaskCount, 0, "Initially task store should be empty");

  const testTask = {
    id: "T123",
    status: "proposed",
    type: "feature",
    title: "Test Task for Open Modes",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    archived: false,
    priority: "normal",
    phase: "Phase 1",
    phaseKey: "1",
    summary: "Testing open modes",
    description: "Validate read_only and slice behaviors",
    features: []
  };

  fullStores.taskStore.addTask(testTask);
  fullStores.taskStore.addEvidence({
    transitionId: "tx-1",
    taskId: "T123",
    fromState: null,
    toState: "proposed",
    action: "create",
    guardResults: [],
    dependentsUnblocked: [],
    timestamp: new Date().toISOString()
  });

  await fullStores.taskStore.save();
  fullStores.sqliteDual.closeDatabase();

  // Step 2: Open as ReadOnly and verify behavior
  const readOnlyStores = await openPlanningStoresReadOnly(ctx);
  assert.equal(readOnlyStores.sqliteDual.readOnly, true, "ReadOnly store should be read-only");
  
  const loadedTasks = readOnlyStores.taskStore.getAllTasks();
  assert.equal(loadedTasks.length, 1, "Task should be loaded");
  assert.equal(loadedTasks[0].id, "T123", "Correct task should be loaded");

  // Verify writes fail on readonly DB connection
  assert.throws(() => {
    readOnlyStores.sqliteDual.getDatabase().prepare(
      "INSERT INTO workspace_planning_state (id, task_store_json) VALUES (2, 'fail')"
    ).run();
  }, /readonly/i, "Writing to readonly store should throw SQLite readonly error");

  readOnlyStores.sqliteDual.closeDatabase();

  // Step 3: Open for slice 'cae' (should skip tasks hydration)
  const caeSliceStores = await openPlanningStoresForDashboardSlice(ctx, "cae");
  assert.equal(caeSliceStores.sqliteDual.readOnly, true, "Dashboard slice store should be read-only");
  assert.equal(caeSliceStores.taskStore.getAllTasks().length, 0, "cae slice should skip tasks hydration");
  caeSliceStores.sqliteDual.closeDatabase();

  // Step 4: Open for slice 'checkpoints' (should skip logs but keep tasks hydration)
  const checkpointsSliceStores = await openPlanningStoresForDashboardSlice(ctx, "checkpoints");
  assert.equal(checkpointsSliceStores.sqliteDual.readOnly, true, "checkpoints slice should be read-only");
  assert.equal(checkpointsSliceStores.taskStore.getAllTasks().length, 1, "checkpoints slice should keep tasks");
  assert.equal(checkpointsSliceStores.taskStore.getTransitionLog().length, 0, "checkpoints slice should skip transition log parsing");
  checkpointsSliceStores.sqliteDual.closeDatabase();

  // Cleanup
  await rm(fixtureRoot, { recursive: true, force: true });
});
