import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

import { taskEngineModule } from "../dist/index.js";
import { TASK_STATE_GIT_BRANCH } from "../dist/modules/task-engine/task-state-git/constants.js";

function runGit(cwd, args) {
  return execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8" }).trim();
}

function ensureGitIdentity(cwd) {
  runGit(cwd, ["config", "user.email", "test@example.com"]);
  runGit(cwd, ["config", "user.name", "Test"]);
}

function sqliteTaskEngineCtx(workspace, partialEffective = {}) {
  const rawTasks = partialEffective.tasks;
  const taskExtra = rawTasks && typeof rawTasks === "object" && !Array.isArray(rawTasks) ? rawTasks : {};
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

async function seedCanonicalWorkspace() {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "wk-phase-canonical-"));
  const bare = fs.mkdtempSync(path.join(os.tmpdir(), "wk-phase-canonical-bare-"));
  runGit(workspace, ["init"]);
  ensureGitIdentity(workspace);
  runGit(workspace, ["commit", "--allow-empty", "-m", "root"]);
  runGit(bare, ["init", "--bare"]);
  runGit(workspace, ["remote", "add", "origin", bare]);

  const sqliteCtx = sqliteTaskEngineCtx(workspace);
  const created = await taskEngineModule.onCommand(
    { name: "create-task", args: { id: "T777", title: "Canonical phase task", status: "ready" } },
    sqliteCtx
  );
  assert.equal(created.ok, true, created.message);

  const init = await taskEngineModule.onCommand(
    {
      name: "task-state-init",
      args: {
        push: true,
        policyApproval: { confirmed: true, rationale: "bootstrap canonical task-state for phase mutation test" }
      }
    },
    sqliteCtx
  );
  assert.equal(init.ok, true, init.message);
  assert.equal(init.code, "task-state-init-complete");
  assert.equal(runGit(workspace, ["rev-parse", `origin/${TASK_STATE_GIT_BRANCH}`]).length, 40);

  const canonicalCtx = sqliteTaskEngineCtx(workspace, {
    tasks: { canonicalAuthority: "git-event-log" }
  });
  return { workspace, canonicalCtx };
}

test("assign-task-phase and clear-task-phase publish durable canonical events", async () => {
  const { canonicalCtx } = await seedCanonicalWorkspace();

  const assigned = await taskEngineModule.onCommand(
    {
      name: "assign-task-phase",
      args: {
        taskId: "T777",
        phaseKey: "116",
        phase: "Phase 116",
        clientMutationId: "phase-canonical-assign-T777",
        policyApproval: { confirmed: true, rationale: "publish canonical phase assignment in test" }
      }
    },
    canonicalCtx
  );
  assert.equal(assigned.ok, true, assigned.message);
  assert.equal(assigned.code, "task-phase-assigned");

  const hydrateAfterAssign = await taskEngineModule.onCommand(
    {
      name: "task-state-hydrate",
      args: {
        fetch: false,
        policyApproval: { confirmed: true, rationale: "verify assigned phase survives hydrate" }
      }
    },
    canonicalCtx
  );
  assert.equal(hydrateAfterAssign.ok, true, hydrateAfterAssign.message);

  let got = await taskEngineModule.onCommand({ name: "get-task", args: { taskId: "T777" } }, canonicalCtx);
  assert.equal(got.ok, true, got.message);
  assert.equal(got.data.task.phaseKey, "116");
  assert.equal(got.data.task.phase, "Phase 116");

  const cleared = await taskEngineModule.onCommand(
    {
      name: "clear-task-phase",
      args: {
        taskId: "T777",
        clientMutationId: "phase-canonical-clear-T777",
        policyApproval: { confirmed: true, rationale: "publish canonical phase clear in test" }
      }
    },
    canonicalCtx
  );
  assert.equal(cleared.ok, true, cleared.message);
  assert.equal(cleared.code, "task-phase-cleared");

  const hydrateAfterClear = await taskEngineModule.onCommand(
    {
      name: "task-state-hydrate",
      args: {
        fetch: false,
        policyApproval: { confirmed: true, rationale: "verify cleared phase survives hydrate" }
      }
    },
    canonicalCtx
  );
  assert.equal(hydrateAfterClear.ok, true, hydrateAfterClear.message);

  got = await taskEngineModule.onCommand({ name: "get-task", args: { taskId: "T777" } }, canonicalCtx);
  assert.equal(got.ok, true, got.message);
  assert.equal(got.data.task.phase, undefined);
  assert.equal(got.data.task.phaseKey, undefined);

  const status = await taskEngineModule.onCommand(
    { name: "task-state-status", args: { fetch: false } },
    canonicalCtx
  );
  assert.equal(status.ok, true, status.message);
  assert.equal(status.data.syncState, "current");
  assert.equal(status.data.remoteLatestSequence, 2);
  assert.equal(status.data.localAppliedSequence, 2);
});

test("apply-task-batch publishes rich task fields that survive hydrate", async () => {
  const { canonicalCtx } = await seedCanonicalWorkspace();

  const applied = await taskEngineModule.onCommand(
    {
      name: "apply-task-batch",
      args: {
        ops: [
          {
            kind: "create-task",
            payload: {
              id: "T778",
              allocateId: false,
              title: "Rich canonical task",
              type: "workspace-kit",
              status: "ready",
              priority: "P1",
              dependsOn: ["T777"],
              phase: "Phase 118",
              phaseKey: "118",
              summary: "Exercise rich canonical create replay",
              description: "Created through apply-task-batch with non-minimal fields",
              risk: "Hydrate must not drop rich fields",
              ownership: "task-engine",
              approach: "Publish complete canonical values",
              technicalScope: ["canonical event drafting", "hydrate replay"],
              acceptanceCriteria: ["Rich fields survive hydrate", "Dependency edges survive hydrate"],
              metadata: { planRef: "CI-EDGE" }
            }
          },
          {
            kind: "update-task",
            payload: {
              taskId: "T777",
              updates: {
                title: "Canonical phase task updated",
                dependsOn: ["T778"]
              }
            }
          }
        ],
        policyApproval: { confirmed: true, rationale: "publish canonical apply-task-batch regression" }
      }
    },
    canonicalCtx
  );
  assert.equal(applied.ok, true, applied.message);
  assert.equal(applied.code, "apply-task-batch-applied");

  const hydrate = await taskEngineModule.onCommand(
    {
      name: "task-state-hydrate",
      args: {
        fetch: false,
        policyApproval: { confirmed: true, rationale: "verify rich apply-task-batch fields survive hydrate" }
      }
    },
    canonicalCtx
  );
  assert.equal(hydrate.ok, true, hydrate.message);

  const rich = await taskEngineModule.onCommand({ name: "get-task", args: { taskId: "T778" } }, canonicalCtx);
  assert.equal(rich.ok, true, rich.message);
  assert.equal(rich.data.task.priority, "P1");
  assert.deepEqual(rich.data.task.dependsOn, ["T777"]);
  assert.equal(rich.data.task.phaseKey, "118");
  assert.equal(rich.data.task.phase, "Phase 118");
  assert.equal(rich.data.task.summary, "Exercise rich canonical create replay");
  assert.equal(rich.data.task.description, "Created through apply-task-batch with non-minimal fields");
  assert.equal(rich.data.task.risk, "Hydrate must not drop rich fields");
  assert.equal(rich.data.task.ownership, "task-engine");
  assert.equal(rich.data.task.approach, "Publish complete canonical values");
  assert.deepEqual(rich.data.task.technicalScope, ["canonical event drafting", "hydrate replay"]);
  assert.deepEqual(rich.data.task.acceptanceCriteria, [
    "Rich fields survive hydrate",
    "Dependency edges survive hydrate"
  ]);
  assert.equal(rich.data.task.metadata.planRef, "CI-EDGE");

  const updated = await taskEngineModule.onCommand({ name: "get-task", args: { taskId: "T777" } }, canonicalCtx);
  assert.equal(updated.ok, true, updated.message);
  assert.equal(updated.data.task.title, "Canonical phase task updated");
  assert.deepEqual(updated.data.task.dependsOn, ["T778"]);

  const status = await taskEngineModule.onCommand(
    { name: "task-state-status", args: { fetch: false } },
    canonicalCtx
  );
  assert.equal(status.ok, true, status.message);
  assert.equal(status.data.syncState, "current");
  assert.equal(status.data.remoteLatestSequence, 3);
  assert.equal(status.data.localAppliedSequence, 3);
});

test("persist-planning-execution-drafts publishes task.created events that survive hydrate", async () => {
  const { canonicalCtx } = await seedCanonicalWorkspace();
  const lt = await taskEngineModule.onCommand({ name: "list-tasks", args: {} }, canonicalCtx);
  assert.equal(lt.ok, true, lt.message);

  const persisted = await taskEngineModule.onCommand(
    {
      name: "persist-planning-execution-drafts",
      args: {
        tasks: [
          {
            id: "T779",
            title: "Persisted canonical batch row",
            type: "workspace-kit",
            status: "ready",
            phaseKey: "119",
            phase: "Phase 119",
            approach: "Materialize via persist-planning-execution-drafts",
            technicalScope: ["persist-planning-execution-drafts", "git canonical publish"],
            acceptanceCriteria: ["task.created published", "hydrate preserves row"]
          }
        ],
        expectedPlanningGeneration: lt.data.planningGeneration,
        policyApproval: { confirmed: true, rationale: "persist canonical publish regression" }
      }
    },
    canonicalCtx
  );
  assert.equal(persisted.ok, true, persisted.message);
  assert.equal(persisted.code, "planning-execution-drafts-persisted");

  const hydrate = await taskEngineModule.onCommand(
    {
      name: "task-state-hydrate",
      args: {
        fetch: false,
        policyApproval: { confirmed: true, rationale: "verify persist rows survive hydrate" }
      }
    },
    canonicalCtx
  );
  assert.equal(hydrate.ok, true, hydrate.message);

  const got = await taskEngineModule.onCommand({ name: "get-task", args: { taskId: "T779" } }, canonicalCtx);
  assert.equal(got.ok, true, got.message);
  assert.equal(got.data.task.title, "Persisted canonical batch row");
  assert.equal(got.data.task.phaseKey, "119");
});
