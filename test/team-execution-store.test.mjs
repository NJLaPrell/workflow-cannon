import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { prepareKitSqliteDatabase, KIT_SQLITE_USER_VERSION } from "../dist/core/state/workspace-kit-sqlite.js";
import {
  assertTeamExecutionKitSchema,
  insertAssignment,
  getAssignment,
  listAssignments,
  submitHandoff,
  reconcileAssignment,
  validateHandoffContractV1
} from "../dist/modules/team-execution/assignment-store.js";

test("kit sqlite migrates to v7 and team assignment DDL round-trips", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wk-team-ex-"));
  const dbPath = path.join(dir, "wk.db");
  const db = new Database(dbPath);
  try {
    prepareKitSqliteDatabase(db);
    const uv = db.pragma("user_version", { simple: true });
    assert.equal(uv, KIT_SQLITE_USER_VERSION);
    assert.equal(assertTeamExecutionKitSchema(dbPath).ok, true);

    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO task_engine_tasks (id, status, type, title, created_at, updated_at, archived, depends_on_json)
       VALUES ('T-test-1', 'ready', 'workspace-kit', 'fixture', ?, ?, 0, '[]')`
    ).run(now, now);

    insertAssignment(db, {
      id: "asg-1",
      executionTaskId: "T-test-1",
      supervisorId: "sup",
      workerId: "wrk",
      metadata: { note: "x" },
      now
    });
    const row = getAssignment(db, "asg-1");
    assert.ok(row);
    assert.equal(row.status, "assigned");
    assert.equal(row.executionTaskId, "T-test-1");

    const bad = validateHandoffContractV1({ schemaVersion: 1 });
    assert.equal(bad.ok, false);

    const hv = validateHandoffContractV1({ schemaVersion: 1, summary: "done" });
    assert.equal(hv.ok, true);
    assert.ok(submitHandoff(db, { assignmentId: "asg-1", workerId: "wrk", handoffJson: hv.json, now }));
    assert.equal(getAssignment(db, "asg-1").status, "submitted");

    assert.ok(
      reconcileAssignment(db, {
        assignmentId: "asg-1",
        supervisorId: "sup",
        checkpointJson: JSON.stringify({ schemaVersion: 1, mergedSummary: "ok" }),
        now
      })
    );
    assert.equal(getAssignment(db, "asg-1").status, "reconciled");

    const listed = listAssignments(db, { executionTaskId: "T-test-1" });
    assert.equal(listed.length, 1);
  } finally {
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
