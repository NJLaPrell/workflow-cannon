import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";

import { runTaskStateInit } from "../dist/modules/task-engine/persistence/task-state-init-runtime.js";
import { TASK_STATE_GIT_BRANCH } from "../dist/modules/task-engine/task-state-git/constants.js";
import { resolveTaskStateGitRef } from "../dist/modules/task-engine/task-state-git/git-io.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const layoutSrc = path.join(
  repoRoot,
  "src/modules/task-engine/task-state-git/fixtures/branch-layout"
);

function runGit(cwd, args) {
  execFileSync("git", ["-C", cwd, ...args], { stdio: "pipe" });
}

function ensureGitIdentity(cwd) {
  runGit(cwd, ["config", "user.email", "test@example.com"]);
  runGit(cwd, ["config", "user.name", "Test"]);
}

async function seedWorkspaceWithSqlite() {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "wk-task-state-init-"));
  runGit(workspace, ["init"]);
  ensureGitIdentity(workspace);
  runGit(workspace, ["commit", "--allow-empty", "-m", "root"]);
  const dbDir = path.join(workspace, ".workspace-kit", "tasks");
  fs.mkdirSync(dbDir, { recursive: true });
  const dbPath = path.join(dbDir, "workspace-kit.db");
  const db = new Database(dbPath);
  const { prepareKitSqliteDatabase } = await import("../dist/core/state/workspace-kit-sqlite.js");
  prepareKitSqliteDatabase(db);
  db.close();
  return workspace;
}

test("task-state-init refuses when branch already exists", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "wk-task-state-init-refuse-"));
  runGit(workspace, ["init"]);
  ensureGitIdentity(workspace);
  fs.cpSync(layoutSrc, workspace, { recursive: true });
  runGit(workspace, ["add", "task-state"]);
  runGit(workspace, ["commit", "-m", "existing task-state"]);
  runGit(workspace, ["branch", TASK_STATE_GIT_BRANCH]);

  const result = await runTaskStateInit(
    { workspacePath: workspace, config: {} },
    { policyApproval: { confirmed: true, rationale: "test" } }
  );
  assert.equal(result.ok, false);
  assert.equal(result.code, "task-state-branch-exists");
});

test("task-state-init dry-run bootstraps layout preview from sqlite", async () => {
  const workspace = await seedWorkspaceWithSqlite();
  const result = await runTaskStateInit(
    { workspacePath: workspace, config: {} },
    { dryRun: true, push: false, policyApproval: { confirmed: true, rationale: "test" } }
  );
  assert.equal(result.ok, true);
  assert.equal(result.code, "task-state-init-dry-run");
  assert.equal(result.data.branch, TASK_STATE_GIT_BRANCH);
  assert.equal(typeof result.data.taskCount, "number");
});

test("task-state-init creates branch in worktree without push", async () => {
  const workspace = await seedWorkspaceWithSqlite();
  const result = await runTaskStateInit(
    { workspacePath: workspace, config: {} },
    {
      push: false,
      policyApproval: { confirmed: true, rationale: "test local bootstrap" }
    }
  );
  assert.equal(result.ok, true, result.message);
  assert.equal(result.code, "task-state-init-complete");
  const resolved = resolveTaskStateGitRef(workspace, TASK_STATE_GIT_BRANCH);
  assert.equal("missing" in resolved, false);
});
