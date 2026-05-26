import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

import { deriveTaskStateSyncState } from "../dist/modules/task-engine/persistence/task-state-sync-status.js";
import { runTaskStateHydrate } from "../dist/modules/task-engine/persistence/task-state-hydrate-runtime.js";
import { runTaskStateStatus } from "../dist/modules/task-engine/persistence/task-state-status-runtime.js";
import { TASK_STATE_GIT_BRANCH } from "../dist/modules/task-engine/task-state-git/constants.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const layoutSrc = path.join(
  repoRoot,
  "src/modules/task-engine/task-state-git/fixtures/branch-layout"
);

function runGit(cwd, args) {
  execFileSync("git", ["-C", cwd, ...args], { stdio: "pipe" });
}

function initFixtureRepo() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "wk-task-state-git-"));
  runGit(tmp, ["init"]);
  runGit(tmp, ["config", "user.email", "test@example.com"]);
  runGit(tmp, ["config", "user.name", "Test"]);
  fs.cpSync(layoutSrc, tmp, { recursive: true });
  runGit(tmp, ["add", "task-state"]);
  runGit(tmp, ["commit", "-m", "task-state genesis"]);
  runGit(tmp, ["branch", "-M", "main"]);
  runGit(tmp, ["branch", TASK_STATE_GIT_BRANCH]);
  return tmp;
}

test("deriveTaskStateSyncState covers missing, behind, current, conflict", () => {
  assert.equal(
    deriveTaskStateSyncState({
      branchResolvable: false,
      remoteLatestSequence: null,
      localAppliedSequence: 0,
      remoteTipSha: null,
      localSourceCommit: null
    }).syncState,
    "missing"
  );
  assert.equal(
    deriveTaskStateSyncState({
      branchResolvable: true,
      remoteLatestSequence: 5,
      localAppliedSequence: 2,
      remoteTipSha: "abc",
      localSourceCommit: "abc"
    }).syncState,
    "behind"
  );
  assert.equal(
    deriveTaskStateSyncState({
      branchResolvable: true,
      remoteLatestSequence: 3,
      localAppliedSequence: 3,
      remoteTipSha: "abc",
      localSourceCommit: "abc"
    }).syncState,
    "current"
  );
  assert.equal(
    deriveTaskStateSyncState({
      branchResolvable: true,
      remoteLatestSequence: 1,
      localAppliedSequence: 4,
      remoteTipSha: "abc",
      localSourceCommit: "abc"
    }).syncState,
    "conflict"
  );
});

function ensureGitIdentity(cwd) {
  runGit(cwd, ["config", "user.email", "test@example.com"]);
  runGit(cwd, ["config", "user.name", "Test"]);
}

test("task-state-status reports missing without branch", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "wk-task-state-missing-"));
  runGit(tmp, ["init"]);
  ensureGitIdentity(tmp);
  runGit(tmp, ["commit", "--allow-empty", "-m", "empty"]);
  const result = await runTaskStateStatus({ workspacePath: tmp, config: {} }, {});
  assert.equal(result.ok, true);
  assert.equal(result.data.syncState, "missing");
});

test("task-state-hydrate dry-run reads branch layout", async () => {
  const tmp = initFixtureRepo();
  const result = await runTaskStateHydrate(
    { workspacePath: tmp, config: {} },
    { dryRun: true, fetch: false, policyApproval: { confirmed: true, rationale: "test" } }
  );
  assert.equal(result.ok, true);
  assert.equal(result.code, "task-state-hydrate-dry-run");
  assert.equal(result.data.segmentCount, 1);
});

test("task-state-status current after hydrate on fixture repo", async () => {
  const tmp = initFixtureRepo();
  const hydrate = await runTaskStateHydrate(
    { workspacePath: tmp, config: { tasks: { persistenceBackend: "sqlite", sqliteDatabaseRelativePath: ".workspace-kit/tasks/workspace-kit.db" } } },
    {
      fetch: false,
      policyApproval: { confirmed: true, rationale: "test hydrate" }
    }
  );
  if (!hydrate.ok) {
    assert.fail(`hydrate failed: ${hydrate.message}`);
  }
  const status = await runTaskStateStatus({ workspacePath: tmp, config: {} }, { fetch: false });
  assert.equal(status.ok, true);
  assert.equal(status.data.syncState, "current");
});
