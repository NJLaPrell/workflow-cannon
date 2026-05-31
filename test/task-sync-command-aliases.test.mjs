import assert from "node:assert/strict";
import test from "node:test";

import {
  ModuleCommandRouter,
  ModuleRegistry,
  taskEngineModule,
  workspaceConfigModule
} from "../dist/index.js";
import {
  TASK_SYNC_RECOVERY_ALIASES,
  isTaskSyncRecoveryAlias,
  resolveTaskSyncCommandAlias
} from "../dist/core/task-sync-command-aliases.js";

test("resolveTaskSyncCommandAlias maps recovery names to task-sync-*", () => {
  assert.equal(resolveTaskSyncCommandAlias("task-state-status"), "task-sync-status");
  assert.equal(resolveTaskSyncCommandAlias("task-sync-hydrate"), "task-sync-hydrate");
  assert.equal(resolveTaskSyncCommandAlias("run-transition"), "run-transition");
});

test("TASK_SYNC_RECOVERY_ALIASES covers seven legacy git-oriented names", () => {
  assert.equal(Object.keys(TASK_SYNC_RECOVERY_ALIASES).length, 7);
  for (const alias of Object.keys(TASK_SYNC_RECOVERY_ALIASES)) {
    assert.ok(isTaskSyncRecoveryAlias(alias));
    assert.match(TASK_SYNC_RECOVERY_ALIASES[alias], /^task-sync-/);
  }
});

test("ModuleCommandRouter executes task-state-* recovery commands from manifest", async () => {
  const registry = new ModuleRegistry([workspaceConfigModule, taskEngineModule]);
  const router = new ModuleCommandRouter(registry);

  const canonical = router.describeCommand("task-sync-status");
  const alias = router.describeCommand("task-state-status");
  assert.ok(canonical);
  assert.ok(alias);
  assert.ok(alias?.instructionFile?.endsWith("task-state-status.md"));

  const result = await router.execute(
    "task-state-status",
    {},
    { runtimeVersion: "0.1", workspacePath: process.cwd() }
  );
  assert.equal(typeof result.ok, "boolean");
});
