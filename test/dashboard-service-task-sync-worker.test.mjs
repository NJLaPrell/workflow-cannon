/**
 * Dashboard service background task-sync worker (T100613).
 */
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import {
  DashboardTaskSyncWorker,
  readDashboardTaskSyncWorkerConfig
} from "../dist/services/dashboard-service/task-sync-worker.js";

async function tmpWorkspace() {
  return fs.mkdtemp(path.join(os.tmpdir(), "wk-dash-sync-"));
}

async function seedEmptySqlite(workspace) {
  const { mkdir } = await import("node:fs/promises");
  const { SqliteDualPlanningStore } = await import("../dist/modules/task-engine/persistence/sqlite-dual-planning.js");
  const { TaskStore } = await import("../dist/modules/task-engine/persistence/store.js");
  await mkdir(path.join(workspace, ".workspace-kit", "tasks"), { recursive: true });
  const dual = new SqliteDualPlanningStore(workspace, ".workspace-kit/tasks/workspace-kit.db");
  dual.loadFromDisk();
  const store = TaskStore.forSqliteDual(dual);
  await store.load();
  await store.save();
}

function initGit(workspace) {
  execSync("git init", { cwd: workspace, stdio: "ignore" });
  execSync('git config user.email "sync@test"', { cwd: workspace, stdio: "ignore" });
  execSync('git config user.name "sync"', { cwd: workspace, stdio: "ignore" });
}

describe("DashboardTaskSyncWorker", () => {
  it("readDashboardTaskSyncWorkerConfig defaults", () => {
    const cfg = readDashboardTaskSyncWorkerConfig({});
    assert.equal(cfg.enabled, true);
    assert.equal(cfg.hydrateIntervalMs, 300_000);
  });

  it("start returns false without git-event-log authority", async () => {
    const workspace = await tmpWorkspace();
    await seedEmptySqlite(workspace);
    initGit(workspace);
    const worker = new DashboardTaskSyncWorker({
      workspacePath: workspace,
      runtimeVersion: "0.1",
      effectiveConfig: { tasks: { canonicalAuthority: "sqlite" } }
    });
    assert.equal(await worker.start(), false);
    assert.equal(worker.getStatus().posture, "stopped");
  });

  it("pause, resume, and flush when git canonical", async () => {
    const workspace = await tmpWorkspace();
    await seedEmptySqlite(workspace);
    initGit(workspace);
    const ctx = {
      workspacePath: workspace,
      runtimeVersion: "0.1",
      effectiveConfig: {
        tasks: {
          canonicalAuthority: "git-event-log",
          canonicalPublishQueue: { enabled: false }
        },
        dashboardService: { taskSync: { enabled: true, hydrateIntervalMs: 60_000 } }
      }
    };
    const worker = new DashboardTaskSyncWorker(ctx, {
      skipOutboxPublisher: true,
      hydrateIntervalMs: 60_000
    });
    assert.equal(await worker.start(), true);
    assert.equal(worker.getStatus().posture, "running");

    assert.equal(worker.pause(), true);
    assert.equal(worker.getStatus().posture, "paused");
    assert.equal(worker.pause(), false);

    assert.equal(worker.resume(), true);
    assert.equal(worker.getStatus().posture, "running");

    const flush = await worker.flush();
    assert.equal(flush.schemaVersion, 1);
    assert.equal(typeof flush.code, "string");

    await worker.stop();
    assert.equal(worker.getStatus().posture, "stopped");
  });
});
