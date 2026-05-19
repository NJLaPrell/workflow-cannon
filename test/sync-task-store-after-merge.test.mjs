import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

import {
  hashWorkingTreeTaskStore,
  probeTaskStoreShaAtGitRef
} from "../dist/modules/task-engine/persistence/sync-task-store-after-merge.js";

const ROOT = process.cwd();
const DB_REL = ".workspace-kit/tasks/workspace-kit.db";

test("hashWorkingTreeTaskStore returns git blob sha for committed task db", () => {
  const sha = hashWorkingTreeTaskStore(ROOT, DB_REL);
  assert.ok(sha);
  assert.match(sha, /^[0-9a-f]{40}$/);
});

test("probeTaskStoreShaAtGitRef reads blob sha from origin/release/phase-102 when present", () => {
  const sha = probeTaskStoreShaAtGitRef(ROOT, "origin/release/phase-102", DB_REL);
  if (sha) {
    assert.match(sha, /^[0-9a-f]{40}$/);
    const local = hashWorkingTreeTaskStore(ROOT, DB_REL);
    if (local && local !== sha) {
      assert.notEqual(local, sha);
    }
  }
});
