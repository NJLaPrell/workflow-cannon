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

test("buildPhaseJournalSnapshotSummary is bounded and omits details", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "wk-phase-journal-snap-"));
  const dbPath = path.join(workspace, "kit.db");
  const db = new Database(dbPath);
  const { buildPhaseJournalSnapshotSummary } = await import(
    "../dist/modules/task-engine/phase-journal/phase-journal-snapshot-summary.js"
  );
  try {
    prepareKitSqliteDatabase(db);
    const store = createPhaseJournalStore(db);
    store.createNoteIdempotent({
      phaseKey: "12",
      phaseLabel: "Phase 12",
      noteType: "follow-up",
      summary: "short",
      details: "LONG DETAILS SHOULD NOT APPEAR IN SNAPSHOT",
      priority: "normal"
    });
    store.createNoteIdempotent({
      phaseKey: "12",
      noteType: "task-suggestion",
      summary: "suggest",
      priority: "critical"
    });
    const snap = buildPhaseJournalSnapshotSummary(db, "12");
    assert.ok(snap);
    assert.equal(snap.phaseKey, "12");
    assert.equal(snap.phaseLabel, "Phase 12");
    assert.equal(snap.activeNoteCount, 2);
    assert.equal(snap.criticalCount, 1);
    assert.equal(snap.openFollowUpCount, 2);
    assert.equal(snap.topNotes.length, 2);
    assert.ok(!JSON.stringify(snap).includes("LONG DETAILS"));
  } finally {
    db.close();
  }
});

test("buildPhaseJournalSnapshotSummary returns null without phase key", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "wk-phase-journal-snap-null-"));
  const dbPath = path.join(workspace, "kit.db");
  const db = new Database(dbPath);
  const { buildPhaseJournalSnapshotSummary } = await import(
    "../dist/modules/task-engine/phase-journal/phase-journal-snapshot-summary.js"
  );
  try {
    prepareKitSqliteDatabase(db);
    assert.equal(buildPhaseJournalSnapshotSummary(db, null), null);
    assert.equal(buildPhaseJournalSnapshotSummary(db, ""), null);
  } finally {
    db.close();
  }
});

test("buildNextActionsPhaseContext ranks by suggested task and caps lists", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "wk-phase-journal-na-"));
  const dbPath = path.join(workspace, "kit.db");
  const db = new Database(dbPath);
  const { buildNextActionsPhaseContext } = await import(
    "../dist/modules/task-engine/phase-journal/phase-journal-next-actions-context.js"
  );
  try {
    prepareKitSqliteDatabase(db);
    const store = createPhaseJournalStore(db);
    store.createNoteIdempotent({
      phaseKey: "5",
      taskId: "T999",
      noteType: "finding",
      summary: "other task",
      priority: "normal"
    });
    store.createNoteIdempotent({
      phaseKey: "5",
      taskId: "T100",
      noteType: "gotcha",
      summary: "same task gotcha",
      priority: "normal"
    });
    const ctx = buildNextActionsPhaseContext(db, "5", "T100");
    assert.ok(ctx);
    assert.equal(ctx.phaseKey, "5");
    assert.equal(ctx.relevantNotes[0].summary, "same task gotcha");
    assert.ok(ctx.relevantNotes.length <= 8);
    assert.ok(ctx.taskSuggestionsFromNotes.length <= 5);
  } finally {
    db.close();
  }
});
