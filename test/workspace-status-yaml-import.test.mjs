import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { mkdtemp } from "node:fs/promises";
import Database from "better-sqlite3";

import { prepareKitSqliteDatabase } from "../dist/core/state/workspace-kit-sqlite.js";
import { syncWorkspaceKitStatusFromYamlIfNeeded } from "../dist/modules/task-engine/persistence/workspace-status-yaml-import.js";

test("syncWorkspaceKitStatusFromYamlIfNeeded imports YAML when config and YAML phases agree", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "wk-ws-import-"));
  const yamlDir = path.join(workspace, "docs/maintainers/data");
  fs.mkdirSync(yamlDir, { recursive: true });
  fs.writeFileSync(
    path.join(workspace, "docs/maintainers/data/workspace-kit-status.yaml"),
    [
      'current_kit_phase: "67"',
      'next_kit_phase: "68"',
      'active_focus: "test focus"',
      'last_updated: "2026-04-08"',
      "blockers: []",
      "pending_decisions: []",
      "next_agent_actions: []",
      ""
    ].join("\n"),
    "utf8"
  );
  fs.mkdirSync(path.join(workspace, ".workspace-kit"), { recursive: true });
  fs.writeFileSync(
    path.join(workspace, ".workspace-kit/config.json"),
    JSON.stringify({ kit: { currentPhaseNumber: 67 } }),
    "utf8"
  );

  const dbPath = path.join(workspace, "kit.db");
  const db = new Database(dbPath);
  try {
    prepareKitSqliteDatabase(db);
    syncWorkspaceKitStatusFromYamlIfNeeded(workspace, db);
    const row = db
      .prepare("SELECT workspace_revision, current_kit_phase, active_focus FROM kit_workspace_status WHERE id = 1")
      .get();
    assert.equal(row.workspace_revision, 1);
    assert.equal(row.current_kit_phase, "67");
    assert.equal(row.active_focus, "test focus");
    const ev = db.prepare("SELECT COUNT(*) AS c FROM kit_workspace_status_events").get();
    assert.equal(ev.c, 1);
  } finally {
    db.close();
  }
});

test("syncWorkspaceKitStatusFromYamlIfNeeded imports YAML when config phase disagrees (YAML wins)", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "wk-ws-conflict-"));
  const yamlDir = path.join(workspace, "docs/maintainers/data");
  fs.mkdirSync(yamlDir, { recursive: true });
  fs.writeFileSync(
    path.join(workspace, "docs/maintainers/data/workspace-kit-status.yaml"),
    ['current_kit_phase: "67"', 'next_kit_phase: "68"', ""].join("\n"),
    "utf8"
  );
  fs.mkdirSync(path.join(workspace, ".workspace-kit"), { recursive: true });
  fs.writeFileSync(
    path.join(workspace, ".workspace-kit/config.json"),
    JSON.stringify({ kit: { currentPhaseNumber: 66 } }),
    "utf8"
  );

  const dbPath = path.join(workspace, "kit.db");
  const db = new Database(dbPath);
  try {
    prepareKitSqliteDatabase(db);
    syncWorkspaceKitStatusFromYamlIfNeeded(workspace, db);
    const row = db
      .prepare("SELECT workspace_revision, current_kit_phase FROM kit_workspace_status WHERE id = 1")
      .get();
    assert.equal(row.workspace_revision, 1);
    assert.equal(row.current_kit_phase, "67");
  } finally {
    db.close();
  }
});
