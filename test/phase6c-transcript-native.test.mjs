import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, writeFile } from "node:fs/promises";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  ModuleCommandRouter,
  ModuleRegistry,
  approvalsModule,
  documentationModule,
  improvementModule,
  planningModule,
  readAfterTaskCompletedHook,
  resolveWorkspaceKitCli,
  resolveWorkspaceConfigWithLayers,
  taskEngineModule,
  workspaceConfigModule
} from "../dist/index.js";

test("Phase6c: readAfterTaskCompletedHook defaults to off", () => {
  assert.equal(readAfterTaskCompletedHook({}), "off");
  assert.equal(readAfterTaskCompletedHook({ improvement: { hooks: { afterTaskCompleted: "sync" } } }), "sync");
});

test("Phase6c: resolveWorkspaceKitCli finds dist/cli in this repo", () => {
  const p = resolveWorkspaceKitCli(process.cwd());
  assert.ok(p && p.endsWith(`dist${path.sep}cli.js`));
});

test("Phase6c: run-transition to completed does not throw with hook config", async () => {
  const workspacePath = await mkdtemp(path.join(os.tmpdir(), "wk-phase6c-"));
  await mkdir(path.join(workspacePath, ".workspace-kit"), { recursive: true });
  await writeFile(
    path.join(workspacePath, ".workspace-kit", "config.json"),
    JSON.stringify(
      {
        schemaVersion: 1,
        tasks: { persistenceBackend: "json" },
        improvement: {
          hooks: { afterTaskCompleted: "sync" }
        }
      },
      null,
      2
    ),
    "utf8"
  );
  const now = new Date().toISOString();
  const taskId = "T-phase6c-hook";
  await mkdir(path.join(workspacePath, ".workspace-kit", "tasks"), { recursive: true });
  await writeFile(
    path.join(workspacePath, ".workspace-kit", "tasks", "state.json"),
    JSON.stringify({
      schemaVersion: 1,
      tasks: [
        {
          id: taskId,
          status: "in_progress",
          type: "workspace-kit",
          title: "t",
          createdAt: now,
          updatedAt: now
        }
      ],
      transitionLog: [],
      lastUpdated: now
    }),
    "utf8"
  );

  const registry = new ModuleRegistry([
    workspaceConfigModule,
    documentationModule,
    taskEngineModule,
    approvalsModule,
    planningModule,
    improvementModule
  ]);
  const router = new ModuleCommandRouter(registry);
  const resolved = await resolveWorkspaceConfigWithLayers({ workspacePath, registry });
  const ctx = {
    runtimeVersion: "0.1",
    workspacePath,
    effectiveConfig: resolved.effective,
    resolvedActor: "tester@example.com",
    moduleRegistry: registry
  };

  const r = await router.execute(
    "run-transition",
    { taskId, action: "complete", actor: "tester@example.com" },
    ctx
  );
  assert.equal(r.ok, true, r.message);
});
