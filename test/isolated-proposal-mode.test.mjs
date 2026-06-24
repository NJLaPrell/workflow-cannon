import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { SqliteDualPlanningStore, TaskStore } from "../dist/index.js";
import {
  runCreateIsolatedProposalCommand,
  runDiscardIsolatedProposalCommand,
  runListIsolatedProposalsCommand,
  runRecordIsolatedProposalValidationCommand,
  runRecoverIsolatedProposalCommand,
  runViewIsolatedProposalDiffCommand
} from "../dist/modules/task-engine/commands/isolated-proposal-commands.js";
import { runCreateTaskMutationIntentCommand } from "../dist/modules/task-engine/commands/task-mutation-intent-commands.js";
import { runExportTaskStateArtifactsCommand } from "../dist/modules/task-engine/commands/task-state-export-commands.js";

function git(workspacePath, args) {
  const result = spawnSync("git", args, { cwd: workspacePath, encoding: "utf8" });
  assert.equal(result.status, 0, `git ${args.join(" ")} failed: ${result.stderr}`);
  return result.stdout.trim();
}

function mkCtx(workspacePath) {
  return {
    runtimeVersion: "test",
    workspacePath,
    effectiveConfig: {
      tasks: {
        persistenceBackend: "sqlite",
        sqliteDatabaseRelativePath: ".workspace-kit/tasks/workspace-kit.db",
        stateAuthority: { mode: "enforce", workerBranchMutations: "intent" }
      }
    }
  };
}

async function setupWorkspace() {
  const workspacePath = await mkdtemp(path.join(os.tmpdir(), "wc-isolated-proposal-"));
  git(workspacePath, ["init", "-b", "main"]);
  git(workspacePath, ["config", "user.email", "test@example.com"]);
  git(workspacePath, ["config", "user.name", "Test User"]);
  await writeFile(path.join(workspacePath, "README.md"), "workspace\n", "utf8");
  git(workspacePath, ["add", "README.md"]);
  git(workspacePath, ["commit", "-m", "init"]);
  fs.mkdirSync(path.join(workspacePath, ".workspace-kit", "tasks"), { recursive: true });
  const sqliteDual = new SqliteDualPlanningStore(workspacePath, ".workspace-kit/tasks/workspace-kit.db");
  sqliteDual.loadFromDisk();
  const taskStore = TaskStore.forSqliteDual(sqliteDual);
  await taskStore.load();
  const now = new Date().toISOString();
  taskStore.addTask({
    id: "T100193",
    title: "Isolated proposal mode",
    status: "in_progress",
    type: "workspace-kit",
    createdAt: now,
    updatedAt: now
  });
  await taskStore.save();
  return { workspacePath, sqliteDual, taskStore };
}

test("isolated proposal lifecycle tracks branch/worktree, actions, validation, intents", async () => {
  const { workspacePath, sqliteDual, taskStore } = await setupWorkspace();
  const ctx = mkCtx(workspacePath);

  const created = runCreateIsolatedProposalCommand(
    ctx,
    { taskId: "T100193", baseBranch: "main", proposalBranch: "proposal/T100193-iso", title: "proposal work" },
    taskStore
  );
  assert.equal(created.ok, true);
  const proposal = created.data.proposal;
  assert.equal(proposal.taskIds[0], "T100193");
  assert.ok(fs.existsSync(proposal.worktreePath));
  assert.equal(
    git(workspacePath, ["branch", "--list", proposal.proposalBranch]).replace(/^[*+\s]+/, ""),
    proposal.proposalBranch
  );

  await writeFile(path.join(proposal.worktreePath, "feature.txt"), "hello\n", "utf8");
  git(proposal.worktreePath, ["add", "feature.txt"]);
  git(proposal.worktreePath, ["commit", "-m", "proposal change"]);

  const listed = runListIsolatedProposalsCommand(ctx, {});
  assert.equal(listed.ok, true);
  assert.equal(listed.data.count, 1);
  assert.deepEqual(
    listed.data.proposals[0].actions.map((action) => action.id),
    ["view_diff", "apply", "open_pr", "discard"]
  );

  const diffed = runViewIsolatedProposalDiffCommand(ctx, { proposalId: proposal.proposalId });
  assert.equal(diffed.ok, true);
  assert.ok(diffed.data.changedFiles.includes("feature.txt"));

  const recorded = runRecordIsolatedProposalValidationCommand(ctx, {
    proposalId: proposal.proposalId,
    command: "pnpm run check",
    status: "passed",
    summary: "green"
  });
  assert.equal(recorded.ok, true);
  assert.equal(recorded.data.proposal.validationEvidenceCount, 1);

  const workerCtx = mkCtx(proposal.worktreePath);
  const intent = runCreateTaskMutationIntentCommand(workerCtx, sqliteDual.getPlanningGeneration(), {
    requestedAction: "update-task",
    taskId: "T100193",
    payload: { taskId: "T100193", updates: { summary: "from isolated proposal" } }
  });
  assert.equal(intent.ok, true);

  const listedWithIntents = runListIsolatedProposalsCommand(ctx, {});
  assert.equal(listedWithIntents.ok, true);
  assert.equal(listedWithIntents.data.proposals[0].taskMutationIntentCount, 1);

  const discarded = runDiscardIsolatedProposalCommand(ctx, { proposalId: proposal.proposalId });
  assert.equal(discarded.ok, true);
  assert.equal(discarded.data.proposal.status, "discarded");

  const recovered = runRecoverIsolatedProposalCommand(ctx, { proposalId: proposal.proposalId });
  assert.equal(recovered.ok, true);
  assert.equal(recovered.data.proposal.status, "active");
  assert.ok(fs.existsSync(recovered.data.proposal.worktreePath));
});

test("export-task-state-artifacts writes deterministic snapshot + jsonl", async () => {
  const { workspacePath, taskStore } = await setupWorkspace();
  const ctx = mkCtx(workspacePath);

  const outDir = ".workspace-kit/state-export-test";
  const first = runExportTaskStateArtifactsCommand(ctx, { outputDir: outDir }, taskStore);
  assert.equal(first.ok, true);
  const snapshotAbs = path.join(workspacePath, first.data.snapshotPath);
  const eventsAbs = path.join(workspacePath, first.data.eventsPath);
  assert.ok(fs.existsSync(snapshotAbs));
  assert.ok(fs.existsSync(eventsAbs));

  const snapshot1 = await readFile(snapshotAbs, "utf8");
  const events1 = await readFile(eventsAbs, "utf8");

  const second = runExportTaskStateArtifactsCommand(ctx, { outputDir: outDir }, taskStore);
  assert.equal(second.ok, true);
  assert.equal(first.data.snapshotDigest, second.data.snapshotDigest);
  assert.equal(first.data.eventsDigest, second.data.eventsDigest);

  const snapshot2 = await readFile(snapshotAbs, "utf8");
  const events2 = await readFile(eventsAbs, "utf8");
  assert.equal(snapshot1, snapshot2);
  assert.equal(events1, events2);
});
