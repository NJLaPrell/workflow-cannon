import assert from "node:assert/strict";
import { mkdir, mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { ideasModule } from "../dist/index.js";
import { SqliteDualPlanningStore } from "../dist/modules/task-engine/persistence/sqlite-dual-planning.js";

const SQLITE_CFG = { tasks: { persistenceBackend: "sqlite" } };

async function tmpWorkspace() {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "ideas-module-"));
  await mkdir(path.join(workspace, ".workspace-kit", "tasks"), { recursive: true });
  const dual = new SqliteDualPlanningStore(workspace, ".workspace-kit/tasks/workspace-kit.db");
  dual.loadFromDisk();
  return workspace;
}

function ctx(workspace) {
  return { runtimeVersion: "0.1", workspacePath: workspace, effectiveConfig: SQLITE_CFG };
}

test("ideasModule creates and retrieves an idea", async () => {
  const workspace = await tmpWorkspace();

  const created = await ideasModule.onCommand(
    { name: "create-idea", args: { title: "Try planner chat from Ideas", note: "Keep the spark." } },
    ctx(workspace)
  );

  assert.equal(created.ok, true);
  assert.equal(created.code, "idea-created");
  assert.equal(created.data.idea.id, "I001");
  assert.equal(created.data.idea.title, "Try planner chat from Ideas");
  assert.equal(created.data.idea.note, "Keep the spark.");
  assert.equal(created.data.idea.status, "open");
  assert.equal(created.data.idea.sortOrder, 0);
  assert.deepEqual(created.data.idea.previousPlanArtifacts, []);
  assert.equal(created.data.responseSchemaVersion, 1);

  const retrieved = await ideasModule.onCommand(
    { name: "get-idea", args: { ideaId: created.data.idea.id } },
    ctx(workspace)
  );

  assert.equal(retrieved.ok, true);
  assert.equal(retrieved.code, "idea-retrieved");
  assert.deepEqual(retrieved.data.idea, created.data.idea);
});

test("ideasModule increments id and sort order", async () => {
  const workspace = await tmpWorkspace();

  const first = await ideasModule.onCommand(
    { name: "create-idea", args: { title: "First" } },
    ctx(workspace)
  );
  const second = await ideasModule.onCommand(
    { name: "create-idea", args: { title: "Second", status: "planning" } },
    ctx(workspace)
  );

  assert.equal(first.data.idea.id, "I001");
  assert.equal(first.data.idea.sortOrder, 0);
  assert.equal(second.data.idea.id, "I002");
  assert.equal(second.data.idea.sortOrder, 1);
  assert.equal(second.data.idea.status, "planning");
});

test("ideasModule validates create and get args", async () => {
  const workspace = await tmpWorkspace();

  const missingTitle = await ideasModule.onCommand(
    { name: "create-idea", args: { title: "   " } },
    ctx(workspace)
  );
  assert.equal(missingTitle.ok, false);
  assert.equal(missingTitle.code, "invalid-args");

  const invalidGet = await ideasModule.onCommand(
    { name: "get-idea", args: { ideaId: "T100529" } },
    ctx(workspace)
  );
  assert.equal(invalidGet.ok, false);
  assert.equal(invalidGet.code, "invalid-args");

  const missing = await ideasModule.onCommand(
    { name: "get-idea", args: { ideaId: "I999" } },
    ctx(workspace)
  );
  assert.equal(missing.ok, false);
  assert.equal(missing.code, "idea-not-found");
});