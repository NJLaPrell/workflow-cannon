import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { SqliteDualPlanningStore, TaskStore } from "../dist/index.js";
import {
  createTaskMutationIntentFromAuthorityGate,
  runApplyTaskMutationIntentCommand,
  runCreateTaskMutationIntentCommand,
  runListTaskMutationIntentsCommand,
  runRejectTaskMutationIntentCommand
} from "../dist/modules/task-engine/commands/task-mutation-intent-commands.js";
import { runTaskRowMutationCommands } from "../dist/modules/task-engine/commands/task-row-mutation-commands.js";
import {
  intentFilePath,
  resolveIntentDir,
  summarizePendingTaskMutationIntents
} from "../dist/modules/task-engine/coordination/task-mutation-intents.js";
import { buildDashboardQueueSlice } from "../dist/modules/task-engine/dashboard/focused-slice-builders.js";

function git(workspacePath, args) {
  const result = spawnSync("git", args, { cwd: workspacePath, encoding: "utf8" });
  assert.equal(result.status, 0, `git ${args.join(" ")} failed: ${result.stderr}`);
}

async function setupWorkspace() {
  const workspacePath = await mkdtemp(path.join(os.tmpdir(), "wc-task-mutation-intent-"));
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

test("runCreateTaskMutationIntentCommand persists pending intent file", async () => {
  const { workspacePath, sqliteDual } = await setupWorkspace();
  git(workspacePath, ["checkout", "-b", "feature/worker"]);
  const ctx = buildCtx(workspacePath, { mode: "enforce", workerBranchMutations: "intent" });

  const created = runCreateTaskMutationIntentCommand(ctx, sqliteDual.getPlanningGeneration(), {
    requestedAction: "update-task",
    payload: { taskId: "T100", summary: "worker draft" },
    taskId: "T100",
    createdBy: "worker-agent"
  });

  assert.equal(created.ok, true);
  assert.equal(created.code, "task-mutation-intent-created");
  const intentId = created.data.intent.intentId;
  const intentDir = resolveIntentDir(workspacePath);
  assert.ok(intentDir);
  const filePath = intentFilePath(intentDir, intentId);
  assert.ok(existsSync(filePath));
  const body = JSON.parse(await readFile(filePath, "utf8"));
  assert.equal(body.status, "pending");
  assert.equal(body.requestedAction, "update-task");
  assert.equal(body.taskId, "T100");
});

test("runCreateTaskMutationIntentCommand validates required fields", async () => {
  const { workspacePath, sqliteDual } = await setupWorkspace();
  const ctx = buildCtx(workspacePath, { mode: "enforce", workerBranchMutations: "intent" });

  const missingAction = runCreateTaskMutationIntentCommand(ctx, sqliteDual.getPlanningGeneration(), {
    payload: { taskId: "T1" }
  });
  assert.equal(missingAction.ok, false);
  assert.equal(missingAction.code, "invalid-run-args");

  const missingPayload = runCreateTaskMutationIntentCommand(ctx, sqliteDual.getPlanningGeneration(), {
    requestedAction: "update-task"
  });
  assert.equal(missingPayload.ok, false);
  assert.equal(missingPayload.code, "invalid-run-args");
});

test("runListTaskMutationIntentsCommand returns pending rows by default", async () => {
  const { workspacePath, sqliteDual } = await setupWorkspace();
  git(workspacePath, ["checkout", "-b", "feature/worker"]);
  const ctx = buildCtx(workspacePath, { mode: "enforce", workerBranchMutations: "intent" });

  runCreateTaskMutationIntentCommand(ctx, sqliteDual.getPlanningGeneration(), {
    requestedAction: "create-task",
    payload: { id: "T501", title: "queued", status: "proposed" }
  });

  const listed = runListTaskMutationIntentsCommand(ctx, { limit: 10 });
  assert.equal(listed.ok, true);
  assert.equal(listed.code, "task-mutation-intents-listed");
  assert.equal(listed.data.pendingCount, 1);
  assert.equal(listed.data.intents.length, 1);
  assert.equal(listed.data.intents[0].requestedAction, "create-task");
});

test("runApplyTaskMutationIntentCommand runs requested command on authority branch", async () => {
  const { workspacePath, sqliteDual, taskStore } = await setupWorkspace();
  git(workspacePath, ["checkout", "-b", "feature/worker"]);
  const workerCtx = buildCtx(workspacePath, { mode: "enforce", workerBranchMutations: "intent" });

  const created = runCreateTaskMutationIntentCommand(workerCtx, sqliteDual.getPlanningGeneration(), {
    requestedAction: "create-task",
    payload: {
      id: "T777",
      title: "from intent",
      status: "proposed"
    }
  });
  const intentId = created.data.intent.intentId;

  git(workspacePath, ["checkout", "main"]);
  const authorityCtx = buildCtx(workspacePath, { mode: "enforce", workerBranchMutations: "intent" });
  const planningGeneration = sqliteDual.getPlanningGeneration();
  const planning = { sqliteDual };

  const applied = await runApplyTaskMutationIntentCommand(
    authorityCtx,
    {
      intentId,
      expectedPlanningGeneration: planningGeneration,
      actor: "authority-operator"
    },
    async (commandName, commandArgs) => {
      const rowResult = await runTaskRowMutationCommands(
        { name: commandName, args: commandArgs },
        authorityCtx,
        planning,
        taskStore
      );
      if (rowResult !== null) {
        return rowResult;
      }
      return { ok: false, code: "unsupported-command", message: commandName };
    }
  );

  assert.equal(applied.ok, true);
  assert.equal(applied.code, "task-mutation-intent-applied");
  assert.equal(applied.data.intent.status, "applied");
  assert.equal(taskStore.getTask("T777")?.title, "from intent");
});

test("runApplyTaskMutationIntentCommand denied on worker branch", async () => {
  const { workspacePath, sqliteDual } = await setupWorkspace();
  git(workspacePath, ["checkout", "-b", "feature/worker"]);
  const ctx = buildCtx(workspacePath, { mode: "enforce", workerBranchMutations: "intent" });

  const created = runCreateTaskMutationIntentCommand(ctx, sqliteDual.getPlanningGeneration(), {
    requestedAction: "create-task",
    payload: { id: "T888", title: "blocked apply", status: "proposed" }
  });

  const denied = await runApplyTaskMutationIntentCommand(
    ctx,
    { intentId: created.data.intent.intentId },
    async () => ({ ok: true, code: "should-not-run", message: "nope" })
  );
  assert.equal(denied.ok, false);
  assert.equal(denied.code, "task-state-authority-denied");
});

test("runRejectTaskMutationIntentCommand marks intent rejected with reason", async () => {
  const { workspacePath, sqliteDual } = await setupWorkspace();
  git(workspacePath, ["checkout", "-b", "feature/worker"]);
  const ctx = buildCtx(workspacePath, { mode: "enforce", workerBranchMutations: "intent" });

  const created = runCreateTaskMutationIntentCommand(ctx, sqliteDual.getPlanningGeneration(), {
    requestedAction: "update-task",
    payload: { taskId: "T200", summary: "never mind" }
  });
  const intentId = created.data.intent.intentId;

  const rejected = runRejectTaskMutationIntentCommand(ctx, { intentId, reason: "superseded" });
  assert.equal(rejected.ok, true);
  assert.equal(rejected.code, "task-mutation-intent-rejected");
  assert.equal(rejected.data.intent.status, "rejected");

  const listed = runListTaskMutationIntentsCommand(ctx, { includeResolved: true });
  assert.equal(listed.data.pendingCount, 0);
  assert.equal(listed.data.totalCount, 1);
  assert.equal(listed.data.intents[0].status, "rejected");
});

test("createTaskMutationIntentFromAuthorityGate uses task-state-mutation-intent-created code", async () => {
  const { workspacePath, sqliteDual } = await setupWorkspace();
  git(workspacePath, ["checkout", "-b", "feature/worker"]);
  const ctx = buildCtx(workspacePath, { mode: "enforce", workerBranchMutations: "intent" });

  const created = createTaskMutationIntentFromAuthorityGate(
    ctx,
    sqliteDual.getPlanningGeneration(),
    "create-task",
    { id: "T321", title: "gate intent", status: "proposed" }
  );
  assert.equal(created.ok, true);
  assert.equal(created.code, "task-state-mutation-intent-created");
  assert.equal(created.data.intent.requestedAction, "create-task");
});

test("summarizePendingTaskMutationIntents and queue slice expose pending intents", async () => {
  const { workspacePath, sqliteDual, taskStore } = await setupWorkspace();
  git(workspacePath, ["checkout", "-b", "feature/worker"]);
  const ctx = buildCtx(workspacePath, { mode: "enforce", workerBranchMutations: "intent" });

  runCreateTaskMutationIntentCommand(ctx, sqliteDual.getPlanningGeneration(), {
    requestedAction: "create-task",
    payload: { id: "T999", title: "dashboard intent", status: "proposed" }
  });

  const summary = summarizePendingTaskMutationIntents(workspacePath);
  assert.equal(summary.count, 1);
  assert.equal(summary.top[0].requestedAction, "create-task");

  const queueSlice = await buildDashboardQueueSlice(ctx, taskStore, sqliteDual.getPlanningGeneration(), sqliteDual);
  assert.equal(queueSlice.taskMutationIntents?.count, 1);
  assert.equal(queueSlice.taskMutationIntents?.top[0]?.requestedAction, "create-task");
});
