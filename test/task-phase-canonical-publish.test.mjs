import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

import { taskEngineModule } from "../dist/index.js";
import { TASK_STATE_GIT_BRANCH } from "../dist/modules/task-engine/task-state-git/constants.js";

function runGit(cwd, args) {
  return execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8" }).trim();
}

function ensureGitIdentity(cwd) {
  runGit(cwd, ["config", "user.email", "test@example.com"]);
  runGit(cwd, ["config", "user.name", "Test"]);
}

function sqliteTaskEngineCtx(workspace, partialEffective = {}) {
  const rawTasks = partialEffective.tasks;
  const taskExtra = rawTasks && typeof rawTasks === "object" && !Array.isArray(rawTasks) ? rawTasks : {};
  const { tasks: _drop, ...restTop } = partialEffective;
  return {
    runtimeVersion: "0.1",
    workspacePath: workspace,
    effectiveConfig: {
      ...restTop,
      tasks: {
        persistenceBackend: "sqlite",
        sqliteDatabaseRelativePath: ".workspace-kit/tasks/workspace-kit.db",
        ...taskExtra
      }
    }
  };
}

async function seedCanonicalWorkspace() {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "wk-phase-canonical-"));
  const bare = fs.mkdtempSync(path.join(os.tmpdir(), "wk-phase-canonical-bare-"));
  runGit(workspace, ["init"]);
  ensureGitIdentity(workspace);
  runGit(workspace, ["commit", "--allow-empty", "-m", "root"]);
  runGit(bare, ["init", "--bare"]);
  runGit(workspace, ["remote", "add", "origin", bare]);

  const sqliteCtx = sqliteTaskEngineCtx(workspace);
  const created = await taskEngineModule.onCommand(
    { name: "create-task", args: { id: "T777", title: "Canonical phase task", status: "ready" } },
    sqliteCtx
  );
  assert.equal(created.ok, true, created.message);

  const init = await taskEngineModule.onCommand(
    {
      name: "task-state-init",
      args: {
        push: true,
        policyApproval: { confirmed: true, rationale: "bootstrap canonical task-state for phase mutation test" }
      }
    },
    sqliteCtx
  );
  assert.equal(init.ok, true, init.message);
  assert.equal(init.code, "task-state-init-complete");
  assert.equal(runGit(workspace, ["rev-parse", `origin/${TASK_STATE_GIT_BRANCH}`]).length, 40);

  const canonicalCtx = sqliteTaskEngineCtx(workspace, {
    tasks: { canonicalAuthority: "git-event-log" }
  });
  return { workspace, canonicalCtx };
}

test("assign-task-phase and clear-task-phase publish durable canonical events", async () => {
  const { canonicalCtx } = await seedCanonicalWorkspace();

  const assigned = await taskEngineModule.onCommand(
    {
      name: "assign-task-phase",
      args: {
        taskId: "T777",
        phaseKey: "116",
        phase: "Phase 116",
        clientMutationId: "phase-canonical-assign-T777",
        policyApproval: { confirmed: true, rationale: "publish canonical phase assignment in test" }
      }
    },
    canonicalCtx
  );
  assert.equal(assigned.ok, true, assigned.message);
  assert.equal(assigned.code, "task-phase-assigned");

  const hydrateAfterAssign = await taskEngineModule.onCommand(
    {
      name: "task-state-hydrate",
      args: {
        fetch: false,
        policyApproval: { confirmed: true, rationale: "verify assigned phase survives hydrate" }
      }
    },
    canonicalCtx
  );
  assert.equal(hydrateAfterAssign.ok, true, hydrateAfterAssign.message);

  let got = await taskEngineModule.onCommand({ name: "get-task", args: { taskId: "T777" } }, canonicalCtx);
  assert.equal(got.ok, true, got.message);
  assert.equal(got.data.task.phaseKey, "116");
  assert.equal(got.data.task.phase, "Phase 116");

  const cleared = await taskEngineModule.onCommand(
    {
      name: "clear-task-phase",
      args: {
        taskId: "T777",
        clientMutationId: "phase-canonical-clear-T777",
        policyApproval: { confirmed: true, rationale: "publish canonical phase clear in test" }
      }
    },
    canonicalCtx
  );
  assert.equal(cleared.ok, true, cleared.message);
  assert.equal(cleared.code, "task-phase-cleared");

  const hydrateAfterClear = await taskEngineModule.onCommand(
    {
      name: "task-state-hydrate",
      args: {
        fetch: false,
        policyApproval: { confirmed: true, rationale: "verify cleared phase survives hydrate" }
      }
    },
    canonicalCtx
  );
  assert.equal(hydrateAfterClear.ok, true, hydrateAfterClear.message);

  got = await taskEngineModule.onCommand({ name: "get-task", args: { taskId: "T777" } }, canonicalCtx);
  assert.equal(got.ok, true, got.message);
  assert.equal(got.data.task.phase, undefined);
  assert.equal(got.data.task.phaseKey, undefined);

  const status = await taskEngineModule.onCommand(
    { name: "task-state-status", args: { fetch: false } },
    canonicalCtx
  );
  assert.equal(status.ok, true, status.message);
  assert.equal(status.data.syncState, "current");
  assert.equal(status.data.remoteLatestSequence, 2);
  assert.equal(status.data.localAppliedSequence, 2);
});
