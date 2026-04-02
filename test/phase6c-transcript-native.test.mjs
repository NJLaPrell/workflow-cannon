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
  buildIngestTranscriptsArgsForHook,
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

test("Phase6c: buildIngestTranscriptsArgsForHook merges policy + forceGenerate", () => {
  const empty = buildIngestTranscriptsArgsForHook({});
  assert.equal(empty.hasApproval, false);
  assert.equal(empty.jsonArgs, "{}");

  const bad = buildIngestTranscriptsArgsForHook({ WORKSPACE_KIT_POLICY_APPROVAL: "not-json" });
  assert.equal(bad.hasApproval, false);

  const good = buildIngestTranscriptsArgsForHook({
    WORKSPACE_KIT_POLICY_APPROVAL: JSON.stringify({ confirmed: true, rationale: "hook" })
  });
  assert.equal(good.hasApproval, true);
  const parsed = JSON.parse(good.jsonArgs);
  assert.deepEqual(parsed.policyApproval, { confirmed: true, rationale: "hook" });
  assert.equal(parsed.forceGenerate, true);
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
        tasks: {
          persistenceBackend: "sqlite",
          sqliteDatabaseRelativePath: ".workspace-kit/tasks/workspace-kit.db"
        },
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

  const mig = await router.execute(
    "migrate-task-persistence",
    { direction: "json-to-sqlite" },
    ctx
  );
  assert.equal(mig.ok, true, mig.message);

  const r = await router.execute(
    "run-transition",
    { taskId, action: "complete", actor: "tester@example.com" },
    ctx
  );
  assert.equal(r.ok, true, r.message);
});
