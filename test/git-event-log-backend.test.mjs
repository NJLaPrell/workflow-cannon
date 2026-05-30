/**
 * GitEventLogBackend contract tests (T100617 / T-BE-202).
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const layoutSrc = path.join(repoRoot, "src/modules/task-engine/task-state-git/fixtures/branch-layout");

function runGit(cwd, args) {
  return execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8" }).trim();
}

function seedWorkspaceWithTaskStateBranch() {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "wk-git-backend-"));
  runGit(workspace, ["init"]);
  runGit(workspace, ["config", "user.email", "test@example.com"]);
  runGit(workspace, ["config", "user.name", "Test"]);
  fs.cpSync(layoutSrc, workspace, { recursive: true });
  runGit(workspace, ["add", "task-state"]);
  runGit(workspace, ["commit", "-m", "task-state layout"]);
  runGit(workspace, ["branch", "workflow-cannon/task-state"]);
  return workspace;
}

describe("GitEventLogBackend", () => {
  it("assertCanonicalStateSyncBackend accepts git backend", async () => {
    const { assertCanonicalStateSyncBackend } = await import(
      "../dist/modules/task-engine/sync-backends/canonical-state-sync-backend.js"
    );
    const { createGitEventLogBackend, GIT_EVENT_LOG_BACKEND_ID } = await import(
      "../dist/modules/task-engine/sync-backends/git-event-log-backend.js"
    );
    const workspace = seedWorkspaceWithTaskStateBranch();
    const backend = createGitEventLogBackend({ workspacePath: workspace });
    assert.doesNotThrow(() => assertCanonicalStateSyncBackend(backend));
    assert.equal(backend.backendId, GIT_EVENT_LOG_BACKEND_ID);
  });

  it("readHead returns generic head without git-specific top-level fields", async () => {
    const { createGitEventLogBackend } = await import(
      "../dist/modules/task-engine/sync-backends/git-event-log-backend.js"
    );
    const workspace = seedWorkspaceWithTaskStateBranch();
    const backend = createGitEventLogBackend({ workspacePath: workspace });
    const head = await backend.readHead();
    assert.equal("ok" in head && head.ok === false, false);
    assert.equal(typeof head.backendRevision, "string");
    assert.equal(head.latestSequence >= 0, true);
    assert.equal("branch" in head, false);
    assert.equal("tipSha" in head, false);
  });

  it("fetchEvents returns admitted events and version rows", async () => {
    const { createGitEventLogBackend } = await import(
      "../dist/modules/task-engine/sync-backends/git-event-log-backend.js"
    );
    const workspace = seedWorkspaceWithTaskStateBranch();
    const backend = createGitEventLogBackend({ workspacePath: workspace });
    const fetched = await backend.fetchEvents({ refresh: false });
    assert.equal(fetched.ok, true);
    assert.ok(Array.isArray(fetched.events));
    assert.ok(Array.isArray(fetched.taskVersions));
    assert.ok(Array.isArray(fetched.planningVersions));
    assert.equal(fetched.planningVersions[0]?.domain, "workspace");
  });

  it("verify passes on branch-layout fixture", async () => {
    const { createGitEventLogBackend } = await import(
      "../dist/modules/task-engine/sync-backends/git-event-log-backend.js"
    );
    const workspace = seedWorkspaceWithTaskStateBranch();
    const backend = createGitEventLogBackend({ workspacePath: workspace });
    const verified = await backend.verify();
    assert.equal(verified.passed, true);
    assert.equal(verified.findingCount, 0);
  });

  it("compact dry-run succeeds", async () => {
    const { createGitEventLogBackend } = await import(
      "../dist/modules/task-engine/sync-backends/git-event-log-backend.js"
    );
    const workspace = seedWorkspaceWithTaskStateBranch();
    const backend = createGitEventLogBackend({ workspacePath: workspace });
    const compact = await backend.compact({ dryRun: true });
    assert.equal(compact.ok, true);
    assert.equal(compact.dryRun, true);
  });

  it("git compat map still covers all backend methods", async () => {
    const { GIT_EVENT_LOG_BACKEND_COMPAT } = await import(
      "../dist/modules/task-engine/sync-backends/git-method-compat.js"
    );
    const methods = new Set(GIT_EVENT_LOG_BACKEND_COMPAT.map((entry) => entry.backendMethod));
    for (const required of ["readHead", "fetchEvents", "publishEvents", "verify", "compact", "snapshot"]) {
      assert.ok(methods.has(required), `missing compat entry for ${required}`);
    }
  });
});
