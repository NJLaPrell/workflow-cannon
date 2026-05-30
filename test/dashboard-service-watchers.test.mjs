/**
 * Tiered refresh loop + bootstrap (T100596).
 */
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { createDashboardService } from "../dist/services/dashboard-service/server.js";

async function tmpWorkspace() {
  return fs.mkdtemp(path.join(os.tmpdir(), "wk-dash-watch-"));
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

describe("dashboard service watchers", () => {
  it("bootstraps critical slices and refreshes on fast poll intervals", async () => {
    const workspace = await tmpWorkspace();
    await seedEmptySqlite(workspace);
    const svc = await createDashboardService({
      workspacePath: workspace,
      pollIntervalMs: { critical: 50, queue: 5000, ops: 5000, status: 5000 }
    });
    const base = `http://${svc.host}:${svc.port}`;

    try {
      const bootSnap = await (await fetch(`${base}/dashboard/snapshot`)).json();
      assert.equal(bootSnap.slices.overview?.status, "fresh", "critical bootstrap on start");

      const genBefore = bootSnap.generation;
      const deadline = Date.now() + 3000;
      let afterSnap = bootSnap;
      while (Date.now() < deadline && afterSnap.generation <= genBefore) {
        await new Promise((resolve) => setTimeout(resolve, 75));
        afterSnap = await (await fetch(`${base}/dashboard/snapshot`)).json();
      }
      assert.ok(afterSnap.generation > genBefore, "critical interval should refresh slices");

      const manualRes = await fetch(`${base}/dashboard/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slices: ["queue"] })
      });
      assert.equal(manualRes.status, 200);
      const manual = await manualRes.json();
      assert.ok(manual.changedSlices.includes("queue"));
    } finally {
      await svc.stop();
    }
  });
});
