import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtemp } from "node:fs/promises";
import Database from "better-sqlite3";

import { prepareKitSqliteDatabase } from "../dist/core/state/workspace-kit-sqlite.js";
import { createPhaseJournalStore } from "../dist/modules/task-engine/phase-journal/phase-journal-store.js";

test("phase journal migration is idempotent and store supports idempotent create", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "wk-phase-journal-"));
  const dbPath = path.join(workspace, "kit.db");
  const db = new Database(dbPath);
  try {
    prepareKitSqliteDatabase(db);
    prepareKitSqliteDatabase(db);

    const store = createPhaseJournalStore(db);
    const first = store.createNoteIdempotent({
      phaseKey: "78",
      noteType: "finding",
      summary: "hello",
      idempotencyKey: "idem-1",
      refs: [{ refType: "file", refValue: "src/x.ts" }]
    });
    assert.equal(first.created, true);
    assert.equal(first.note.refs.length, 1);
    assert.equal(first.note.phaseKey, "78");

    const second = store.createNoteIdempotent({
      phaseKey: "78",
      noteType: "finding",
      summary: "different body should not matter for idem",
      idempotencyKey: "idem-1"
    });
    assert.equal(second.created, false);
    assert.equal(second.note.id, first.note.id);
    assert.equal(second.note.summary, "hello");
  } finally {
    db.close();
  }
});

test("phase journal list, dismiss, supersede", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "wk-phase-journal-2-"));
  const dbPath = path.join(workspace, "kit.db");
  const db = new Database(dbPath);
  try {
    prepareKitSqliteDatabase(db);
    const store = createPhaseJournalStore(db);

    const a = store.createNoteIdempotent({
      phaseKey: "9",
      noteType: "risk",
      summary: "a",
      priority: "high"
    });
    const b = store.createNoteIdempotent({
      phaseKey: "9",
      noteType: "gotcha",
      summary: "b"
    });

    const active = store.listNotes({ phaseKey: "9", status: "active" });
    assert.equal(active.length, 2);

    store.dismissNote(a.note.id);
    const afterDismiss = store.listNotes({ phaseKey: "9", status: "active" });
    assert.equal(afterDismiss.length, 1);
    assert.equal(afterDismiss[0].id, b.note.id);

    store.supersedeNote(b.note.id, a.note.id);
    const bRow = store.getById(b.note.id);
    assert.equal(bRow.status, "superseded");
    assert.equal(bRow.supersededBy, a.note.id);
  } finally {
    db.close();
  }
});
