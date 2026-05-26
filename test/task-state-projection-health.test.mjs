import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { mkdtemp, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";

import { evaluateTaskStateProjectionHealth } from "../dist/modules/task-engine/persistence/task-state-projection-health.js";
import { runRepairTaskStateCache } from "../dist/modules/task-engine/persistence/repair-task-state-cache-runtime.js";
import { runRebuildTaskStateCache } from "../dist/modules/task-engine/persistence/rebuild-task-state-cache-runtime.js";
import { DEFAULT_TASK_STATE_EVENT_LOG_RELATIVE } from "../dist/modules/task-engine/task-state-events/task-state-event-log-io.js";
import { collectDoctorTaskStateProjectionIssues } from "../dist/modules/task-engine/doctor-task-state-projection.js";

const fixturesDir = path.join(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."),
  "src/modules/task-engine/task-state-events/fixtures"
);

test("evaluateTaskStateProjectionHealth reports stale when log has tail", async () => {
  const stream = JSON.parse(fs.readFileSync(path.join(fixturesDir, "replay-stream-lifecycle.v1.json"), "utf8"));
  const workspace = await mkdtemp(path.join(os.tmpdir(), "wk-proj-health-"));
  const logAbs = path.join(workspace, DEFAULT_TASK_STATE_EVENT_LOG_RELATIVE);
  fs.mkdirSync(path.dirname(logAbs), { recursive: true });
  await writeFile(logAbs, `${stream.map((e) => JSON.stringify(e)).join("\n")}\n`, "utf8");
  const dbPath = path.join(workspace, ".workspace-kit", "tasks", "workspace-kit.db");
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  const { prepareKitSqliteDatabase } = await import("../dist/core/state/workspace-kit-sqlite.js");
  prepareKitSqliteDatabase(db);

  const { upsertTaskStateProjectionMeta } = await import(
    "../dist/modules/task-engine/persistence/task-state-projection-meta-store.js"
  );
  upsertTaskStateProjectionMeta(db, {
    appliedSequence: 2,
    sourceCommit: null,
    syncStatus: "stale",
    updatedAt: "2026-05-26T22:00:00.000Z"
  });
  db.close();

  const db2 = new Database(dbPath, { readonly: true });
  try {
    const health = evaluateTaskStateProjectionHealth(workspace, db2);
    assert.equal(health.code, "projection-stale");
    assert.ok(health.recommendedCommand?.includes("apply-task-state-events"));
  } finally {
    db2.close();
  }
});

test("repair-task-state-cache rebuilds corrupt ahead-of-log projection", async () => {
  const stream = JSON.parse(fs.readFileSync(path.join(fixturesDir, "replay-stream-lifecycle.v1.json"), "utf8"));
  const workspace = await mkdtemp(path.join(os.tmpdir(), "wk-proj-repair-"));
  const logAbs = path.join(workspace, DEFAULT_TASK_STATE_EVENT_LOG_RELATIVE);
  fs.mkdirSync(path.dirname(logAbs), { recursive: true });
  await writeFile(logAbs, `${stream.map((e) => JSON.stringify(e)).join("\n")}\n`, "utf8");
  const dbPath = path.join(workspace, ".workspace-kit", "tasks", "workspace-kit.db");
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  const { prepareKitSqliteDatabase } = await import("../dist/core/state/workspace-kit-sqlite.js");
  prepareKitSqliteDatabase(db);
  const { upsertTaskStateProjectionMeta } = await import(
    "../dist/modules/task-engine/persistence/task-state-projection-meta-store.js"
  );
  upsertTaskStateProjectionMeta(db, {
    appliedSequence: 99,
    sourceCommit: null,
    syncStatus: "corrupt",
    updatedAt: "2026-05-26T22:00:00.000Z"
  });
  db.close();

  const ctx = { workspacePath: workspace, config: {} };
  const repair = await runRepairTaskStateCache(ctx, {});
  assert.equal(repair.ok, true);
  assert.equal(repair.code, "task-state-cache-rebuilt");

  const issues = await collectDoctorTaskStateProjectionIssues(workspace, {});
  assert.equal(issues.length, 0);
});
