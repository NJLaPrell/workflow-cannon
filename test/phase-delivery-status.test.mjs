import test from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import {
  buildDashboardCurrentPhaseDelivery,
  collectDeliveredPhaseKeys,
  collectPhaseDeliveryHistoryRows,
  collectPhaseReleaseDatesByKey,
  collectRolledOutPhaseKeys,
  countPhaseQueueMetrics,
  wasWorkspacePhaseRolledOut
} from "../dist/modules/task-engine/dashboard/phase-delivery-status.js";
import {
  upsertPhaseDeliveryHistory
} from "../dist/modules/task-engine/persistence/phase-delivery-history-store.js";

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

function addDeliveryHistoryTable(db) {
  db.pragma("user_version = 35");
  db.exec(`
    CREATE TABLE kit_phase_delivery_history (
      phase_key TEXT PRIMARY KEY NOT NULL,
      status TEXT NOT NULL DEFAULT 'delivered',
      delivered_at TEXT NOT NULL,
      release_version TEXT,
      git_tag TEXT,
      github_release_url TEXT,
      npm_package TEXT,
      npm_dist_tag TEXT,
      release_workflow_url TEXT,
      main_commit_sha TEXT,
      release_branch TEXT,
      release_pr_url TEXT,
      evidence_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX idx_kit_phase_delivery_history_delivered_at
      ON kit_phase_delivery_history(delivered_at DESC);
  `);
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

test("collectRolledOutPhaseKeys gathers unique previousCurrentKitPhase values", () => {
  const db = openStatusDb();
  db.prepare(
    `INSERT INTO kit_workspace_status_events (
      created_at, event_kind, command, revision_before, revision_after, details_json
    ) VALUES (?, 'set_current_phase', 'set-current-phase', 0, 1, ?)`
  ).run(
    "2026-01-01T00:00:00.000Z",
    JSON.stringify({ previousCurrentKitPhase: "98" })
  );
  db.prepare(
    `INSERT INTO kit_workspace_status_events (
      created_at, event_kind, command, revision_before, revision_after, details_json
    ) VALUES (?, 'set_current_phase', 'set-current-phase', 1, 2, ?)`
  ).run(
    "2026-01-02T00:00:00.000Z",
    JSON.stringify({ previousCurrentKitPhase: "99" })
  );
  assert.deepEqual(collectRolledOutPhaseKeys(db), ["98", "99"]);
  db.close();
});

test("collectPhaseReleaseDatesByKey maps previousCurrentKitPhase to event created_at", () => {
  const db = openStatusDb();
  db.prepare(
    `INSERT INTO kit_workspace_status_events (
      created_at, event_kind, command, revision_before, revision_after, details_json
    ) VALUES (?, 'set_current_phase', 'set-current-phase', 0, 1, ?)`
  ).run(
    "2026-01-01T00:00:00.000Z",
    JSON.stringify({ previousCurrentKitPhase: "98" })
  );
  db.prepare(
    `INSERT INTO kit_workspace_status_events (
      created_at, event_kind, command, revision_before, revision_after, details_json
    ) VALUES (?, 'set_current_phase', 'set-current-phase', 1, 2, ?)`
  ).run(
    "2026-05-01T12:00:00.000Z",
    JSON.stringify({ previousCurrentKitPhase: "99" })
  );
  assert.deepEqual(collectPhaseReleaseDatesByKey(db), {
    "98": "2026-01-01T00:00:00.000Z",
    "99": "2026-05-01T12:00:00.000Z"
  });
  db.close();
});

test("phase delivery history is first-class and overrides rollover release dates", () => {
  const db = openStatusDb();
  addDeliveryHistoryTable(db);
  db.prepare(
    `INSERT INTO kit_workspace_status_events (
      created_at, event_kind, command, revision_before, revision_after, details_json
    ) VALUES (?, 'set_current_phase', 'set-current-phase', 0, 1, ?)`
  ).run(
    "2026-01-01T00:00:00.000Z",
    JSON.stringify({ previousCurrentKitPhase: "131" })
  );
  const row = upsertPhaseDeliveryHistory(db, {
    phaseKey: "131",
    deliveredAt: "2026-06-04T14:00:47.000Z",
    releaseVersion: "0.99.27",
    gitTag: "v0.99.27",
    githubReleaseUrl: "https://github.com/example/repo/releases/tag/v0.99.27",
    npmPackage: "@workflow-cannon/workspace-kit@0.99.27",
    npmDistTag: "latest",
    releaseWorkflowUrl: "https://github.com/example/repo/actions/runs/1",
    mainCommitSha: "abc123",
    releaseBranch: "release/phase-131",
    releasePrUrl: "https://github.com/example/repo/pull/657",
    nowIso: "2026-06-04T14:01:00.000Z"
  });
  assert.equal(row.phaseKey, "131");
  assert.deepEqual(collectPhaseReleaseDatesByKey(db), {
    "131": "2026-06-04T14:00:47.000Z"
  });
  assert.deepEqual(collectDeliveredPhaseKeys(db, []), ["131"]);
  assert.equal(wasWorkspacePhaseRolledOut(db, "131"), true);
  assert.equal(collectPhaseDeliveryHistoryRows(db)[0].releaseVersion, "0.99.27");
  db.close();
});

test("collectDeliveredPhaseKeys excludes rolled-out phases without closeout readiness", () => {
  const db = openStatusDb();
  db.prepare(
    `INSERT INTO kit_workspace_status_events (
      created_at, event_kind, command, revision_before, revision_after, details_json
    ) VALUES (?, 'set_current_phase', 'set-current-phase', 0, 1, ?)`
  ).run(
    "2026-01-01T00:00:00.000Z",
    JSON.stringify({ previousCurrentKitPhase: "113" })
  );
  const tasks = [
    {
      id: "T1",
      status: "ready",
      phaseKey: "113",
      type: "phase_delivery",
      title: "Still open",
      createdAt: "",
      updatedAt: ""
    }
  ];
  assert.deepEqual(collectRolledOutPhaseKeys(db), ["113"]);
  assert.deepEqual(collectDeliveredPhaseKeys(db, tasks), []);
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
