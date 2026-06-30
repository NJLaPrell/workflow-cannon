import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";

import { KIT_SQLITE_USER_VERSION, prepareKitSqliteDatabase } from "../dist/core/state/workspace-kit-sqlite.js";

test("prepareKitSqliteDatabase v38 removes wishlist intake persistence", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "wk-wishlist-migration-"));
  const dbPath = path.join(workspace, "workspace-kit.db");
  const now = new Date().toISOString();
  try {
    const seedDb = new Database(dbPath);
    seedDb.exec(`
CREATE TABLE workspace_planning_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  task_store_json TEXT NOT NULL,
  wishlist_store_json TEXT NOT NULL,
  transition_log_json TEXT NOT NULL DEFAULT '[]',
  mutation_log_json TEXT NOT NULL DEFAULT '[]',
  relational_tasks INTEGER NOT NULL DEFAULT 1,
  planning_generation INTEGER NOT NULL DEFAULT 11
);
CREATE TABLE task_engine_tasks (
  id TEXT PRIMARY KEY NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('research','proposed','ready','in_progress','blocked','completed','cancelled')),
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1)),
  archived_at TEXT,
  priority TEXT CHECK (priority IS NULL OR priority IN ('P1','P2','P3')),
  phase TEXT,
  phase_key TEXT,
  ownership TEXT,
  approach TEXT,
  depends_on_json TEXT NOT NULL DEFAULT '[]',
  unblocks_json TEXT NOT NULL DEFAULT '[]',
  technical_scope_json TEXT,
  acceptance_criteria_json TEXT,
  summary TEXT,
  description TEXT,
  risk TEXT,
  queue_namespace TEXT,
  evidence_key TEXT,
  evidence_kind TEXT,
  metadata_json TEXT,
  features_json TEXT NOT NULL DEFAULT '[]'
);
CREATE TABLE task_engine_dependencies (
  task_id TEXT NOT NULL,
  depends_on_task_id TEXT NOT NULL
);
CREATE TABLE task_engine_transition_log (
  transition_id TEXT PRIMARY KEY NOT NULL,
  task_id TEXT NOT NULL
);
CREATE TABLE task_engine_mutation_log (
  mutation_id TEXT PRIMARY KEY NOT NULL,
  task_id TEXT NOT NULL
);
CREATE TABLE workflow_ideas (
  id TEXT PRIMARY KEY NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`);
    const taskStoreJson = JSON.stringify({
      schemaVersion: 1,
      tasks: [
        { id: "T900", type: "wishlist_intake", title: "legacy wish" },
        { id: "T901", type: "workspace-kit", title: "keep me" }
      ],
      transitionLog: [{ transitionId: "tr1", taskId: "T900" }, { transitionId: "tr2", taskId: "T901" }],
      mutationLog: [{ mutationId: "mu1", taskId: "T900" }, { mutationId: "mu2", taskId: "T901" }],
      lastUpdated: now
    });
    seedDb
      .prepare(
        "INSERT INTO workspace_planning_state (id, task_store_json, wishlist_store_json, transition_log_json, mutation_log_json, relational_tasks, planning_generation) VALUES (1, ?, ?, '[]', '[]', 1, 11)"
      )
      .run(taskStoreJson, JSON.stringify({ schemaVersion: 1, items: [{ id: "W001", title: "legacy" }], lastUpdated: now }));
    seedDb
      .prepare(
        `INSERT INTO task_engine_tasks (
          id, status, type, title, created_at, updated_at, archived, depends_on_json, unblocks_json, features_json
        ) VALUES (?, ?, ?, ?, ?, ?, 0, '[]', '[]', '[]')`
      )
      .run("T900", "proposed", "wishlist_intake", "legacy wish", now, now);
    seedDb
      .prepare(
        `INSERT INTO task_engine_tasks (
          id, status, type, title, created_at, updated_at, archived, depends_on_json, unblocks_json, features_json
        ) VALUES (?, ?, ?, ?, ?, ?, 0, '[]', '[]', '[]')`
      )
      .run("T901", "ready", "workspace-kit", "keep me", now, now);
    seedDb.prepare("INSERT INTO task_engine_dependencies (task_id, depends_on_task_id) VALUES (?, ?)").run("T900", "T901");
    seedDb.prepare("INSERT INTO task_engine_transition_log (transition_id, task_id) VALUES (?, ?)").run("tr1", "T900");
    seedDb.prepare("INSERT INTO task_engine_transition_log (transition_id, task_id) VALUES (?, ?)").run("tr2", "T901");
    seedDb.prepare("INSERT INTO task_engine_mutation_log (mutation_id, task_id) VALUES (?, ?)").run("mu1", "T900");
    seedDb.prepare("INSERT INTO task_engine_mutation_log (mutation_id, task_id) VALUES (?, ?)").run("mu2", "T901");
    seedDb
      .prepare(
        "INSERT INTO workflow_ideas (id, title, status, sort_order, created_at, updated_at) VALUES (?, ?, 'open', 1, ?, ?)"
      )
      .run("I001", "keep ideas", now, now);
    seedDb.pragma("user_version = 37");
    seedDb.close();

    const migratedDb = new Database(dbPath);
    prepareKitSqliteDatabase(migratedDb);

    const userVersion = Number(migratedDb.pragma("user_version", { simple: true }));
    assert.equal(userVersion, KIT_SQLITE_USER_VERSION);

    const cols = migratedDb.prepare("PRAGMA table_info(workspace_planning_state)").all();
    assert.equal(cols.some((row) => row.name === "wishlist_store_json"), false);

    const taskRows = migratedDb
      .prepare("SELECT id, type FROM task_engine_tasks ORDER BY id ASC")
      .all()
      .map((row) => `${row.id}:${row.type}`);
    assert.deepEqual(taskRows, ["T901:workspace-kit"]);

    const depCount = migratedDb
      .prepare("SELECT COUNT(*) AS c FROM task_engine_dependencies WHERE task_id = 'T900' OR depends_on_task_id = 'T900'")
      .get();
    assert.equal(Number(depCount.c), 0);
    const trCount = migratedDb
      .prepare("SELECT COUNT(*) AS c FROM task_engine_transition_log WHERE task_id = 'T900'")
      .get();
    assert.equal(Number(trCount.c), 0);
    const muCount = migratedDb
      .prepare("SELECT COUNT(*) AS c FROM task_engine_mutation_log WHERE task_id = 'T900'")
      .get();
    assert.equal(Number(muCount.c), 0);

    const ideaCount = migratedDb.prepare("SELECT COUNT(*) AS c FROM workflow_ideas").get();
    assert.equal(Number(ideaCount.c), 1);

    const stateRow = migratedDb
      .prepare("SELECT task_store_json, planning_generation FROM workspace_planning_state WHERE id = 1")
      .get();
    const taskStore = JSON.parse(stateRow.task_store_json);
    assert.equal(taskStore.tasks.some((task) => task.type === "wishlist_intake"), false);
    assert.equal(taskStore.tasks.some((task) => task.id === "T901"), true);
    assert.equal(Number(stateRow.planning_generation), 11);

    migratedDb.close();
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});
