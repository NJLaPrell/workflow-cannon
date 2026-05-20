import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";

import { appendRunLogRow } from "../dist/core/state/kit-run-log-sqlite.js";
import {
  readLatestRunLogRow,
  readRunLogByInvocationId
} from "../dist/core/state/kit-run-log-sqlite.js";
import { prepareKitSqliteDatabase } from "../dist/core/state/kit-sqlite/planning-sqlite-kernel.js";
import { runGetLastOutput } from "../dist/modules/task-engine/commands/get-last-output-command.js";

async function withWorkspace(fn) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "wk-get-last-output-"));
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

const INVOCATION_ID = "aaaaaaaa-bbbb-4ccc-dddd-eeeeeeeeeeee";

test("readRunLogByInvocationId and readLatestRunLogRow", async () => {
  await withWorkspace(async (dir) => {
    const cfg = { tasks: { persistenceBackend: "sqlite" } };
    appendRunLogRow({
      workspacePath: dir,
      effectiveConfig: cfg,
      invocationId: INVOCATION_ID,
      command: "list-tasks",
      commandArgs: {},
      response: { ok: true, code: "tasks-listed", data: { count: 1 } },
      startedAt: "2026-05-20T00:00:00.000Z",
      finishedAt: "2026-05-20T00:00:01.000Z"
    });
    const byId = readRunLogByInvocationId({
      workspacePath: dir,
      effectiveConfig: cfg,
      invocationId: INVOCATION_ID
    });
    assert.equal(byId?.command, "list-tasks");
    assert.equal(byId?.response.code, "tasks-listed");
    const latest = readLatestRunLogRow({ workspacePath: dir, effectiveConfig: cfg });
    assert.equal(latest?.invocationId, INVOCATION_ID);
  });
});

test("runGetLastOutput returns invocation-not-found for unknown id", async () => {
  await withWorkspace(async (dir) => {
    const res = runGetLastOutput(
      { workspacePath: dir, effectiveConfig: { tasks: { persistenceBackend: "sqlite" } } },
      { invocationId: "00000000-0000-4000-8000-000000000099" }
    );
    assert.equal(res.ok, false);
    assert.equal(res.code, "invocation-not-found");
    assert.ok(res.remediation?.instructionPath?.includes("get-last-output.md"));
  });
});

test("runGetLastOutput last:true returns most recent row", async () => {
  await withWorkspace(async (dir) => {
    const cfg = { tasks: { persistenceBackend: "sqlite" } };
    appendRunLogRow({
      workspacePath: dir,
      effectiveConfig: cfg,
      invocationId: INVOCATION_ID,
      command: "phase-status",
      commandArgs: {},
      response: { ok: true, code: "phase-status-read" },
      startedAt: "2026-05-20T01:00:00.000Z",
      finishedAt: "2026-05-20T01:00:01.000Z"
    });
    const res = runGetLastOutput({ workspacePath: dir, effectiveConfig: cfg }, { last: true });
    assert.equal(res.ok, true);
    assert.equal(res.code, "run-log-output-read");
    assert.equal(res.data?.invocationId, INVOCATION_ID);
    assert.equal(res.data?.command, "phase-status");
  });
});
