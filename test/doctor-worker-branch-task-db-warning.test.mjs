import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { SqliteDualPlanningStore, TaskStore } from "../dist/index.js";
import { collectDoctorPlanningPersistenceIssues } from "../dist/cli/doctor-planning-issues.js";

function git(workspacePath, args) {
  const result = spawnSync("git", args, { cwd: workspacePath, encoding: "utf8" });
  assert.equal(result.status, 0, `git ${args.join(" ")} failed: ${result.stderr}`);
}

test("doctor reports dirty task db on worker branch", async () => {
  const workspacePath = await mkdtemp(path.join(os.tmpdir(), "wc-doctor-worker-db-"));
  git(workspacePath, ["init", "-b", "main"]);
  git(workspacePath, ["config", "user.email", "test@example.com"]);
  git(workspacePath, ["config", "user.name", "Test User"]);
  await writeFile(path.join(workspacePath, "README.md"), "workspace\n", "utf8");
  git(workspacePath, ["add", "README.md"]);
  git(workspacePath, ["commit", "-m", "init"]);
  await mkdir(path.join(workspacePath, ".workspace-kit", "tasks"), { recursive: true });
  await writeFile(
    path.join(workspacePath, ".workspace-kit", "config.json"),
    JSON.stringify(
      {
        tasks: {
          persistenceBackend: "sqlite",
          sqliteDatabaseRelativePath: ".workspace-kit/tasks/workspace-kit.db",
          stateAuthority: {
            mode: "enforce",
            workerBranchMutations: "intent"
          }
        }
      },
      null,
      2
    ) + "\n",
    "utf8"
  );
  const sqliteDual = new SqliteDualPlanningStore(workspacePath, ".workspace-kit/tasks/workspace-kit.db");
  sqliteDual.loadFromDisk();
  const taskStore = TaskStore.forSqliteDual(sqliteDual);
  await taskStore.load();
  await taskStore.save();

  git(workspacePath, ["add", ".workspace-kit/config.json", ".workspace-kit/tasks/workspace-kit.db"]);
  git(workspacePath, ["commit", "-m", "seed config and db"]);
  git(workspacePath, ["checkout", "-b", "feature/worker-dirty-db"]);
  await writeFile(path.join(workspacePath, ".workspace-kit", "tasks", "workspace-kit.db"), "dirty-db", "utf8");

  const issues = await collectDoctorPlanningPersistenceIssues(workspacePath);
  assert.ok(
    issues.some((issue) => issue.reason === "worker-branch-task-db-dirty"),
    JSON.stringify(issues, null, 2)
  );
});

