import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";

import { KIT_SQLITE_USER_VERSION, prepareKitSqliteDatabase } from "../dist/core/state/workspace-kit-sqlite.js";

test("prepareKitSqliteDatabase v39 expands task status CHECK for human-gate states", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "wk-human-gate-status-migration-"));
  const dbPath = path.join(workspace, "workspace-kit.db");
  const now = new Date().toISOString();
  try {
    const seedDb = new Database(dbPath);
    seedDb.exec(`
CREATE TABLE task_engine_tasks (
  id TEXT PRIMARY KEY NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('research','proposed','ready','in_progress','blocked','completed','cancelled')),
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1)),
  archived_at TEXT,
  priority TEXT CHECK (priority IS NULL OR priority IN ('P1','P2','P3')),
  phase TEXT,
  phase_key TEXT,
  ownership TEXT,
  approach TEXT,
  depends_on_json TEXT NOT NULL DEFAULT '[]',
  unblocks_json TEXT NOT NULL DEFAULT '[]',
  technical_scope_json TEXT,
  acceptance_criteria_json TEXT,
  summary TEXT,
  description TEXT,
  risk TEXT,
  queue_namespace TEXT,
  evidence_key TEXT,
  evidence_kind TEXT,
  metadata_json TEXT,
  features_json TEXT NOT NULL DEFAULT '[]'
);
`);
    seedDb
      .prepare(
        `INSERT INTO task_engine_tasks (
          id, status, type, title, created_at, updated_at, archived, depends_on_json, unblocks_json, features_json
        ) VALUES (?, ?, ?, ?, ?, ?, 0, '[]', '[]', '[]')`
      )
      .run("T900", "ready", "workspace-kit", "legacy strict row", now, now);
    seedDb.pragma("user_version = 38");
    seedDb.close();

    const migratedDb = new Database(dbPath);
    prepareKitSqliteDatabase(migratedDb);

    assert.equal(Number(migratedDb.pragma("user_version", { simple: true })), KIT_SQLITE_USER_VERSION);
    const tableSqlRow = migratedDb
      .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'task_engine_tasks'")
      .get();
    assert.match(String(tableSqlRow.sql), /awaiting_review/);
    assert.match(String(tableSqlRow.sql), /awaiting_policy_approval/);
    assert.match(String(tableSqlRow.sql), /awaiting_external_decision/);

    migratedDb.prepare("UPDATE task_engine_tasks SET status = ? WHERE id = ?").run("awaiting_review", "T900");
    const row = migratedDb.prepare("SELECT status FROM task_engine_tasks WHERE id = ?").get("T900");
    assert.equal(row.status, "awaiting_review");

    migratedDb.close();
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});
