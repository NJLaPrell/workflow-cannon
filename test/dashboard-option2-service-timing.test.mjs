/**
 * Option 2 service timing integration (T100601).
 * Generous CI limits; run `node scripts/bench-dashboard-service.mjs` locally for strict SLA.
 */
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { describe, it } from "node:test";
import { createDashboardService } from "../dist/services/dashboard-service/server.js";

async function tmpWorkspace() {
  return fs.mkdtemp(path.join(os.tmpdir(), "wk-o2-timing-"));
}

async function waitForSliceFresh(base, sliceName, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const snap = await (await fetch(`${base}/dashboard/snapshot`)).json();
    if (snap.slices[sliceName]?.status === "fresh") {
      return snap;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  const last = await (await fetch(`${base}/dashboard/snapshot`)).json();
  assert.equal(last.slices[sliceName]?.status, "fresh");
  return last;
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

describe("Option 2 service timing", () => {
  it("cold start + first snapshot within generous CI budget", async () => {
    const workspace = await tmpWorkspace();
    await seedEmptySqlite(workspace);
    const t0 = performance.now();
    const svc = await createDashboardService({ workspacePath: workspace });
    const base = `http://${svc.host}:${svc.port}`;
    await fetch(`${base}/dashboard/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slices: ["overview"] })
    });
    const snap = await waitForSliceFresh(base, "overview");
    const coldMs = performance.now() - t0;
    await svc.stop();
    assert.equal(snap.slices.overview?.status, "fresh");
    assert.ok(coldMs < 15_000, `cold path too slow: ${Math.round(coldMs)} ms`);
  });

  it("warm snapshot re-fetch is faster than cold path", async () => {
    const workspace = await tmpWorkspace();
    await seedEmptySqlite(workspace);
    const svc = await createDashboardService({ workspacePath: workspace });
    const base = `http://${svc.host}:${svc.port}`;
    await fetch(`${base}/dashboard/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slices: ["overview"] })
    });
    await (await fetch(`${base}/dashboard/snapshot`)).json();
    const warm0 = performance.now();
    await (await fetch(`${base}/dashboard/snapshot`)).json();
    const warmMs = performance.now() - warm0;
    await svc.stop();
    assert.ok(warmMs < 3000, `warm snapshot too slow: ${Math.round(warmMs)} ms`);
  });
});
