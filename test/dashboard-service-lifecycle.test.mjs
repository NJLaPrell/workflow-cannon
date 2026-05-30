import Ajv2020 from "ajv/dist/2020.js";
import assert from "node:assert/strict";
import fs from "node:fs";
import fsPromises from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  runDashboardServiceSnapshot,
  runDashboardServiceStartInProcess,
  runDashboardServiceStatus,
  runDashboardServiceStop
} from "../dist/services/dashboard-service/lifecycle-runtime.js";
import {
  dashboardServicePidPath,
  dashboardServiceRuntimePath
} from "../dist/services/dashboard-service/lifecycle-paths.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function loadRuntimeServiceStatusSchema() {
  return JSON.parse(
    fs.readFileSync(path.join(root, "schemas", "runtime-service-status.v1.json"), "utf8")
  );
}

async function tmpWorkspace() {
  return fsPromises.mkdtemp(path.join(os.tmpdir(), "wk-dash-life-"));
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

function lifecycleCtx(workspace) {
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

describe("dashboard service lifecycle", () => {
  it("status and snapshot work with in-process runtime metadata", async () => {
    const workspace = await tmpWorkspace();
    await seedEmptySqlite(workspace);
    const ctx = lifecycleCtx(workspace);

    const { handle, runtime } = await runDashboardServiceStartInProcess(ctx);
    try {
      const runtimeRaw = await fsPromises.readFile(dashboardServiceRuntimePath(workspace), "utf8");
      assert.ok(runtimeRaw.includes(String(runtime.port)));

      const status = await runDashboardServiceStatus(ctx);
      assert.equal(status.ok, true);
      assert.equal(status.data?.running, true);
      assert.equal(status.data?.workspaceRoot, workspace);
      assert.equal(status.data?.runtime?.port, runtime.port);
      assert.equal(status.data?.runtime?.pid, runtime.pid);
      assert.equal(typeof status.data?.uptimeMs, "number");
      assert.ok(status.data.uptimeMs >= 0);

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
      await fsPromises.unlink(dashboardServiceRuntimePath(workspace)).catch(() => {});
    }
  });

  it("reports not running for stale pid files and stop clears artifacts", async () => {
    const workspace = await tmpWorkspace();
    await seedEmptySqlite(workspace);
    const ctx = lifecycleCtx(workspace);
    const staleRuntime = {
      schemaVersion: 1,
      pid: 9_999_999,
      host: "127.0.0.1",
      port: 59999,
      startedAt: "2026-05-30T00:00:00.000Z",
      serviceVersion: "0.0.0-test",
      generation: 0,
      planningGeneration: null
    };
    await fsPromises.mkdir(path.dirname(dashboardServiceRuntimePath(workspace)), { recursive: true });
    await fsPromises.writeFile(
      dashboardServiceRuntimePath(workspace),
      `${JSON.stringify(staleRuntime, null, 2)}\n`,
      "utf8"
    );
    await fsPromises.writeFile(dashboardServicePidPath(workspace), `${staleRuntime.pid}\n`, "utf8");

    const staleStatus = await runDashboardServiceStatus(ctx);
    assert.equal(staleStatus.ok, true);
    assert.equal(staleStatus.data?.running, false);
    assert.equal(staleStatus.data?.workspaceRoot, workspace);
    assert.equal(staleStatus.data?.runtime?.pid, staleRuntime.pid);

    const stopped = await runDashboardServiceStop(ctx);
    assert.equal(stopped.ok, true);
    await assert.rejects(() => fsPromises.readFile(dashboardServiceRuntimePath(workspace), "utf8"));
    await assert.rejects(() => fsPromises.readFile(dashboardServicePidPath(workspace), "utf8"));
  });

  it("lifecycle status health probe matches runtime service status contract (T100609)", async () => {
    const workspace = await tmpWorkspace();
    await seedEmptySqlite(workspace);
    const ctx = lifecycleCtx(workspace);
    const ajv = new Ajv2020({ strict: true, allErrors: true });
    ajv.addSchema(loadRuntimeServiceStatusSchema());
    const validate = ajv.getSchema("https://workflow-cannon.dev/schemas/runtime-service-status.v1.json");
    assert.ok(validate);

    const { handle, runtime } = await runDashboardServiceStartInProcess(ctx);
    try {
      const statusRes = await fetch(`http://${runtime.host}:${runtime.port}/status`);
      assert.equal(statusRes.status, 200);
      const wireStatus = await statusRes.json();
      assert.equal(validate(wireStatus), true, JSON.stringify(validate.errors));

      const cliStatus = await runDashboardServiceStatus(ctx);
      assert.equal(cliStatus.data?.running, true);
      assert.equal(cliStatus.data?.health?.ok, true);
      assert.equal(typeof cliStatus.data?.uptimeMs, "number");
      assert.equal(typeof wireStatus.uptimeMs, "number");
      assert.ok(Math.abs(cliStatus.data.uptimeMs - wireStatus.uptimeMs) <= 50);
    } finally {
      await handle.stop();
      await fsPromises.unlink(dashboardServiceRuntimePath(workspace)).catch(() => {});
    }
  });
});
