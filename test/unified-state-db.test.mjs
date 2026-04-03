import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtemp, readFile } from "node:fs/promises";

import { UnifiedStateDb } from "../dist/core/state/unified-state-db.js";

test("UnifiedStateDb writes and reads module rows", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "wk-unified-state-db-"));
  const db = new UnifiedStateDb(workspace, ".workspace-kit/state/workspace-kit.db");

  db.setModuleState("planning", 1, { lastPlanId: "W101", mode: "tasks" });
  db.setModuleState("task-engine", 2, { taskCount: 42 });

  const planning = db.getModuleState("planning");
  assert.ok(planning);
  assert.equal(planning.moduleId, "planning");
  assert.equal(planning.stateSchemaVersion, 1);
  assert.equal(planning.state.lastPlanId, "W101");

  const all = db.listModuleStates();
  assert.equal(all.length, 2);
  assert.equal(all[0].moduleId, "planning");
  assert.equal(all[1].moduleId, "task-engine");
});

test("UnifiedStateDb can export snapshot on each commit", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "wk-unified-state-snapshot-"));
  const snapshotRelativePath = ".workspace-kit/state/state-snapshot.json";
  const db = new UnifiedStateDb(workspace, ".workspace-kit/state/workspace-kit.db", {
    exportSnapshotRelativePath: snapshotRelativePath
  });

  db.setModuleState("task-engine", 1, { taskCount: 1 });
  const body = JSON.parse(
    await readFile(path.join(workspace, snapshotRelativePath), "utf8")
  );

  assert.equal(body.schemaVersion, 1);
  assert.equal(Array.isArray(body.modules), true);
  assert.equal(body.modules[0].moduleId, "task-engine");
});
