import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtemp } from "node:fs/promises";
import Database from "better-sqlite3";

import {
  KIT_CANONICAL_EVENT_OUTBOX_TABLE,
  prepareKitSqliteDatabase
} from "../dist/core/state/workspace-kit-sqlite.js";
import {
  enqueueCanonicalEvent,
  getOutboxStatus,
  listPendingCanonicalEvents,
  markConflict,
  markFailed,
  markPublished,
  markPublishing,
  resetStalePublishing
} from "../dist/modules/task-engine/persistence/canonical-event-outbox-store.js";

function createEvent(id, kind = "task.updated", recordedAt = "2026-05-30T12:00:00.000Z") {
  return {
    schemaVersion: 1,
    eventId: id,
    sequence: 0,
    parentEventId: null,
    recordedAt,
    actor: { id: "test-agent", source: "explicit" },
    command: { name: "unit-test" },
    kind,
    payload: { taskId: `task-${id}` }
  };
}

test("enqueueCanonicalEvent is idempotent by event_id", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "wk-outbox-idempotent-"));
  const db = new Database(path.join(workspace, "kit.db"));
  try {
    prepareKitSqliteDatabase(db);
    const event = createEvent("evt-idempotent");
    const first = enqueueCanonicalEvent(db, event, { rowId: "row-first" });
    const second = enqueueCanonicalEvent(db, event, { rowId: "row-second" });
    assert.equal(first.inserted, true);
    assert.equal(second.inserted, false);
    assert.equal(first.row.id, "row-first");
    assert.equal(second.row.id, "row-first");
    const rowCount = db
      .prepare(`SELECT COUNT(*) AS count FROM ${KIT_CANONICAL_EVENT_OUTBOX_TABLE} WHERE event_id = ?`)
      .get("evt-idempotent");
    assert.equal(rowCount.count, 1);
  } finally {
    db.close();
  }
});

test("listPendingCanonicalEvents returns deterministic order", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "wk-outbox-order-"));
  const db = new Database(path.join(workspace, "kit.db"));
  try {
    prepareKitSqliteDatabase(db);
    enqueueCanonicalEvent(db, createEvent("evt-b"), {
      rowId: "row-b",
      now: "2026-05-30T12:00:02.000Z"
    });
    enqueueCanonicalEvent(db, createEvent("evt-a"), {
      rowId: "row-a",
      now: "2026-05-30T12:00:01.000Z"
    });
    enqueueCanonicalEvent(db, createEvent("evt-c"), {
      rowId: "row-c",
      now: "2026-05-30T12:00:02.000Z"
    });

    const pending = listPendingCanonicalEvents(db, 10);
    assert.deepEqual(
      pending.map((row) => row.id),
      ["row-a", "row-b", "row-c"]
    );
  } finally {
    db.close();
  }
});

test("resetStalePublishing resets only stale publishing rows", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "wk-outbox-reset-stale-"));
  const db = new Database(path.join(workspace, "kit.db"));
  try {
    prepareKitSqliteDatabase(db);
    const stale = enqueueCanonicalEvent(db, createEvent("evt-stale"), { rowId: "row-stale" });
    const fresh = enqueueCanonicalEvent(db, createEvent("evt-fresh"), { rowId: "row-fresh" });
    markPublishing(db, [stale.row.id, fresh.row.id]);

    const oldAttempt = new Date(Date.now() - 5 * 60_000).toISOString();
    const newAttempt = new Date().toISOString();
    db.prepare(
      `UPDATE ${KIT_CANONICAL_EVENT_OUTBOX_TABLE}
       SET last_attempt_at = ?, updated_at = ?
       WHERE id = ?`
    ).run(oldAttempt, oldAttempt, stale.row.id);
    db.prepare(
      `UPDATE ${KIT_CANONICAL_EVENT_OUTBOX_TABLE}
       SET last_attempt_at = ?, updated_at = ?
       WHERE id = ?`
    ).run(newAttempt, newAttempt, fresh.row.id);

    const resetCount = resetStalePublishing(db, 60_000);
    assert.equal(resetCount, 1);
    const statuses = db
      .prepare(
        `SELECT id, status FROM ${KIT_CANONICAL_EVENT_OUTBOX_TABLE}
         WHERE id IN (?, ?)
         ORDER BY id`
      )
      .all(fresh.row.id, stale.row.id);
    assert.deepEqual(statuses, [
      { id: "row-fresh", status: "publishing" },
      { id: "row-stale", status: "pending" }
    ]);
  } finally {
    db.close();
  }
});

test("getOutboxStatus includes failed/conflict states", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "wk-outbox-status-"));
  const db = new Database(path.join(workspace, "kit.db"));
  try {
    prepareKitSqliteDatabase(db);
    const failed = enqueueCanonicalEvent(db, createEvent("evt-failed"), { rowId: "row-failed" });
    const conflicted = enqueueCanonicalEvent(db, createEvent("evt-conflict"), { rowId: "row-conflict" });
    const published = enqueueCanonicalEvent(db, createEvent("evt-published"), { rowId: "row-published" });

    markPublishing(db, [failed.row.id, conflicted.row.id, published.row.id]);
    markFailed(db, [failed.row.id], "network timeout");
    markConflict(db, [conflicted.row.id], "expected version mismatch");
    markPublished(db, [published.row.id], {
      headSha: "abc123",
      sequenceStart: 41,
      sequenceEnd: 43
    });

    const status = getOutboxStatus(db);
    assert.equal(status.counts.total, 3);
    assert.equal(status.counts.failed, 1);
    assert.equal(status.counts.conflict, 1);
    assert.equal(status.counts.published, 1);
    assert.equal(status.counts.pending, 0);
    assert.equal(status.counts.publishing, 0);
  } finally {
    db.close();
  }
});
