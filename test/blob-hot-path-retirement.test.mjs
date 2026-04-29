/**
 * T997 — relational runtime does not depend on planning-row JSON mirrors for tasks/logs.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";

import { prepareKitSqliteDatabase } from "../dist/core/state/workspace-kit-sqlite.js";
import { SqliteDualPlanningStore } from "../dist/modules/task-engine/persistence/sqlite-dual-planning.js";
import { rowToTaskEntity } from "../dist/modules/task-engine/persistence/sqlite-task-row-mapping.js";

test("rowToTaskEntity ignores features_json when taskFeatureLinkMap is a Map (junction-only)", () => {
  const row = {
    id: "T1",
    status: "ready",
    type: "workspace-kit",
    title: "t",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    archived: 0,
    archived_at: null,
    priority: null,
    phase: null,
    phase_key: null,
    ownership: null,
    approach: null,
    depends_on_json: "[]",
    unblocks_json: "[]",
    technical_scope_json: null,
    acceptance_criteria_json: null,
    summary: null,
    description: null,
    risk: null,
    queue_namespace: null,
    evidence_key: null,
    evidence_kind: null,
    metadata_json: null,
    features_json: JSON.stringify(["legacy-slug"])
  };
  const emptyJunction = new Map();
  const t1 = rowToTaskEntity(row, { taskFeatureLinkMap: emptyJunction });
  assert.equal(t1.features, undefined);
  const t2 = rowToTaskEntity(row, { taskFeatureLinkMap: new Map([["T1", ["junction-only"]]]) });
  assert.deepEqual(t2.features, ["junction-only"]);
});

test("SqliteDualPlanningStore relational load does not parse task_store_json", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "wk-blob-retire-"));
  const rel = path.join(".workspace-kit", "tasks", "plan.db");
  const abs = path.join(dir, rel);
  await mkdir(path.dirname(abs), { recursive: true });
  const db = new Database(abs);
  prepareKitSqliteDatabase(db);
  db.prepare(
    `INSERT INTO task_engine_tasks (
      id, status, type, title, created_at, updated_at, archived, depends_on_json, unblocks_json
    ) VALUES ('T2000', 'ready', 'workspace-kit', 'blob retirement', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', 0, '[]', '[]')`
  ).run();
  db.prepare(
    `INSERT OR REPLACE INTO workspace_planning_state (
      id, task_store_json, transition_log_json, mutation_log_json, relational_tasks, planning_generation
    ) VALUES (
      1,
      '{"this would break if parsed for relational bodies"',
      '[]',
      '[]',
      1,
      0
    )`
  ).run();
  db.close();

  const dual = new SqliteDualPlanningStore(dir, rel);
  dual.loadFromDisk();
  assert.equal(dual.relationalTasksEnabled, true);
  assert.equal(dual.taskDocument.tasks.length, 1);
  assert.equal(dual.taskDocument.tasks[0].id, "T2000");
});
