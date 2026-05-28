import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtemp } from "node:fs/promises";
import Database from "better-sqlite3";

import { KIT_SQLITE_USER_VERSION, prepareKitSqliteDatabase } from "../dist/core/state/workspace-kit-sqlite.js";
import {
  readTaskStateProjectionMeta,
  taskStateProjectionMetaTableAvailable,
  upsertTaskStateProjectionMeta
} from "../dist/modules/task-engine/persistence/task-state-projection-meta-store.js";

test("migration creates projection metadata singleton with required fields", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "wk-proj-meta-"));
  const dbPath = path.join(workspace, "kit.db");
  const db = new Database(dbPath);
  try {
    prepareKitSqliteDatabase(db);
    assert.equal(db.pragma("user_version", { simple: true }), KIT_SQLITE_USER_VERSION);
    assert.equal(taskStateProjectionMetaTableAvailable(db), true);
    const meta = readTaskStateProjectionMeta(db);
    assert.ok(meta);
    assert.equal(meta.backend, "git-event-log");
    assert.equal(meta.appliedSequence, 0);
    assert.equal(meta.sourceCommit, null);
    assert.equal(meta.projectionSchemaVersion, 1);
    assert.equal(meta.syncStatus, "empty");
    assert.ok(meta.updatedAt);
  } finally {
    db.close();
  }
});

test("upsertTaskStateProjectionMeta updates sync cursor fields", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "wk-proj-meta-upsert-"));
  const dbPath = path.join(workspace, "kit.db");
  const db = new Database(dbPath);
  try {
    prepareKitSqliteDatabase(db);
    const updated = upsertTaskStateProjectionMeta(db, {
      appliedSequence: 42,
      sourceCommit: "abc123def456",
      syncStatus: "fresh",
      updatedAt: "2026-05-26T22:30:00.000Z"
    });
    assert.equal(updated.appliedSequence, 42);
    assert.equal(updated.sourceCommit, "abc123def456");
    assert.equal(updated.syncStatus, "fresh");
    const reread = readTaskStateProjectionMeta(db);
    assert.deepEqual(reread, updated);
  } finally {
    db.close();
  }
});
