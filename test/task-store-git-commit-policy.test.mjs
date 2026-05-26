import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

import {
  collectTaskStoreSqliteStagedIssues,
  filterStagedTaskStoreSqlitePaths,
  hasTaskStoreCommitApproval,
  isTaskStoreSqliteGitPath,
  TASK_STORE_COMMIT_APPROVAL_RELATIVE
} from "../dist/core/task-store-git-commit-policy.js";

test("isTaskStoreSqliteGitPath matches db and wal/shm under tasks/", () => {
  assert.equal(isTaskStoreSqliteGitPath(".workspace-kit/tasks/workspace-kit.db"), true);
  assert.equal(isTaskStoreSqliteGitPath(".workspace-kit/tasks/workspace-kit.db-wal"), true);
  assert.equal(isTaskStoreSqliteGitPath(".workspace-kit/tasks/foo.db-shm"), true);
  assert.equal(isTaskStoreSqliteGitPath("src/foo.db"), false);
});

test("filterStagedTaskStoreSqlitePaths scopes to configured db basename", () => {
  const dbRel = ".workspace-kit/tasks/workspace-kit.db";
  const hits = filterStagedTaskStoreSqlitePaths(
    [".workspace-kit/tasks/workspace-kit.db", ".workspace-kit/tasks/other.db"],
    dbRel
  );
  assert.deepEqual(hits, [".workspace-kit/tasks/workspace-kit.db"]);
});

test("collectTaskStoreSqliteStagedIssues passes without staged db", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "wk-task-store-commit-"));
  try {
    const init = spawnSync("git", ["init"], { cwd: tmp, encoding: "utf8" });
    assert.equal(init.status, 0);
    const issues = collectTaskStoreSqliteStagedIssues({
      workspacePath: tmp,
      sqliteDatabaseRelativePath: ".workspace-kit/tasks/workspace-kit.db"
    });
    assert.equal(issues.length, 0);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("collectTaskStoreSqliteStagedIssues fails when db staged without approval", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "wk-task-store-commit-"));
  const dbDir = path.join(tmp, ".workspace-kit", "tasks");
  const dbRel = ".workspace-kit/tasks/workspace-kit.db";
  try {
    spawnSync("git", ["init"], { cwd: tmp });
    fs.mkdirSync(dbDir, { recursive: true });
    fs.writeFileSync(path.join(dbDir, "workspace-kit.db"), "sqlite-placeholder");
    spawnSync("git", ["add", dbRel], { cwd: tmp });
    const issues = collectTaskStoreSqliteStagedIssues({
      workspacePath: tmp,
      sqliteDatabaseRelativePath: dbRel
    });
    assert.equal(issues.length, 1);
    assert.match(issues[0].reason, /task-store-sqlite-staged-without-approval/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("hasTaskStoreCommitApproval reads approval file", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "wk-task-store-approval-"));
  try {
    const approvalDir = path.join(tmp, path.dirname(TASK_STORE_COMMIT_APPROVAL_RELATIVE));
    fs.mkdirSync(approvalDir, { recursive: true });
    fs.writeFileSync(
      path.join(tmp, TASK_STORE_COMMIT_APPROVAL_RELATIVE),
      JSON.stringify({ confirmed: true, rationale: "recovery" })
    );
    assert.equal(hasTaskStoreCommitApproval(tmp), true);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
