import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtemp } from "node:fs/promises";
import Database from "better-sqlite3";

import { prepareKitSqliteDatabase } from "../dist/core/state/workspace-kit-sqlite.js";
import {
  agentActivityLeaseToDashboardStatus,
  clearAgentActivityLeases,
  heartbeatAgentActivityLease,
  listCurrentAgentActivityLeases,
  readCurrentAgentActivityLease,
  setAgentActivityLease
} from "../dist/modules/task-engine/agent-activity-store.js";

async function openDb() {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "wk-agent-activity-"));
  const db = new Database(path.join(workspace, "workspace-kit.db"));
  prepareKitSqliteDatabase(db);
  return db;
}

test("agent activity leases set, heartbeat, clear, and project to dashboard status", async () => {
  const db = await openDb();
  try {
    const lease = setAgentActivityLease(db, {
      activityId: "copilot:session-1",
      agentId: "copilot",
      sessionId: "session-1",
      kind: "working_task",
      label: "Working on Task T100",
      phaseKey: "81",
      now: "2026-05-06T10:00:00.000Z",
      expiresAt: "2026-05-06T10:05:00.000Z",
      details: { detail: "from test" }
    });
    assert.equal(lease.schemaVersion, 1);
    assert.equal(lease.activityId, "copilot:session-1");
    assert.equal(readCurrentAgentActivityLease(db, "2026-05-06T10:01:00.000Z")?.label, "Working on Task T100");

    const heartbeat = heartbeatAgentActivityLease(db, {
      activityId: "copilot:session-1",
      now: "2026-05-06T10:02:00.000Z",
      expiresAt: "2026-05-06T10:07:00.000Z"
    });
    assert.equal(heartbeat?.updatedAt, "2026-05-06T10:02:00.000Z");
    assert.equal(heartbeat?.expiresAt, "2026-05-06T10:07:00.000Z");

    const status = agentActivityLeaseToDashboardStatus(heartbeat);
    assert.equal(status.source, "live_activity");
    assert.equal(status.kind, "working_task");
    assert.equal(status.detail, "from test");

    assert.equal(clearAgentActivityLeases(db, { agentId: "copilot", sessionId: "session-1" }), 1);
    assert.equal(readCurrentAgentActivityLease(db, "2026-05-06T10:03:00.000Z"), null);
  } finally {
    db.close();
  }
});

test("agent activity leases expire and ignore unknown or corrupt rows", async () => {
  const db = await openDb();
  try {
    setAgentActivityLease(db, {
      activityId: "expired",
      agentId: "copilot",
      sessionId: "old",
      kind: "planning",
      label: "Planning Interview",
      now: "2026-05-06T09:00:00.000Z",
      expiresAt: "2026-05-06T09:01:00.000Z"
    });
    db.prepare(
      `INSERT INTO kit_agent_activity_leases (
        activity_id, agent_id, session_id, kind, label, started_at, updated_at, expires_at, details_json
      ) VALUES (?,?,?,?,?,?,?,?,?)`
    ).run(
      "bad-kind",
      "copilot",
      "bad",
      "unknown_kind",
      "Unknown",
      "2026-05-06T10:00:00.000Z",
      "2026-05-06T10:00:00.000Z",
      "2026-05-06T10:05:00.000Z",
      null
    );
    db.prepare(
      `INSERT INTO kit_agent_activity_leases (
        activity_id, agent_id, session_id, kind, label, started_at, updated_at, expires_at, details_json
      ) VALUES (?,?,?,?,?,?,?,?,?)`
    ).run(
      "bad-json",
      "copilot",
      "bad-json",
      "validating",
      "Validating",
      "2026-05-06T10:01:00.000Z",
      "2026-05-06T10:01:00.000Z",
      "2026-05-06T10:06:00.000Z",
      "NOT JSON"
    );

    const current = listCurrentAgentActivityLeases(db, "2026-05-06T10:02:00.000Z");
    assert.equal(current.length, 1);
    assert.equal(current[0].activityId, "bad-json");
    assert.equal(current[0].details, null);
  } finally {
    db.close();
  }
});