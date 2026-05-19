import test from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import {
  buildDashboardCurrentPhaseDelivery,
  countPhaseQueueMetrics,
  wasWorkspacePhaseRolledOut
} from "../dist/modules/task-engine/dashboard/phase-delivery-status.js";

function openStatusDb() {
  const db = new Database(":memory:");
  db.pragma("user_version = 10");
  db.exec(`
    CREATE TABLE kit_workspace_status (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      workspace_revision INTEGER NOT NULL,
      current_kit_phase TEXT,
      next_kit_phase TEXT,
      active_focus TEXT,
      last_updated TEXT,
      blockers_json TEXT NOT NULL DEFAULT '[]',
      pending_decisions_json TEXT NOT NULL DEFAULT '[]',
      next_agent_actions_json TEXT NOT NULL DEFAULT '[]',
      updated_at TEXT NOT NULL
    );
    INSERT INTO kit_workspace_status (
      id, workspace_revision, current_kit_phase, next_kit_phase,
      active_focus, last_updated, updated_at
    ) VALUES (1, 0, '99', '100', '', '', datetime('now'));

    CREATE TABLE kit_workspace_status_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at TEXT NOT NULL,
      event_kind TEXT NOT NULL,
      actor TEXT,
      command TEXT,
      revision_before INTEGER,
      revision_after INTEGER,
      details_json TEXT NOT NULL
    );
  `);
  return db;
}

test("wasWorkspacePhaseRolledOut detects previousCurrentKitPhase on set_current_phase events", () => {
  const db = openStatusDb();
  db.prepare(
    `INSERT INTO kit_workspace_status_events (
      created_at, event_kind, command, revision_before, revision_after, details_json
    ) VALUES (?, 'set_current_phase', 'set-current-phase', 0, 1, ?)`
  ).run(
    "2026-01-01T00:00:00.000Z",
    JSON.stringify({ previousCurrentKitPhase: "98", clientMutationId: "x" })
  );
  assert.equal(wasWorkspacePhaseRolledOut(db, "98"), true);
  assert.equal(wasWorkspacePhaseRolledOut(db, "99"), false);
  db.close();
});

test("buildDashboardCurrentPhaseDelivery marks released after rollover event for prior phase", () => {
  const db = openStatusDb();
  db.prepare(
    `INSERT INTO kit_workspace_status_events (
      created_at, event_kind, command, revision_before, revision_after, details_json
    ) VALUES (?, 'set_current_phase', 'set-current-phase', 1, 2, ?)`
  ).run(
    "2026-01-02T00:00:00.000Z",
    JSON.stringify({ previousCurrentKitPhase: "100" })
  );
  db.prepare(`UPDATE kit_workspace_status SET current_kit_phase = '100' WHERE id = 1`).run();

  const staleCurrent = buildDashboardCurrentPhaseDelivery({
    tasks: [],
    workspaceStatus: { currentKitPhase: "100", nextKitPhase: "101" },
    db
  });
  assert.equal(staleCurrent.phaseKey, "100");
  assert.equal(staleCurrent.released, true);

  const current101 = buildDashboardCurrentPhaseDelivery({
    tasks: [],
    workspaceStatus: { currentKitPhase: "101", nextKitPhase: "102" },
    db
  });
  assert.equal(current101.phaseKey, "101");
  assert.equal(current101.released, false);
  db.close();
});

test("countPhaseQueueMetrics scopes ready counts to phase key", () => {
  const tasks = [
    { id: "T1", status: "ready", phaseKey: "100", type: "execution", title: "a", createdAt: "", updatedAt: "" },
    { id: "T2", status: "ready", phaseKey: "99", type: "execution", title: "b", createdAt: "", updatedAt: "" },
    { id: "T3", status: "ready", phaseKey: "100", type: "execution", title: "c", createdAt: "", updatedAt: "" }
  ];
  const q = countPhaseQueueMetrics(tasks, "100");
  assert.equal(q.ready, 2);
});
