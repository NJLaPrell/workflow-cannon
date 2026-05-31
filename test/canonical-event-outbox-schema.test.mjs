import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtemp } from "node:fs/promises";
import Database from "better-sqlite3";

import {
  KIT_CANONICAL_EVENT_OUTBOX_TABLE,
  KIT_SQLITE_USER_VERSION,
  kitSqliteHasCanonicalEventOutbox,
  prepareKitSqliteDatabase
} from "../dist/core/state/workspace-kit-sqlite.js";

const OUTBOX_COLUMNS = [
  "id",
  "event_id",
  "event_kind",
  "event_json",
  "touched_task_ids_json",
  "expected_task_versions_json",
  "status",
  "attempts",
  "created_at",
  "updated_at",
  "last_attempt_at",
  "last_error",
  "published_head_sha",
  "published_sequence_start",
  "published_sequence_end"
];

test("v30 migration creates kit_canonical_event_outbox", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "wk-outbox-schema-"));
  const db = new Database(path.join(workspace, "kit.db"));
  try {
    prepareKitSqliteDatabase(db);
    assert.equal(db.pragma("user_version", { simple: true }), KIT_SQLITE_USER_VERSION);
    assert.equal(KIT_SQLITE_USER_VERSION, 32);
    assert.equal(kitSqliteHasCanonicalEventOutbox(db), true);
    const columns = db
      .prepare(`PRAGMA table_info(${KIT_CANONICAL_EVENT_OUTBOX_TABLE})`)
      .all()
      .map((r) => r.name);
    assert.deepEqual(columns, OUTBOX_COLUMNS);
    const indexes = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name=? ORDER BY name"
      )
      .all(KIT_CANONICAL_EVENT_OUTBOX_TABLE)
      .map((r) => r.name);
    assert.ok(indexes.includes("idx_kit_canonical_event_outbox_status_created"));
  } finally {
    db.close();
  }
});

test("outbox migration is idempotent and upgrades v29 workspaces", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "wk-outbox-idem-"));
  const db = new Database(path.join(workspace, "kit.db"));
  try {
    prepareKitSqliteDatabase(db);
    prepareKitSqliteDatabase(db);
    db.exec(`DROP TABLE ${KIT_CANONICAL_EVENT_OUTBOX_TABLE}`);
    assert.equal(kitSqliteHasCanonicalEventOutbox(db), false);
    db.pragma("user_version = 29");
    prepareKitSqliteDatabase(db);
    assert.equal(db.pragma("user_version", { simple: true }), 32);
    assert.equal(kitSqliteHasCanonicalEventOutbox(db), true);
  } finally {
    db.close();
  }
});

test("kit_canonical_event_outbox supports basic CRUD", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "wk-outbox-crud-"));
  const db = new Database(path.join(workspace, "kit.db"));
  try {
    prepareKitSqliteDatabase(db);
    const now = "2026-05-30T06:30:00.000Z";
    db.prepare(
      `INSERT INTO ${KIT_CANONICAL_EVENT_OUTBOX_TABLE} (
        id, event_id, event_kind, event_json, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run("row-1", "evt-1", "task.updated", '{"kind":"task.updated"}', "pending", now, now);

    const row = db
      .prepare(`SELECT status, event_kind FROM ${KIT_CANONICAL_EVENT_OUTBOX_TABLE} WHERE event_id = ?`)
      .get("evt-1");
    assert.deepEqual(row, { status: "pending", event_kind: "task.updated" });

    db.prepare(
      `UPDATE ${KIT_CANONICAL_EVENT_OUTBOX_TABLE} SET status = ?, updated_at = ? WHERE event_id = ?`
    ).run("published", now, "evt-1");

    const published = db
      .prepare(`SELECT status FROM ${KIT_CANONICAL_EVENT_OUTBOX_TABLE} WHERE event_id = ?`)
      .get("evt-1");
    assert.equal(published.status, "published");

    assert.throws(() => {
      db.prepare(
        `INSERT INTO ${KIT_CANONICAL_EVENT_OUTBOX_TABLE} (
          id, event_id, event_kind, event_json, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run("row-2", "evt-1", "task.created", "{}", "pending", now, now);
    }, /UNIQUE constraint failed/);
  } finally {
    db.close();
  }
});
