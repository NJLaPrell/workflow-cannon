import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { SqliteDualPlanningStore, TaskStore } from "../dist/index.js";
import { dispatchTaskEnginePlanningCommands } from "../dist/modules/task-engine/commands/task-engine-planning-dispatch.js";
import { resolveTaskStateAuthorityPosture } from "../dist/modules/task-engine/task-state-authority.js";

function git(workspacePath, args) {
  const result = spawnSync("git", args, { cwd: workspacePath, encoding: "utf8" });
  assert.equal(result.status, 0, `git ${args.join(" ")} failed: ${result.stderr}`);
}

async function setupWorkspace() {
  const workspacePath = await mkdtemp(path.join(os.tmpdir(), "wc-state-authority-"));
  git(workspacePath, ["init", "-b", "main"]);
  git(workspacePath, ["config", "user.email", "test@example.com"]);
  git(workspacePath, ["config", "user.name", "Test User"]);
  await writeFile(path.join(workspacePath, "README.md"), "workspace\n", "utf8");
  git(workspacePath, ["add", "README.md"]);
  git(workspacePath, ["commit", "-m", "init"]);
  await mkdir(path.join(workspacePath, ".workspace-kit", "tasks"), { recursive: true });
  const sqliteDual = new SqliteDualPlanningStore(workspacePath, ".workspace-kit/tasks/workspace-kit.db");
  sqliteDual.loadFromDisk();
  const taskStore = TaskStore.forSqliteDual(sqliteDual);
  await taskStore.load();
  await taskStore.save();
  return { workspacePath, sqliteDual, taskStore };
}

function buildCtx(workspacePath, stateAuthority, planningGenerationPolicy = "off") {
  return {
    runtimeVersion: "test",
    workspacePath,
    effectiveConfig: {
      tasks: {
        persistenceBackend: "sqlite",
        sqliteDatabaseRelativePath: ".workspace-kit/tasks/workspace-kit.db",
        planningGenerationPolicy,
        ...(stateAuthority ? { stateAuthority } : {})
      }
    }
  };
}

test("resolveTaskStateAuthorityPosture classifies authority, worker, detached, and disabled", async () => {
  const { workspacePath } = await setupWorkspace();
  const authorityCtx = buildCtx(workspacePath);
  assert.equal(resolveTaskStateAuthorityPosture(authorityCtx).classification, "authority");

  git(workspacePath, ["checkout", "-b", "feature/worker"]);
  const workerCtx = buildCtx(workspacePath);
  assert.equal(resolveTaskStateAuthorityPosture(workerCtx).classification, "worker");

  git(workspacePath, ["checkout", "--detach", "HEAD"]);
  const detached = resolveTaskStateAuthorityPosture(workerCtx);
  assert.equal(detached.classification, "unknown");
  assert.equal(detached.detachedHead, true);

  const disabled = resolveTaskStateAuthorityPosture(
    buildCtx(workspacePath, {
      mode: "disabled"
    })
  );
  assert.equal(disabled.classification, "disabled");
});

test("worker branch enforce+intent converts mutating commands to intents", async () => {
  const { workspacePath, sqliteDual, taskStore } = await setupWorkspace();
  git(workspacePath, ["checkout", "-b", "feature/intent-worker"]);
  const ctx = buildCtx(workspacePath, {
    mode: "enforce",
    workerBranchMutations: "intent"
  });
  const planning = { sqliteDual };
  const mutationCommands = [
    "run-transition",
    "batch-transition",
    "create-task",
    "create-task-from-plan",
    "update-task",
    "persist-planning-execution-drafts",
    "apply-task-batch",
    "assign-task-phase",
    "clear-task-phase",
    "add-dependency",
    "remove-dependency",
    "convert-phase-note-to-task",
    "upsert-phase-catalog-entry"
  ];
  for (const commandName of mutationCommands) {
    const result = await dispatchTaskEnginePlanningCommands(
      { name: commandName, args: {} },
      ctx,
      planning,
      taskStore
    );
    assert.equal(result.code, "task-state-mutation-intent", commandName);
    assert.equal(result.ok, true, commandName);
  }

  const readResult = await dispatchTaskEnginePlanningCommands(
    { name: "list-tasks", args: {} },
    ctx,
    planning,
    taskStore
  );
  assert.notEqual(readResult.code, "task-state-mutation-intent");
});

test("worker branch enforce+deny blocks mutating commands", async () => {
  const { workspacePath, sqliteDual, taskStore } = await setupWorkspace();
  git(workspacePath, ["checkout", "-b", "feature/deny-worker"]);
  const ctx = buildCtx(workspacePath, {
    mode: "enforce",
    workerBranchMutations: "deny"
  });
  const result = await dispatchTaskEnginePlanningCommands(
    { name: "create-task", args: {} },
    ctx,
    { sqliteDual },
    taskStore
  );
  assert.equal(result.ok, false);
  assert.equal(result.code, "task-state-authority-denied");
});

test("authority branch preserves planningGenerationPolicy behavior", async () => {
  const { workspacePath, sqliteDual, taskStore } = await setupWorkspace();
  git(workspacePath, ["checkout", "-b", "release/phase-137"]);
  const ctx = buildCtx(workspacePath, undefined, "require");

  const missingExpected = await dispatchTaskEnginePlanningCommands(
    {
      name: "create-task",
      args: {
        id: "T900001",
        title: "authority generation gate",
        status: "proposed"
      }
    },
    ctx,
    { sqliteDual },
    taskStore
  );
  assert.equal(missingExpected.ok, false);
  assert.equal(missingExpected.code, "planning-generation-required");

  const currentPlanningGeneration = sqliteDual.getPlanningGeneration();
  const accepted = await dispatchTaskEnginePlanningCommands(
    {
      name: "create-task",
      args: {
        id: "T900001",
        title: "authority generation gate",
        status: "proposed",
        expectedPlanningGeneration: currentPlanningGeneration
      }
    },
    ctx,
    { sqliteDual },
    taskStore
  );
  assert.equal(accepted.ok, true);
  assert.equal(accepted.code, "task-created");
});

