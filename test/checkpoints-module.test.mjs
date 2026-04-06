import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  ModuleCommandRouter,
  ModuleRegistry,
  SqliteDualPlanningStore,
  TaskStore,
  defaultRegistryModules,
  tryAutoCheckpointBeforeRun
} from "../dist/index.js";

async function gitInit(ws) {
  execFileSync("git", ["init"], { cwd: ws, stdio: "ignore" });
  execFileSync("git", ["config", "user.email", "ckpt@test.local"], { cwd: ws, stdio: "ignore" });
  execFileSync("git", ["config", "user.name", "ckpt"], { cwd: ws, stdio: "ignore" });
}

function sqliteCtx(ws) {
  return {
    runtimeVersion: "0.1",
    workspacePath: ws,
    effectiveConfig: {
      tasks: {
        persistenceBackend: "sqlite",
        sqliteDatabaseRelativePath: ".workspace-kit/tasks/workspace-kit.db"
      }
    },
    resolvedActor: "test-actor"
  };
}

async function primeSqlite(ws) {
  await mkdir(path.join(ws, ".workspace-kit", "tasks"), { recursive: true });
  const dual = new SqliteDualPlanningStore(ws, ".workspace-kit/tasks/workspace-kit.db");
  dual.loadFromDisk();
  const store = TaskStore.forSqliteDual(dual);
  await store.load();
  dual.persistSync();
  dual.closeDatabase();
}

test("checkpoints: head create, list, compare", async () => {
  const ws = await mkdtemp(path.join(os.tmpdir(), "wk-ckpt-head-"));
  await gitInit(ws);
  await writeFile(path.join(ws, "f.txt"), "a\n");
  execFileSync("git", ["add", "f.txt"], { cwd: ws, stdio: "ignore" });
  execFileSync("git", ["commit", "-m", "i"], { cwd: ws, stdio: "ignore" });
  await primeSqlite(ws);

  const registry = new ModuleRegistry(defaultRegistryModules);
  const router = new ModuleCommandRouter(registry);
  const ctx = sqliteCtx(ws);

  const created = await router.execute(
    "create-checkpoint",
    {
      mode: "head",
      label: "t",
      policyApproval: { confirmed: true, rationale: "test" }
    },
    ctx
  );
  assert.equal(created.ok, true);
  const cid = created.data.checkpointId;
  assert.ok(typeof cid === "string" && cid.length > 0);

  const listed = await router.execute("list-checkpoints", {}, ctx);
  assert.equal(listed.ok, true);
  assert.equal(listed.data.count >= 1, true);

  const cmp = await router.execute("compare-checkpoint", { checkpointId: cid }, ctx);
  assert.equal(cmp.ok, true);
  assert.ok(Array.isArray(cmp.data.nameStatusLines));
});

test("checkpoints: stash mode on dirty tree then rewind apply", async () => {
  const ws = await mkdtemp(path.join(os.tmpdir(), "wk-ckpt-stash-"));
  await gitInit(ws);
  await writeFile(path.join(ws, "f.txt"), "a\n");
  execFileSync("git", ["add", "f.txt"], { cwd: ws, stdio: "ignore" });
  execFileSync("git", ["commit", "-m", "i"], { cwd: ws, stdio: "ignore" });
  await writeFile(path.join(ws, "f.txt"), "b\n");
  await primeSqlite(ws);

  const registry = new ModuleRegistry(defaultRegistryModules);
  const router = new ModuleCommandRouter(registry);
  const ctx = sqliteCtx(ws);

  const created = await router.execute(
    "create-checkpoint",
    {
      mode: "stash",
      policyApproval: { confirmed: true, rationale: "test" }
    },
    ctx
  );
  assert.equal(created.ok, true);
  const cid = created.data.checkpointId;

  const raw = fs.readFileSync(path.join(ws, "f.txt"), "utf8");
  assert.equal(raw.trim(), "a");

  const rew = await router.execute(
    "rewind-to-checkpoint",
    {
      checkpointId: cid,
      force: false,
      policyApproval: { confirmed: true, rationale: "test" }
    },
    ctx
  );
  assert.equal(rew.ok, true);
  const raw2 = fs.readFileSync(path.join(ws, "f.txt"), "utf8");
  assert.equal(raw2.trim(), "b");
});

test("auto-checkpoint creates row before listed command when enabled", async () => {
  const ws = await mkdtemp(path.join(os.tmpdir(), "wk-ckpt-auto-"));
  await gitInit(ws);
  await writeFile(path.join(ws, "z.txt"), "z\n");
  execFileSync("git", ["add", "z.txt"], { cwd: ws, stdio: "ignore" });
  execFileSync("git", ["commit", "-m", "i"], { cwd: ws, stdio: "ignore" });
  await primeSqlite(ws);

  const effective = {
    tasks: {
      persistenceBackend: "sqlite",
      sqliteDatabaseRelativePath: ".workspace-kit/tasks/workspace-kit.db"
    },
    kit: {
      autoCheckpoint: {
        enabled: true,
        beforeCommands: ["agent-session-snapshot"],
        stashWhenDirty: true
      }
    },
    modules: { enabled: [], disabled: [] }
  };

  const before = await tryAutoCheckpointBeforeRun({
    workspacePath: ws,
    effectiveConfig: effective,
    subcommand: "agent-session-snapshot",
    actor: "auto-tester"
  });
  assert.equal(before.ok, true);
  assert.ok(before.checkpointId);

  const registry = new ModuleRegistry(defaultRegistryModules);
  const router = new ModuleCommandRouter(registry);
  const listed = await router.execute("list-checkpoints", {}, { ...sqliteCtx(ws), effectiveConfig: effective });
  assert.equal(listed.ok, true);
  const ids = listed.data.checkpoints.map((c) => c.id);
  assert.ok(ids.includes(before.checkpointId));
});
