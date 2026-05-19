import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";

import { appendRunLogRow, resolveRunLogMaxRows } from "../dist/core/state/kit-run-log-sqlite.js";
import { redactRunLogValue } from "../dist/core/run-log-redaction.js";
import { prepareKitSqliteDatabase } from "../dist/core/state/kit-sqlite/planning-sqlite-kernel.js";

async function withDb(fn) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "wk-run-log-"));
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

test("redactRunLogValue redacts policyApproval.rationale", () => {
  const redacted = redactRunLogValue({
    policyApproval: { confirmed: true, rationale: "secret" }
  });
  assert.equal(
    /** @type {{ policyApproval: { rationale: string } }} */ (redacted).policyApproval.rationale,
    "[redacted]"
  );
});

test("appendRunLogRow enforces ring buffer max rows", async () => {
  await withDb(async (dir) => {
    const cfg = { tasks: { persistenceBackend: "sqlite" }, kit: { runLog: { maxRows: 3 } } };
    assert.equal(resolveRunLogMaxRows(cfg), 3);
    for (let i = 0; i < 5; i += 1) {
      appendRunLogRow({
        workspacePath: dir,
        effectiveConfig: cfg,
        invocationId: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
        command: "list-tasks",
        commandArgs: { policyApproval: { confirmed: true, rationale: `r${i}` } },
        response: { ok: true, code: "ok", invocationId: `id-${i}` },
        startedAt: `2026-01-0${i}T00:00:00.000Z`,
        finishedAt: `2026-01-0${i}T00:00:01.000Z`
      });
    }
    const db = new Database(path.join(dir, ".workspace-kit/tasks/workspace-kit.db"));
    const count = db.prepare("SELECT COUNT(*) AS c FROM kit_run_log").get().c;
    db.close();
    assert.equal(count, 3);
    const db2 = new Database(path.join(dir, ".workspace-kit/tasks/workspace-kit.db"));
    const rows = db2.prepare("SELECT args_redacted_json FROM kit_run_log ORDER BY id ASC").all();
    db2.close();
    assert.match(rows[0].args_redacted_json, /\[redacted\]/);
  });
});
