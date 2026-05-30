import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import Database from "better-sqlite3";

import { taskEngineModule } from "../dist/index.js";
import { KIT_CANONICAL_EVENT_OUTBOX_TABLE } from "../dist/core/state/workspace-kit-sqlite.js";

function runGit(cwd, args) {
  return execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8" }).trim();
}

function ensureGitIdentity(cwd) {
  runGit(cwd, ["config", "user.email", "test@example.com"]);
  runGit(cwd, ["config", "user.name", "Test"]);
}

function sqliteTaskEngineCtx(workspace, partialEffective = {}) {
  const rawTasks = partialEffective.tasks;
  const taskExtra =
    rawTasks && typeof rawTasks === "object" && !Array.isArray(rawTasks) ? rawTasks : {};
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

async function seedWorkspaceWithoutCanonicalBranch() {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "wk-queue-mode-"));
  runGit(workspace, ["init"]);
  ensureGitIdentity(workspace);
  runGit(workspace, ["commit", "--allow-empty", "-m", "root"]);
  return workspace;
}

test("queue mode persists mutation and enqueues canonical event when git branch is unavailable", async () => {
  const workspace = await seedWorkspaceWithoutCanonicalBranch();
  const queueCtx = sqliteTaskEngineCtx(workspace, {
    tasks: {
      canonicalAuthority: "git-event-log",
      canonicalPublishQueue: { enabled: true }
    }
  });

  const created = await taskEngineModule.onCommand(
    {
      name: "create-task",
      args: {
        id: "T900",
        title: "Queued canonical mutation",
        status: "ready",
        clientMutationId: "queue-create-t900",
        policyApproval: { confirmed: true, rationale: "test queue mode with unavailable git branch" }
      }
    },
    queueCtx
  );
  assert.equal(created.ok, true, created.message);
  assert.equal(created.code, "task-created");

  // Local sqlite state should be durable without canonical branch access.
  const got = await taskEngineModule.onCommand({ name: "get-task", args: { taskId: "T900" } }, queueCtx);
  assert.equal(got.ok, true, got.message);
  assert.equal(got.data.task.id, "T900");

  const dbPath = path.join(workspace, ".workspace-kit", "tasks", "workspace-kit.db");
  const db = new Database(dbPath, { readonly: true });
  try {
    const row = db
      .prepare(
        `SELECT event_id, event_json, status
         FROM ${KIT_CANONICAL_EVENT_OUTBOX_TABLE}
         ORDER BY created_at DESC
         LIMIT 1`
      )
      .get();
    assert.ok(row, "expected canonical outbox row to be created");
    assert.equal(row.status, "pending");
    const event = JSON.parse(row.event_json);
    assert.equal(event.eventId, row.event_id);
    assert.equal(event.kind, "task.created");
  } finally {
    db.close();
  }
});

test("default canonical mode still fails mutation when canonical branch is unavailable", async () => {
  const workspace = await seedWorkspaceWithoutCanonicalBranch();
  const canonicalCtx = sqliteTaskEngineCtx(workspace, {
    tasks: { canonicalAuthority: "git-event-log" }
  });

  const created = await taskEngineModule.onCommand(
    {
      name: "create-task",
      args: {
        id: "T901",
        title: "Should fail without queue mode",
        status: "ready",
        policyApproval: { confirmed: true, rationale: "verify default publish path still requires canonical branch" }
      }
    },
    canonicalCtx
  );
  assert.equal(created.ok, false);
  assert.equal(created.code, "task-state-branch-missing");
});
