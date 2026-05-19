import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  appendDecisionRecord,
  computeDecisionFingerprint,
  listApprovalDecisionRecords,
  readDecisionFingerprints
} from "../dist/modules/approvals/decisions-store.js";
import { appendSkillApplyAudit } from "../dist/modules/skills/apply-audit.js";
import {
  APPROVAL_DECISIONS_JSONL_REL,
  SKILL_APPLY_AUDIT_JSONL_REL
} from "../dist/core/state/kit-audit-sqlite.js";
import { prepareKitSqliteDatabase } from "../dist/core/state/kit-sqlite/planning-sqlite-kernel.js";
import Database from "better-sqlite3";

async function withTempWorkspace(fn) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "wk-audit-sqlite-"));
  const dbRel = ".workspace-kit/tasks/workspace-kit.db";
  const dbPath = path.join(dir, dbRel);
  await fs.mkdir(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  prepareKitSqliteDatabase(db);
  db.close();
  const cfg = { tasks: { persistenceBackend: "sqlite" } };
  try {
    await fn(dir, cfg);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

test("appendDecisionRecord persists to SQLite and imports legacy jsonl once", async () => {
  await withTempWorkspace(async (dir, cfg) => {
    const jsonlPath = path.join(dir, APPROVAL_DECISIONS_JSONL_REL);
    await fs.mkdir(path.dirname(jsonlPath), { recursive: true });
    const fp = computeDecisionFingerprint("T1", "accept", "ev-1");
    await fs.writeFile(
      jsonlPath,
      `${JSON.stringify({
        schemaVersion: 1,
        fingerprint: fp,
        taskId: "T1",
        evidenceKey: "ev-1",
        decisionVerb: "accept",
        actor: "op",
        timestamp: "2026-01-01T00:00:00.000Z"
      })}\n`,
      "utf8"
    );
    const set = await readDecisionFingerprints(dir, cfg);
    assert.equal(set.has(fp), true);
    await assert.rejects(() => fs.access(jsonlPath));
    const rows = await listApprovalDecisionRecords(dir, cfg);
    assert.equal(rows.length, 1);
    await appendDecisionRecord(
      dir,
      {
        fingerprint: computeDecisionFingerprint("T2", "decline", "ev-2"),
        taskId: "T2",
        evidenceKey: "ev-2",
        decisionVerb: "decline",
        actor: "op"
      },
      cfg
    );
    assert.equal((await readDecisionFingerprints(dir, cfg)).size, 2);
  });
});

test("appendSkillApplyAudit does not write skill-apply-audit.jsonl", async () => {
  await withTempWorkspace(async (dir, cfg) => {
    appendSkillApplyAudit(
      dir,
      {
        schemaVersion: 1,
        at: "2026-01-02T00:00:00.000Z",
        skillId: "sample",
        actor: "agent",
        dryRun: false,
        recordAudit: true
      },
      cfg
    );
    const jsonlPath = path.join(dir, SKILL_APPLY_AUDIT_JSONL_REL);
    await assert.rejects(() => fs.access(jsonlPath));
  });
});
