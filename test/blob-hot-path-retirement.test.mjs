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
import { TaskStore } from "../dist/modules/task-engine/persistence/store.js";
import { SqliteDualPlanningStore } from "../dist/modules/task-engine/persistence/sqlite-dual-planning.js";
import { buildTaskPersistenceReadinessReport } from "../dist/modules/task-engine/persistence/task-persistence-readiness.js";
import { rowToTaskEntity } from "../dist/modules/task-engine/persistence/sqlite-task-row-mapping.js";

function makeTask(id, overrides = {}) {
  const now = "2026-01-01T00:00:00.000Z";
  return {
    id,
    status: "ready",
    type: "workspace-kit",
    title: `task ${id}`,
    createdAt: now,
    updatedAt: now,
    ...overrides
  };
}

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

test("incremental relational save preserves untouched rows and scoped side-table rows", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "wk-incremental-persist-"));
  const rel = path.join(".workspace-kit", "tasks", "plan.db");
  const abs = path.join(dir, rel);
  await mkdir(path.dirname(abs), { recursive: true });

  const dual = new SqliteDualPlanningStore(dir, rel);
  dual.loadFromDisk();
  const db = dual.getDatabase();
  db.prepare("INSERT OR IGNORE INTO task_engine_components (id, display_name, sort_order) VALUES ('cmp', 'Cmp', 1)").run();
  db.prepare("INSERT OR IGNORE INTO task_engine_features (id, component_id, name, covers) VALUES ('feat-a', 'cmp', 'A', 'A')").run();
  db.prepare("INSERT OR IGNORE INTO task_engine_features (id, component_id, name, covers) VALUES ('feat-b', 'cmp', 'B', 'B')").run();

  const store = TaskStore.forSqliteDual(dual);
  await store.load();
  store.addTask(makeTask("T1", { phase: "Phase 1", phaseKey: "1", features: ["feat-a"], dependsOn: ["T2"] }));
  store.addTask(makeTask("T2", { features: ["feat-b"] }));
  await store.save();
  dual.enableRelationalPersistenceAndPersist();

  const sentinel = makeTask("T999", { features: ["feat-a"], dependsOn: ["T2"] });
  db.prepare(
    `INSERT INTO task_engine_tasks (
      id, status, type, title, created_at, updated_at, archived, depends_on_json, unblocks_json, features_json
    ) VALUES (?, ?, ?, ?, ?, ?, 0, '["T2"]', '[]', '[]')`
  ).run(sentinel.id, sentinel.status, sentinel.type, sentinel.title, sentinel.createdAt, sentinel.updatedAt);
  db.prepare("INSERT INTO task_engine_dependencies (task_id, depends_on_task_id, source) VALUES ('T999', 'T2', 'sentinel')").run();
  db.prepare("INSERT INTO task_engine_task_features (task_id, feature_id) VALUES ('T999', 'feat-a')").run();

  const t1 = store.getTask("T1");
  store.updateTask({ ...t1, phase: undefined, phaseKey: undefined, features: ["feat-b"], updatedAt: "2026-01-02T00:00:00.000Z" });
  store.addMutationEvidence({
    mutationId: "m-clear-T1",
    mutationType: "clear-task-phase",
    taskId: "T1",
    timestamp: "2026-01-02T00:00:00.000Z",
    details: { payloadDigest: "test" }
  });
  await store.save();

  assert.equal(db.prepare("SELECT phase_key FROM task_engine_tasks WHERE id = 'T1'").get().phase_key, null);
  assert.equal(db.prepare("SELECT COUNT(*) AS c FROM task_engine_tasks WHERE id = 'T999'").get().c, 1);
  assert.equal(db.prepare("SELECT COUNT(*) AS c FROM task_engine_dependencies WHERE task_id = 'T999'").get().c, 1);
  assert.equal(db.prepare("SELECT COUNT(*) AS c FROM task_engine_task_features WHERE task_id = 'T999'").get().c, 1);
  assert.deepEqual(
    db.prepare("SELECT feature_id FROM task_engine_task_features WHERE task_id = 'T1' ORDER BY feature_id").all().map((r) => r.feature_id),
    ["feat-b"]
  );
  assert.equal(db.prepare("SELECT COUNT(*) AS c FROM task_engine_mutation_log WHERE mutation_id = 'm-clear-T1'").get().c, 1);
  assert.equal(String(Object.values(db.prepare("PRAGMA integrity_check").get())[0]).toLowerCase(), "ok");

  await store.save({ persistScope: "full" });
  assert.equal(db.prepare("SELECT COUNT(*) AS c FROM task_engine_tasks WHERE id = 'T999'").get().c, 0);
  db.close();
});

test("incremental relational save rejects stale planning generation", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "wk-incremental-gen-"));
  const rel = path.join(".workspace-kit", "tasks", "plan.db");
  const abs = path.join(dir, rel);
  await mkdir(path.dirname(abs), { recursive: true });

  const dual = new SqliteDualPlanningStore(dir, rel);
  dual.loadFromDisk();
  const store = TaskStore.forSqliteDual(dual);
  await store.load();
  store.addTask(makeTask("T1", { phase: "Phase 1", phaseKey: "1" }));
  await store.save();
  dual.enableRelationalPersistenceAndPersist();

  const current = dual.getPlanningGeneration();
  const t1 = store.getTask("T1");
  assert.ok(t1);
  store.updateTask({ ...t1, phase: undefined, phaseKey: undefined });
  await assert.rejects(
    () => store.save({ expectedPlanningGeneration: Math.max(0, current - 1) }),
    /expectedPlanningGeneration/
  );
  dual.getDatabase().close();
});

test("task persistence readiness flags orphan dependency and feature links", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "wk-readiness-links-"));
  const rel = path.join(".workspace-kit", "tasks", "workspace-kit.db");
  const abs = path.join(dir, rel);
  await mkdir(path.dirname(abs), { recursive: true });

  const dual = new SqliteDualPlanningStore(dir, rel);
  dual.loadFromDisk();
  const db = dual.getDatabase();
  db.prepare("INSERT OR IGNORE INTO task_engine_components (id, display_name, sort_order) VALUES ('cmp', 'Cmp', 1)").run();
  db.prepare("INSERT OR IGNORE INTO task_engine_features (id, component_id, name, covers) VALUES ('feat-a', 'cmp', 'A', 'A')").run();
  const store = TaskStore.forSqliteDual(dual);
  await store.load();
  store.addTask(makeTask("T1"));
  await store.save();
  dual.enableRelationalPersistenceAndPersist();

  db.pragma("foreign_keys = OFF");
  db.prepare("INSERT INTO task_engine_dependencies (task_id, depends_on_task_id, source) VALUES ('T-missing', 'T1', 'test')").run();
  db.prepare("INSERT INTO task_engine_task_features (task_id, feature_id) VALUES ('T-missing', 'feat-a')").run();
  db.pragma("foreign_keys = ON");
  db.close();

  const report = buildTaskPersistenceReadinessReport({
    workspacePath: dir,
    effectiveConfig: {
      tasks: {
        persistenceBackend: "sqlite",
        sqliteDatabaseRelativePath: rel
      }
    }
  });
  const codes = report.checks.map((c) => c.code);
  assert.ok(codes.includes("task-dependency-row-orphan-task-ids"));
  assert.ok(codes.includes("task-feature-link-orphan-task-ids"));
});
