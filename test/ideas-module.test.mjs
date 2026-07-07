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
  assert.match(created.data.idea.linkedPlanArtifact, /^plan-artifact:[0-9a-f-]{36}$/);
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

test("ideasModule lists and filters ideas by status", async () => {
  const workspace = await tmpWorkspace();

  await ideasModule.onCommand({ name: "create-idea", args: { title: "First", status: "planned" } }, ctx(workspace));
  await ideasModule.onCommand({ name: "create-idea", args: { title: "Second" } }, ctx(workspace));

  const all = await ideasModule.onCommand({ name: "list-ideas", args: {} }, ctx(workspace));
  assert.equal(all.ok, true);
  assert.equal(all.code, "ideas-listed");
  assert.deepEqual(
    all.data.ideas.map((idea) => idea.title),
    ["First", "Second"]
  );
  assert.equal(all.data.count, 2);

  const open = await ideasModule.onCommand({ name: "list-ideas", args: { status: "open" } }, ctx(workspace));
  assert.equal(open.ok, true);
  assert.deepEqual(
    open.data.ideas.map((idea) => idea.title),
    ["Second"]
  );
});

test("ideasModule updates and clears optional idea fields", async () => {
  const workspace = await tmpWorkspace();

  const created = await ideasModule.onCommand(
    { name: "create-idea", args: { title: "Original", note: "Draft", linkedPlanArtifact: "plan-old" } },
    ctx(workspace)
  );
  const updated = await ideasModule.onCommand(
    {
      name: "update-idea",
      args: {
        ideaId: created.data.idea.id,
        title: "Updated",
        note: null,
        status: "planning",
        linkedPlanArtifact: "plan-new",
        previousPlanArtifacts: ["plan-old"]
      }
    },
    ctx(workspace)
  );

  assert.equal(updated.ok, true);
  assert.equal(updated.code, "idea-updated");
  assert.equal(updated.data.idea.title, "Updated");
  assert.equal(updated.data.idea.note, undefined);
  assert.equal(updated.data.idea.status, "planning");
  assert.equal(updated.data.idea.linkedPlanArtifact, "plan-new");
  assert.deepEqual(updated.data.idea.previousPlanArtifacts, ["plan-old"]);
  assert.equal(updated.data.idea.createdAt, created.data.idea.createdAt);
  assert.notEqual(updated.data.idea.updatedAt, created.data.idea.updatedAt);
});

test("ideasModule deletes ideas", async () => {
  const workspace = await tmpWorkspace();

  const created = await ideasModule.onCommand({ name: "create-idea", args: { title: "Remove me" } }, ctx(workspace));
  const deleted = await ideasModule.onCommand(
    { name: "delete-idea", args: { ideaId: created.data.idea.id } },
    ctx(workspace)
  );
  const listed = await ideasModule.onCommand({ name: "list-ideas", args: {} }, ctx(workspace));

  assert.equal(deleted.ok, true);
  assert.equal(deleted.code, "idea-deleted");
  assert.equal(deleted.data.idea.title, "Remove me");
  assert.equal(deleted.data.deleted, true);
  assert.deepEqual(listed.data.ideas, []);
});

test("ideasModule reorders full idea order", async () => {
  const workspace = await tmpWorkspace();

  const first = await ideasModule.onCommand({ name: "create-idea", args: { title: "First" } }, ctx(workspace));
  const second = await ideasModule.onCommand({ name: "create-idea", args: { title: "Second" } }, ctx(workspace));
  const third = await ideasModule.onCommand({ name: "create-idea", args: { title: "Third" } }, ctx(workspace));

  const reordered = await ideasModule.onCommand(
    { name: "reorder-ideas", args: { ideaIds: [third.data.idea.id, first.data.idea.id, second.data.idea.id] } },
    ctx(workspace)
  );

  assert.equal(reordered.ok, true);
  assert.equal(reordered.code, "ideas-reordered");
  assert.deepEqual(
    reordered.data.ideas.map((idea) => [idea.id, idea.sortOrder]),
    [
      [third.data.idea.id, 0],
      [first.data.idea.id, 1],
      [second.data.idea.id, 2]
    ]
  );
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

  const invalidList = await ideasModule.onCommand(
    { name: "list-ideas", args: { status: "paused" } },
    ctx(workspace)
  );
  assert.equal(invalidList.ok, false);
  assert.equal(invalidList.code, "invalid-args");

  const invalidUpdate = await ideasModule.onCommand(
    { name: "update-idea", args: { ideaId: "I999", title: "   " } },
    ctx(workspace)
  );
  assert.equal(invalidUpdate.ok, false);
  assert.equal(invalidUpdate.code, "invalid-args");

  const invalidDelete = await ideasModule.onCommand(
    { name: "delete-idea", args: { ideaId: "T100530" } },
    ctx(workspace)
  );
  assert.equal(invalidDelete.ok, false);
  assert.equal(invalidDelete.code, "invalid-args");

  const invalidReorder = await ideasModule.onCommand(
    { name: "reorder-ideas", args: { ideaIds: ["I001"] } },
    ctx(workspace)
  );
  assert.equal(invalidReorder.ok, false);
  assert.equal(invalidReorder.code, "invalid-args");
});