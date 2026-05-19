import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtemp } from "node:fs/promises";
import Database from "better-sqlite3";

import { prepareKitSqliteDatabase } from "../dist/core/state/workspace-kit-sqlite.js";
import { createPhaseJournalStore } from "../dist/modules/task-engine/phase-journal/phase-journal-store.js";
import {
  buildDashboardPastPhaseNotes,
  derivePastPhaseKeysFromCatalog
} from "../dist/modules/task-engine/dashboard/build-dashboard-past-phase-notes.js";

test("derivePastPhaseKeysFromCatalog returns ordinals before workspace current", () => {
  const keys = derivePastPhaseKeysFromCatalog(
    [{ phaseKey: "98" }, { phaseKey: "100" }, { phaseKey: "99" }],
    "100"
  );
  assert.deepEqual(keys, ["98", "99"]);
});

test("buildDashboardPastPhaseNotes returns rollup entries for past phases only", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "wk-dash-past-notes-"));
  const dbPath = path.join(workspace, "kit.db");
  const db = new Database(dbPath);
  try {
    prepareKitSqliteDatabase(db);
    const store = createPhaseJournalStore(db);
    store.createNoteIdempotent({ phaseKey: "98", noteType: "risk", summary: "ship it" });
    store.createNoteIdempotent({ phaseKey: "100", noteType: "risk", summary: "current" });

    const rollup = buildDashboardPastPhaseNotes({
      db,
      phaseCatalogPhases: [{ phaseKey: "98" }, { phaseKey: "100" }],
      currentKitPhase: "100"
    });
    assert.equal(rollup.length, 1);
    assert.equal(rollup[0].phaseKey, "98");
    assert.equal(rollup[0].notes.length, 1);
    assert.equal(rollup[0].notes[0].summary, "ship it");
  } finally {
    db.close();
  }
});
