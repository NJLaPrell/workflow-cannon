import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { mkdtemp, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { runRebuildTaskStateCache } from "../dist/modules/task-engine/persistence/rebuild-task-state-cache-runtime.js";
import { DEFAULT_TASK_STATE_EVENT_LOG_RELATIVE } from "../dist/modules/task-engine/task-state-events/task-state-event-log-io.js";
import { readTaskStateProjectionMeta } from "../dist/modules/task-engine/persistence/task-state-projection-meta-store.js";
import Database from "better-sqlite3";

const fixturesDir = path.join(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."),
  "src/modules/task-engine/task-state-events/fixtures"
);

test("rebuild-task-state-cache recreates tasks and projection meta from JSONL", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "wk-rebuild-cache-"));
  const stream = JSON.parse(fs.readFileSync(path.join(fixturesDir, "replay-stream-lifecycle.v1.json"), "utf8"));
  const logRel = DEFAULT_TASK_STATE_EVENT_LOG_RELATIVE;
  const logAbs = path.join(workspace, logRel);
  fs.mkdirSync(path.dirname(logAbs), { recursive: true });
  await writeFile(logAbs, `${stream.map((e) => JSON.stringify(e)).join("\n")}\n`, "utf8");

  const dbDir = path.join(workspace, ".workspace-kit", "tasks");
  fs.mkdirSync(dbDir, { recursive: true });
  const dbPath = path.join(dbDir, "workspace-kit.db");
  const seedDb = new Database(dbPath);
  const { prepareKitSqliteDatabase } = await import("../dist/core/state/workspace-kit-sqlite.js");
  prepareKitSqliteDatabase(seedDb);
  seedDb.close();

  const ctx = { workspacePath: workspace, config: {} };
  const result = await runRebuildTaskStateCache(ctx, {});
  assert.equal(result.ok, true, result.message);
  assert.equal(result.data.taskCount, 1);
  assert.equal(result.data.transitionLogCount, 2);
  assert.equal(result.data.appliedSequence, 4);
  assert.equal(result.data.projectionMeta?.syncStatus, "fresh");

  const db = new Database(dbPath);
  try {
    const count = db.prepare("SELECT COUNT(*) AS c FROM task_engine_tasks").get().c;
    assert.equal(count, 1);
    const meta = readTaskStateProjectionMeta(db);
    assert.equal(meta?.appliedSequence, 4);
    assert.equal(meta?.backend, "git-event-log");
  } finally {
    db.close();
  }
});

test("rebuild-task-state-cache dryRun does not write tasks", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "wk-rebuild-dry-"));
  const logAbs = path.join(workspace, DEFAULT_TASK_STATE_EVENT_LOG_RELATIVE);
  fs.mkdirSync(path.dirname(logAbs), { recursive: true });
  await writeFile(logAbs, "", "utf8");

  const dbPath = path.join(workspace, ".workspace-kit", "tasks", "workspace-kit.db");
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  const { prepareKitSqliteDatabase } = await import("../dist/core/state/workspace-kit-sqlite.js");
  prepareKitSqliteDatabase(db);
  db.close();

  const result = await runRebuildTaskStateCache({ workspacePath: workspace, config: {} }, { dryRun: true });
  assert.equal(result.ok, true);
  assert.equal(result.code, "task-state-cache-rebuild-dry-run");
  const db2 = new Database(dbPath);
  try {
    assert.equal(db2.prepare("SELECT COUNT(*) AS c FROM task_engine_tasks").get().c, 0);
  } finally {
    db2.close();
  }
});
