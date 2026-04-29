import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { prepareKitSqliteDatabase, KIT_SQLITE_USER_VERSION } from "../dist/core/state/workspace-kit-sqlite.js";
import {
  insertDefinition,
  getDefinitionById,
  insertSession,
  getSession,
  insertMessage,
  listMessagesForSession,
  assertSubagentKitSchema
} from "../dist/modules/subagents/subagent-store.js";

test("kit sqlite migrates to v6 and subagent DDL is usable", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wk-subagent-"));
  const dbPath = path.join(dir, "wk.db");
  const db = new Database(dbPath);
  try {
    prepareKitSqliteDatabase(db);
    const uv = db.pragma("user_version", { simple: true });
    assert.equal(uv, KIT_SQLITE_USER_VERSION);
    assert.ok(uv >= 6);
    const ok = assertSubagentKitSchema(dbPath);
    assert.equal(ok.ok, true);
    const now = new Date().toISOString();
    insertDefinition(db, {
      id: "test-agent",
      displayName: "Test",
      description: "d",
      allowedCommands: ["list-tasks"],
      metadata: null,
      now
    });
    const def = getDefinitionById(db, "test-agent");
    assert.ok(def);
    assert.deepEqual(def.allowedCommands, ["list-tasks"]);
    insertSession(db, {
      id: "sess-1",
      definitionId: "test-agent",
      executionTaskId: null,
      status: "open",
      hostHint: "cursor",
      metadata: null,
      now
    });
    const s = getSession(db, "sess-1");
    assert.ok(s);
    insertMessage(db, { sessionId: "sess-1", direction: "outbound", body: "hello", now });
    const msgs = listMessagesForSession(db, "sess-1");
    assert.equal(msgs.length, 1);
    assert.equal(msgs[0].body, "hello");
  } finally {
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
