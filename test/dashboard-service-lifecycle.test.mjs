import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import {
  runDashboardServiceSnapshot,
  runDashboardServiceStartInProcess,
  runDashboardServiceStatus
} from "../dist/services/dashboard-service/lifecycle-runtime.js";
import { dashboardServiceRuntimePath } from "../dist/services/dashboard-service/lifecycle-paths.js";

async function tmpWorkspace() {
  return fs.mkdtemp(path.join(os.tmpdir(), "wk-dash-life-"));
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

describe("dashboard service lifecycle", () => {
  it("status and snapshot work with in-process runtime metadata", async () => {
    const workspace = await tmpWorkspace();
    await seedEmptySqlite(workspace);
    const ctx = {
      runtimeVersion: "0.1",
      workspacePath: workspace,
      effectiveConfig: {
        tasks: {
          persistenceBackend: "sqlite",
          sqliteDatabaseRelativePath: ".workspace-kit/tasks/workspace-kit.db"
        }
      }
    };

    const { handle, runtime } = await runDashboardServiceStartInProcess(ctx);
    try {
      const runtimeRaw = await fs.readFile(dashboardServiceRuntimePath(workspace), "utf8");
      assert.ok(runtimeRaw.includes(String(runtime.port)));

      const status = await runDashboardServiceStatus(ctx);
      assert.equal(status.ok, true);
      assert.equal(status.data?.running, true);

      await fetch(`http://${runtime.host}:${runtime.port}/dashboard/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slices: ["overview"] })
      });

      const snap = await runDashboardServiceSnapshot(ctx);
      assert.equal(snap.ok, true);
      assert.equal(snap.code, "dashboard-service-snapshot");
      assert.equal(snap.data?.schemaVersion, 1);
    } finally {
      await handle.stop();
      await fs.unlink(dashboardServiceRuntimePath(workspace)).catch(() => {});
    }
  });
});
