import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";

import {
  SESSION_GRANTS_JSON_REL,
  getSessionGrantRow,
  listSessionGrantRows,
  upsertSessionGrantRow
} from "../dist/core/state/kit-session-grants-sqlite.js";
import { prepareKitSqliteDatabase } from "../dist/core/state/kit-sqlite/planning-sqlite-kernel.js";

const SQLITE_CFG = { tasks: { persistenceBackend: "sqlite" } };

async function withTempWorkspace(fn) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "wk-session-grants-"));
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

test("session grants migrate JSON file to SQLite and stop using sidecar", async () => {
  await withTempWorkspace(async (dir) => {
    const jsonPath = path.join(dir, SESSION_GRANTS_JSON_REL);
    await fs.mkdir(path.dirname(jsonPath), { recursive: true });
    await fs.writeFile(
      jsonPath,
      JSON.stringify({
        schemaVersion: 1,
        sessionId: "default",
        grants: {
          "improvement.ingest-transcripts": {
            rationale: "session test",
            grantedAt: "2026-01-01T00:00:00.000Z"
          }
        }
      }),
      "utf8"
    );
    const grant = getSessionGrantRow(
      dir,
      "improvement.ingest-transcripts",
      "default",
      SQLITE_CFG
    );
    assert.equal(grant?.rationale, "session test");
    await assert.rejects(() => fs.access(jsonPath));
    upsertSessionGrantRow(
      dir,
      "cli.init",
      "default",
      "init ok",
      SQLITE_CFG
    );
    const rows = listSessionGrantRows(dir, SQLITE_CFG, "default");
    assert.equal(rows.length, 2);
  });
});
