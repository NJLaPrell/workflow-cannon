import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { mkdtemp, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";

import { runRebuildTaskStateCache } from "../dist/modules/task-engine/persistence/rebuild-task-state-cache-runtime.js";
import { runApplyTaskStateEvents } from "../dist/modules/task-engine/persistence/apply-task-state-events-runtime.js";
import { DEFAULT_TASK_STATE_EVENT_LOG_RELATIVE } from "../dist/modules/task-engine/task-state-events/task-state-event-log-io.js";
import { readTaskStateProjectionMeta } from "../dist/modules/task-engine/persistence/task-state-projection-meta-store.js";

const fixturesDir = path.join(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."),
  "src/modules/task-engine/task-state-events/fixtures"
);

async function setupWorkspaceWithLog(events) {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "wk-apply-events-"));
  const logAbs = path.join(workspace, DEFAULT_TASK_STATE_EVENT_LOG_RELATIVE);
  fs.mkdirSync(path.dirname(logAbs), { recursive: true });
  await writeFile(logAbs, `${events.map((e) => JSON.stringify(e)).join("\n")}\n`, "utf8");
  const dbPath = path.join(workspace, ".workspace-kit", "tasks", "workspace-kit.db");
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  const { prepareKitSqliteDatabase } = await import("../dist/core/state/workspace-kit-sqlite.js");
  prepareKitSqliteDatabase(db);
  db.close();
  return { workspace, logAbs, dbPath };
}

test("apply-task-state-events no-ops when projection is current", async () => {
  const stream = JSON.parse(fs.readFileSync(path.join(fixturesDir, "replay-stream-lifecycle.v1.json"), "utf8"));
  const { workspace } = await setupWorkspaceWithLog(stream);
  const ctx = { workspacePath: workspace, config: {} };

  const rebuild = await runRebuildTaskStateCache(ctx, {});
  assert.equal(rebuild.ok, true);

  const genBefore = rebuild.data.planningGeneration;
  const apply1 = await runApplyTaskStateEvents(ctx, {});
  assert.equal(apply1.ok, true);
  assert.equal(apply1.code, "task-state-events-already-current");
  assert.equal(apply1.data.tailEventCount, 0);

  const apply2 = await runApplyTaskStateEvents(ctx, {});
  assert.equal(apply2.code, "task-state-events-already-current");
  assert.equal(apply2.data.appliedSequence, 4);

  const db = new Database(path.join(workspace, ".workspace-kit", "tasks", "workspace-kit.db"));
  try {
    const meta = readTaskStateProjectionMeta(db);
    assert.equal(meta?.appliedSequence, 4);
    const genAfter = db
      .prepare("SELECT planning_generation AS g FROM workspace_planning_state WHERE id = 1")
      .get().g;
    assert.equal(genAfter, genBefore);
  } finally {
    db.close();
  }
});

test("apply-task-state-events applies tail in order and bumps projection once", async () => {
  const stream = JSON.parse(fs.readFileSync(path.join(fixturesDir, "replay-stream-lifecycle.v1.json"), "utf8"));
  const { workspace } = await setupWorkspaceWithLog(stream.slice(0, 3));
  const ctx = { workspacePath: workspace, config: {} };

  const rebuild = await runRebuildTaskStateCache(ctx, {});
  assert.equal(rebuild.ok, true);
  assert.equal(rebuild.data.appliedSequence, 3);

  const tailEvent = {
    ...stream[3],
    sequence: 4,
    parentEventId: stream[2].eventId
  };
  const logAbs = path.join(workspace, DEFAULT_TASK_STATE_EVENT_LOG_RELATIVE);
  const existing = fs.readFileSync(logAbs, "utf8");
  await writeFile(logAbs, `${existing}${JSON.stringify(tailEvent)}\n`, "utf8");

  const apply = await runApplyTaskStateEvents(ctx, {});
  assert.equal(apply.ok, true);
  assert.equal(apply.code, "task-state-events-applied");
  assert.equal(apply.data.tailEventCount, 1);
  assert.equal(apply.data.appliedSequenceAfter, 4);

  const db = new Database(path.join(workspace, ".workspace-kit", "tasks", "workspace-kit.db"));
  try {
    const task = db.prepare("SELECT status FROM task_engine_tasks WHERE id = 'T100509'").get();
    assert.equal(task.status, "in_progress");
    const meta = readTaskStateProjectionMeta(db);
    assert.equal(meta?.appliedSequence, 4);
    assert.equal(meta?.syncStatus, "fresh");
  } finally {
    db.close();
  }
});
