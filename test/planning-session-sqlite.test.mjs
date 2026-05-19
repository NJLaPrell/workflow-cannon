import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";

import {
  BEHAVIOR_INTERVIEW_SESSION_SIDECAR_REL,
  persistBehaviorInterviewSession,
  readBehaviorInterviewSession
} from "../dist/modules/agent-behavior/interview-session-file.js";
import { prepareKitSqliteDatabase } from "../dist/core/state/kit-sqlite/planning-sqlite-kernel.js";

const SQLITE_CFG = { tasks: { persistenceBackend: "sqlite" } };

async function withTempWorkspace(fn) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "wk-session-sqlite-"));
  const dbRel = ".workspace-kit/tasks/workspace-kit.db";
  const dbPath = path.join(dir, dbRel);
  await fs.mkdir(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  prepareKitSqliteDatabase(db);
  db.close();
  try {
    await fn(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

test("behavior interview session migrates sidecar to SQLite", async () => {
  await withTempWorkspace(async (dir) => {
    const sidecarPath = path.join(dir, BEHAVIOR_INTERVIEW_SESSION_SIDECAR_REL);
    await fs.mkdir(path.dirname(sidecarPath), { recursive: true });
    await fs.writeFile(
      sidecarPath,
      JSON.stringify({
        schemaVersion: 1,
        updatedAt: "2026-01-01T00:00:00.000Z",
        stepIndex: 1,
        answers: { role: "wizard" }
      }),
      "utf8"
    );
    const loaded = await readBehaviorInterviewSession(dir, SQLITE_CFG);
    assert.equal(loaded?.stepIndex, 1);
    await assert.rejects(() => fs.access(sidecarPath));
    await persistBehaviorInterviewSession(dir, { stepIndex: 2, answers: { role: "wizard" } }, SQLITE_CFG);
    const again = await readBehaviorInterviewSession(dir, SQLITE_CFG);
    assert.equal(again?.stepIndex, 2);
  });
});
