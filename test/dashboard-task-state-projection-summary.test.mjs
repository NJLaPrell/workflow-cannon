import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { SqliteDualPlanningStore, taskEngineModule } from "../dist/index.js";
import { upsertTaskStateProjectionMeta } from "../dist/modules/task-engine/persistence/task-state-projection-meta-store.js";

async function tmpDir(prefix = "dash-proj-") {
  return mkdtemp(path.join(os.tmpdir(), prefix));
}

function sqliteTaskEngineCtx(workspace) {
  return {
    runtimeVersion: "0.1",
    workspacePath: workspace,
    effectiveConfig: {
      tasks: {
        persistenceBackend: "sqlite",
        sqliteDatabaseRelativePath: ".workspace-kit/tasks/workspace-kit.db"
      }
    }
  };
}

test("dashboard-summary exposes taskStateProjection metadata from SQLite", async () => {
  const workspace = await tmpDir();
  await mkdir(path.join(workspace, ".workspace-kit", "tasks"), { recursive: true });
  const dual = new SqliteDualPlanningStore(workspace, ".workspace-kit/tasks/workspace-kit.db");
  dual.loadFromDisk();
  upsertTaskStateProjectionMeta(dual.getDatabase(), {
    appliedSequence: 99,
    sourceCommit: "deadbeef",
    syncStatus: "stale",
    updatedAt: "2026-05-27T00:10:00.000Z"
  });

  const result = await taskEngineModule.onCommand({ name: "dashboard-summary", args: {} }, sqliteTaskEngineCtx(workspace));
  assert.equal(result.ok, true);
  const proj = result.data.taskStateProjection;
  assert.equal(proj.schemaVersion, 1);
  assert.equal(proj.available, true);
  assert.equal(proj.backend, "git-event-log");
  assert.equal(proj.appliedSequence, 99);
  assert.equal(proj.sourceCommit, "deadbeef");
  assert.equal(proj.syncStatus, "stale");
  assert.equal(proj.updatedAt, "2026-05-27T00:10:00.000Z");
  assert.equal(typeof proj.displayState, "string");
  assert.ok("remediation" in proj);
  assert.ok("gitSyncState" in proj);
  assert.equal(typeof proj.localProjection, "string");
  assert.equal(typeof proj.outbox.pending, "number");
  assert.equal(typeof proj.remote.behind, "boolean");
  assert.equal(typeof proj.recommendedAction, "string");
});

test("dashboard-summary status projection retains taskStateProjection", async () => {
  const workspace = await tmpDir();
  await mkdir(path.join(workspace, ".workspace-kit", "tasks"), { recursive: true });
  await mkdir(path.join(workspace, ".workspace-kit", "tasks"), { recursive: true });
  const dual = new SqliteDualPlanningStore(workspace, ".workspace-kit/tasks/workspace-kit.db");
  dual.loadFromDisk();

  const result = await taskEngineModule.onCommand(
    { name: "dashboard-summary", args: { projection: "status" } },
    sqliteTaskEngineCtx(workspace)
  );
  assert.equal(result.ok, true);
  assert.equal(result.data.dashboardProjection, "status");
  assert.equal(result.data.taskStateProjection?.available, true);
  assert.equal(result.data.taskStateProjection?.appliedSequence, 0);
  assert.equal(typeof result.data.taskStateProjection?.outbox.pending, "number");
});

test("dashboard-summary overview projection uses lightweight taskStateProjection overview builder and stubs out git calls", async () => {
  const workspace = await tmpDir();
  await mkdir(path.join(workspace, ".workspace-kit", "tasks"), { recursive: true });
  const dual = new SqliteDualPlanningStore(workspace, ".workspace-kit/tasks/workspace-kit.db");
  dual.loadFromDisk();
  upsertTaskStateProjectionMeta(dual.getDatabase(), {
    appliedSequence: 123,
    sourceCommit: "facefeed",
    syncStatus: "fresh",
    updatedAt: "2026-05-27T00:10:00.000Z"
  });

  const result = await taskEngineModule.onCommand(
    { name: "dashboard-summary", args: { projection: "overview" } },
    sqliteTaskEngineCtx(workspace)
  );
  assert.equal(result.ok, true);
  assert.equal(result.data.dashboardProjection, "overview");
  const proj = result.data.taskStateProjection;
  assert.equal(proj.schemaVersion, 1);
  assert.equal(proj.available, true);
  assert.equal(proj.backend, "git-event-log");
  assert.equal(proj.appliedSequence, 123);
  assert.equal(proj.sourceCommit, "facefeed");
  assert.equal(proj.syncStatus, "fresh");
  assert.equal(proj.updatedAt, "2026-05-27T00:10:00.000Z");
  assert.equal(proj.displayState, "current");
  assert.equal(proj.remediation, "Full task-state sync details deferred during overview startup.");
  assert.equal(proj.gitSyncState, null);
  assert.equal(proj.localProjection, "fresh");
  assert.equal(proj.outbox.pending, 0);
  assert.equal(proj.remote.behind, false);
  assert.equal(proj.remote.remoteLatestSequence, null);
  assert.equal(proj.remote.remoteTipSha, null);
  assert.equal(proj.recommendedAction, "none");
});

