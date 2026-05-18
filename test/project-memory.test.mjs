import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { explainMemoryPrecedence } from "../dist/modules/project-memory/precedence.js";
import {
  approveMemoryRecord,
  listMemoryRecords,
  pruneMemoryRecord,
  upsertMemoryDraft
} from "../dist/modules/project-memory/memory-store.js";

test("project memory draft → approve → prune with precedence story", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "wk-mem-"));
  try {
    const draft = upsertMemoryDraft(root, {
      category: "runtime",
      body: "Prefer pnpm exec wk over pnpm run wk for JSON argv."
    });
    assert.equal(draft.status, "draft");
    const approved = approveMemoryRecord(root, draft.id);
    assert.equal(approved.status, "approved");
    assert.ok(approved.approvedAt);
    pruneMemoryRecord(root, draft.id, "superseded by canon doc");
    const pruned = listMemoryRecords(root, { status: "pruned" });
    assert.equal(pruned.length, 1);
    assert.match(pruned[0].pruneAuditNote ?? "", /superseded/);
    const explained = explainMemoryPrecedence(root);
    assert.ok(explained.mergeStory.length >= 5);
    assert.equal(explained.approvedMemoryCount, 0);
    assert.equal(explained.draftMemoryCount, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
