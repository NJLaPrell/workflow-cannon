import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";

import { appendPolicyTrace } from "../dist/core/policy.js";
import {
  POLICY_TRACES_JSONL_REL,
  importPolicyTracesJsonlIfNeeded,
  listPolicyTracesAfterId,
  openKitPolicyTraceDatabase,
  readPolicyTracesAfterId
} from "../dist/core/state/kit-policy-traces-sqlite.js";
import { ingestPolicyDenials } from "../dist/modules/improvement/ingest.js";
import { emptyImprovementState } from "../dist/modules/improvement/improvement-state.js";
import { prepareKitSqliteDatabase } from "../dist/core/state/kit-sqlite/planning-sqlite-kernel.js";

const SQLITE_CFG = { tasks: { persistenceBackend: "sqlite" } };

async function withTempWorkspace(fn) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "wk-policy-traces-"));
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

test("appendPolicyTrace writes SQLite rows and imports legacy jsonl once", async () => {
  await withTempWorkspace(async (dir) => {
    const jsonlPath = path.join(dir, POLICY_TRACES_JSONL_REL);
    await fs.mkdir(path.dirname(jsonlPath), { recursive: true });
    await fs.writeFile(
      jsonlPath,
      `${JSON.stringify({
        schemaVersion: 1,
        timestamp: "2026-01-01T00:00:00.000Z",
        operationId: "tasks.run-transition",
        command: "run run-transition",
        actor: "op",
        allowed: false,
        rationale: "nope"
      })}\n`,
      "utf8"
    );
    await appendPolicyTrace(
      dir,
      {
        timestamp: "2026-01-02T00:00:00.000Z",
        operationId: "cli.config-mutate",
        command: "config",
        actor: "op",
        allowed: true
      },
      SQLITE_CFG
    );
    await assert.rejects(() => fs.access(jsonlPath));
    const rows = readPolicyTracesAfterId(dir, 0, SQLITE_CFG);
    assert.equal(rows.length, 2);
    assert.equal(rows[0].allowed, false);
    assert.equal(rows[1].allowed, true);
  });
});

test("ingestPolicyDenials parity: sqlite id cursor matches jsonl line slice", async () => {
  await withTempWorkspace(async (dir) => {
    const deny = {
      schemaVersion: 1,
      timestamp: "2026-01-01T00:00:00.000Z",
      operationId: "tasks.run-transition",
      command: "run run-transition",
      actor: "a@b.c",
      allowed: false,
      rationale: "missing approval"
    };
    const allow = {
      schemaVersion: 1,
      timestamp: "2026-01-02T00:00:00.000Z",
      operationId: "cli.init",
      command: "init",
      actor: "a@b.c",
      allowed: true
    };
    const jsonlPath = path.join(dir, POLICY_TRACES_JSONL_REL);
    await fs.mkdir(path.dirname(jsonlPath), { recursive: true });
    await fs.writeFile(jsonlPath, `${JSON.stringify(deny)}\n${JSON.stringify(allow)}\n`, "utf8");

    const db = openKitPolicyTraceDatabase(dir, SQLITE_CFG);
    importPolicyTracesJsonlIfNeeded(db, dir);
    db.close();

    const stateSqlite = emptyImprovementState();
    const sqliteCandidates = await ingestPolicyDenials(dir, stateSqlite, 1, SQLITE_CFG);
    assert.equal(sqliteCandidates.length, 1);
    assert.equal(stateSqlite.lastIngestedPolicyTraceId, 2);

    const stateReplay = emptyImprovementState();
    stateReplay.lastIngestedPolicyTraceId = 0;
    const replayCandidates = await ingestPolicyDenials(dir, stateReplay, 1, SQLITE_CFG);
    assert.equal(replayCandidates.length, 1);
    assert.deepEqual(replayCandidates[0].evidenceKey, sqliteCandidates[0].evidenceKey);
  });
});
