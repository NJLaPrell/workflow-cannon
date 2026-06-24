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

function workspaceLeasePath(ws) {
  const common = execFileSync("git", ["rev-parse", "--git-common-dir"], { cwd: ws, encoding: "utf8" }).trim();
  const commonAbs = path.isAbsolute(common) ? common : path.join(ws, common);
  return path.join(commonAbs, "workflow-cannon", "leases", "workspace-edit.json");
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
    actor: "auto-tester",
    callerAgentSessionId: "sess-auto"
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

test("auto-checkpoint dirty capture allows no lease and owner lease; blocks other active lease", async () => {
  const { runClaimWorkspaceEditLease } = await import(
    "../dist/modules/task-engine/workspace-edit-lease-commands-runtime.js"
  );
  const ws = await mkdtemp(path.join(os.tmpdir(), "wk-ckpt-auto-lease-"));
  await gitInit(ws);
  await writeFile(path.join(ws, "dirty.txt"), "v1\n");
  execFileSync("git", ["add", "dirty.txt"], { cwd: ws, stdio: "ignore" });
  execFileSync("git", ["commit", "-m", "init"], { cwd: ws, stdio: "ignore" });
  await writeFile(path.join(ws, "dirty.txt"), "v2\n");
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

  const noLease = await tryAutoCheckpointBeforeRun({
    workspacePath: ws,
    effectiveConfig: effective,
    subcommand: "agent-session-snapshot",
    actor: "auto-tester",
    callerAgentSessionId: "sess-a"
  });
  assert.equal(noLease.ok, true);

  const c = sqliteCtx(ws);
  assert.equal(runClaimWorkspaceEditLease(c, { agentSessionId: "sess-owner", leaseTtlSeconds: 120 }).ok, true);

  await writeFile(path.join(ws, "dirty.txt"), "v3\n");
  const ownerLease = await tryAutoCheckpointBeforeRun({
    workspacePath: ws,
    effectiveConfig: effective,
    subcommand: "agent-session-snapshot",
    actor: "auto-tester",
    callerAgentSessionId: "sess-owner"
  });
  assert.equal(ownerLease.ok, true);

  await writeFile(path.join(ws, "dirty.txt"), "v4\n");
  const otherLease = await tryAutoCheckpointBeforeRun({
    workspacePath: ws,
    effectiveConfig: effective,
    subcommand: "agent-session-snapshot",
    actor: "auto-tester",
    callerAgentSessionId: "sess-other"
  });
  assert.equal(otherLease.ok, false);
  assert.equal(otherLease.code, "auto-checkpoint-lease-held");
});

test("auto-checkpoint dirty capture treats stale lease as recoverable", async () => {
  const ws = await mkdtemp(path.join(os.tmpdir(), "wk-ckpt-auto-stale-"));
  await gitInit(ws);
  await writeFile(path.join(ws, "dirty.txt"), "v1\n");
  execFileSync("git", ["add", "dirty.txt"], { cwd: ws, stdio: "ignore" });
  execFileSync("git", ["commit", "-m", "init"], { cwd: ws, stdio: "ignore" });
  await writeFile(path.join(ws, "dirty.txt"), "v2\n");
  await primeSqlite(ws);

  const leasePath = workspaceLeasePath(ws);
  fs.mkdirSync(path.dirname(leasePath), { recursive: true });
  fs.writeFileSync(
    leasePath,
    JSON.stringify({
      schemaVersion: 1,
      leaseId: "stale-lease",
      agentSessionId: "someone-else",
      taskId: "T1",
      branch: "main",
      headSha: execFileSync("git", ["rev-parse", "HEAD"], { cwd: ws, encoding: "utf8" }).trim(),
      worktreePath: ws,
      dirtyManifest: { lineCount: 0, capped: false },
      claimedAt: "2000-01-01T00:00:00.000Z",
      heartbeatAt: "2000-01-01T00:00:00.000Z",
      expiresAt: "2000-01-02T00:00:00.000Z"
    })
  );

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
  const staleLease = await tryAutoCheckpointBeforeRun({
    workspacePath: ws,
    effectiveConfig: effective,
    subcommand: "agent-session-snapshot",
    actor: "auto-tester",
    callerAgentSessionId: "sess-fresh"
  });
  assert.equal(staleLease.ok, true);
});

test("checkpoints stash records exact stash commit sha", async () => {
  const ws = await mkdtemp(path.join(os.tmpdir(), "wk-ckpt-stash-sha-"));
  await gitInit(ws);
  await writeFile(path.join(ws, "f.txt"), "a\n");
  execFileSync("git", ["add", "f.txt"], { cwd: ws, stdio: "ignore" });
  execFileSync("git", ["commit", "-m", "init"], { cwd: ws, stdio: "ignore" });
  await writeFile(path.join(ws, "f.txt"), "b\n");
  await primeSqlite(ws);

  const registry = new ModuleRegistry(defaultRegistryModules);
  const router = new ModuleCommandRouter(registry);
  const created = await router.execute(
    "create-checkpoint",
    { mode: "stash", policyApproval: { confirmed: true, rationale: "test" } },
    sqliteCtx(ws)
  );
  assert.equal(created.ok, true);
  const stashSha = created.data?.stashSha;
  assert.match(stashSha, /^[a-f0-9]{40}$/);
});

test("rewind-to-checkpoint enforces branch-switch lease guard with override", async () => {
  const { runClaimWorkspaceEditLease } = await import(
    "../dist/modules/task-engine/workspace-edit-lease-commands-runtime.js"
  );
  const ws = await mkdtemp(path.join(os.tmpdir(), "wk-ckpt-lease-rewind-"));
  await gitInit(ws);
  await writeFile(path.join(ws, "f.txt"), "a\n");
  execFileSync("git", ["add", "f.txt"], { cwd: ws, stdio: "ignore" });
  execFileSync("git", ["commit", "-m", "init"], { cwd: ws, stdio: "ignore" });
  await primeSqlite(ws);

  const registry = new ModuleRegistry(defaultRegistryModules);
  const router = new ModuleCommandRouter(registry);
  const c = sqliteCtx(ws);
  const created = await router.execute(
    "create-checkpoint",
    { mode: "head", policyApproval: { confirmed: true, rationale: "test" } },
    c
  );
  assert.equal(created.ok, true);

  assert.equal(runClaimWorkspaceEditLease(c, { agentSessionId: "lease-owner", leaseTtlSeconds: 120 }).ok, true);

  const blocked = await router.execute(
    "rewind-to-checkpoint",
    {
      checkpointId: created.data.checkpointId,
      force: true,
      agentSessionId: "other-session",
      policyApproval: { confirmed: true, rationale: "test" }
    },
    c
  );
  assert.equal(blocked.ok, false);
  assert.equal(blocked.code, "workspace-edit-lease-held");

  const overridden = await router.execute(
    "rewind-to-checkpoint",
    {
      checkpointId: created.data.checkpointId,
      force: true,
      agentSessionId: "other-session",
      ownerOverride: true,
      policyApproval: { confirmed: true, rationale: "test" }
    },
    c
  );
  assert.equal(overridden.ok, true);
  assert.equal(overridden.data.leaseOverrideWarning.includes("Explicit override"), true);
});
