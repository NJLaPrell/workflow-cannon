/**
 * Backend conformance harness — GitEventLogBackend + LocalOnlyBackend (T100621).
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

function ensureGitIdentity(cwd) {
  runGit(cwd, ["config", "user.email", "conformance@test"]);
  runGit(cwd, ["config", "user.name", "Conformance Test"]);
}

function createHarnessOptions(label) {
  let counter = 0;
  const numericSuffix = label === "local" ? "1" : "2";
  return {
    taskId: `T100621${numericSuffix}`,
    nextEventId: (suffix) => {
      counter += 1;
      return `evt-${label}-${suffix}-${counter}`;
    }
  };
}

async function seedGitEventLogBackend() {
  const { TASK_STATE_GIT_BRANCH } = await import(
    "../dist/modules/task-engine/task-state-git/constants.js"
  );
  const { createGitEventLogBackend } = await import(
    "../dist/modules/task-engine/sync-backends/git-event-log-backend.js"
  );
  const { resolveTaskStateGitRef } = await import(
    "../dist/modules/task-engine/task-state-git/git-io.js"
  );

  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "wk-conformance-git-"));
  const bare = fs.mkdtempSync(path.join(os.tmpdir(), "wk-conformance-bare-"));
  runGit(workspace, ["init"]);
  ensureGitIdentity(workspace);
  fs.cpSync(layoutSrc, workspace, { recursive: true });
  runGit(workspace, ["add", "task-state"]);
  runGit(workspace, ["commit", "-m", "task-state layout"]);
  runGit(workspace, ["branch", TASK_STATE_GIT_BRANCH]);
  runGit(bare, ["init", "--bare"]);
  runGit(workspace, ["remote", "add", "origin", bare]);
  runGit(workspace, ["push", "-u", "origin", TASK_STATE_GIT_BRANCH]);
  const resolved = resolveTaskStateGitRef(workspace, TASK_STATE_GIT_BRANCH);
  assert.equal("missing" in resolved, false);

  return {
    backend: createGitEventLogBackend({ workspacePath: workspace }),
    workspace
  };
}

describe("backend conformance harness", () => {
  it("LocalOnlyBackend passes shared harness", async () => {
    const { createLocalOnlyBackend } = await import(
      "../dist/modules/task-engine/sync-backends/local-only-backend.js"
    );
    const { runBackendConformanceHarness } = await import(
      "../dist/modules/task-engine/sync-backends/backend-conformance-harness.js"
    );

    const backend = createLocalOnlyBackend();
    const report = await runBackendConformanceHarness(backend, createHarnessOptions("local"));
    assert.equal(report.passed, true);
    assert.equal(report.backendId, "local-only");
    const scenarioNames = report.scenarios.map((row) => row.scenario);
    assert.ok(scenarioNames.includes("readHead"));
    assert.ok(scenarioNames.includes("publishBatch"));
    assert.ok(scenarioNames.includes("fetchEvents"));
    assert.ok(scenarioNames.includes("staleHeadReject"));
    assert.ok(scenarioNames.includes("idempotentRetry"));
    assert.ok(scenarioNames.includes("taskVersionConflict"));
    assert.ok(scenarioNames.includes("recovery"));
    assert.ok(scenarioNames.includes("verifyOptional"));
  });

  it("GitEventLogBackend passes shared harness", async () => {
    const { runBackendConformanceHarness } = await import(
      "../dist/modules/task-engine/sync-backends/backend-conformance-harness.js"
    );
    const { backend } = await seedGitEventLogBackend();
    const report = await runBackendConformanceHarness(backend, createHarnessOptions("git"));
    assert.equal(report.passed, true);
    assert.equal(report.backendId, "git-event-log");
    const scenarioNames = report.scenarios.map((row) => row.scenario);
    assert.ok(scenarioNames.includes("readHead"));
    assert.ok(scenarioNames.includes("publishBatch"));
    assert.ok(scenarioNames.includes("fetchEvents"));
    assert.ok(scenarioNames.includes("idempotentRetry"));
    assert.ok(scenarioNames.includes("taskVersionConflict"));
    assert.ok(scenarioNames.includes("recovery"));
    assert.ok(scenarioNames.includes("verifyOptional"));
  });
});
