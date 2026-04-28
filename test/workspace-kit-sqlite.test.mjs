import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtemp } from "node:fs/promises";
import Database from "better-sqlite3";

import {
  KIT_SQLITE_USER_VERSION,
  prepareKitSqliteDatabase,
  readKitSqliteUserVersion
} from "../dist/core/state/workspace-kit-sqlite.js";

test("prepareKitSqliteDatabase applies user_version and baseline tables", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "wk-sqlite-migrate-"));
  const dbPath = path.join(workspace, "kit.db");
  const db = new Database(dbPath);
  try {
    prepareKitSqliteDatabase(db);
    const v = db.pragma("user_version", { simple: true });
    assert.equal(v, KIT_SQLITE_USER_VERSION);
    const names = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all()
      .map((r) => r.name);
    assert.ok(names.includes("workspace_module_state"));
    assert.ok(names.includes("workspace_planning_state"));
    assert.ok(names.includes("kit_workspace_status"));
    assert.ok(names.includes("kit_workspace_status_events"));
    assert.ok(names.includes("cae_registry_versions"));
    assert.ok(names.includes("cae_registry_artifacts"));
    assert.ok(names.includes("cae_registry_activations"));
    assert.ok(names.includes("cae_registry_mutations"));
    assert.ok(names.includes("task_engine_dependencies"));
    assert.ok(names.includes("task_engine_transition_log"));
    assert.ok(names.includes("task_engine_mutation_log"));
    const qc = db.prepare("PRAGMA quick_check").all();
    assert.equal(qc.length, 1);
    const cell = Object.values(qc[0])[0];
    assert.equal(String(cell).toLowerCase(), "ok");
  } finally {
    db.close();
  }
  assert.equal(readKitSqliteUserVersion(dbPath), KIT_SQLITE_USER_VERSION);
});

test("prepareKitSqliteDatabase is idempotent", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "wk-sqlite-idem-"));
  const dbPath = path.join(workspace, "kit.db");
  const db = new Database(dbPath);
  try {
    prepareKitSqliteDatabase(db);
    prepareKitSqliteDatabase(db);
    assert.equal(db.pragma("user_version", { simple: true }), KIT_SQLITE_USER_VERSION);
  } finally {
    db.close();
  }
});
