/**
 * Dashboard read service HTTP/SSE integration (T100595).
 */
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { createDashboardService } from "../dist/services/dashboard-service/server.js";

async function tmpWorkspace() {
  return fs.mkdtemp(path.join(os.tmpdir(), "wk-dash-svc-"));
}

async function waitForSliceFresh(base, sliceName, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const health = await (await fetch(`${base}/health`)).json();
    if (health.slices?.[sliceName]?.status === "fresh") {
      return health;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  const health = await (await fetch(`${base}/health`)).json();
  assert.equal(health.slices?.[sliceName]?.status, "fresh");
  return health;
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

describe("dashboard service HTTP", () => {
  it("serves health, snapshot, slice, refresh, and SSE events", async () => {
    const workspace = await tmpWorkspace();
    await seedEmptySqlite(workspace);
    const svc = await createDashboardService({ workspacePath: workspace });
    const base = `http://${svc.host}:${svc.port}`;

    try {
      const healthRes = await fetch(`${base}/health`);
      assert.equal(healthRes.status, 200);
      const health = await healthRes.json();
      assert.equal(health.ok, true);
      assert.equal(typeof health.generation, "number");
      assert.equal(typeof health.slices, "object");
      assert.equal(typeof health.summary, "object");

      const statusRes = await fetch(`${base}/status`);
      assert.equal(statusRes.status, 200);
      const status = await statusRes.json();
      assert.equal(status.schemaVersion, 1);
      assert.equal(status.health, "ok");
      assert.equal(typeof status.dashboard.generation, "number");
      assert.ok(Array.isArray(status.dashboard.staleSlices));

      const syncRes = await fetch(`${base}/task-sync/status`);
      assert.equal(syncRes.status, 200);
      const sync = await syncRes.json();
      assert.equal(sync.schemaVersion, 1);
      assert.equal(typeof sync.syncState, "string");
      assert.equal(typeof sync.outbox, "object");

      const flushRes = await fetch(`${base}/task-sync/flush`, { method: "POST" });
      assert.ok(flushRes.status === 200 || flushRes.status === 503);
      const flush = await flushRes.json();
      assert.equal(flush.schemaVersion, 1);
      assert.equal(typeof flush.code, "string");
      assert.equal(typeof health.taskSyncWorker, "object");

      const refreshRes = await fetch(`${base}/dashboard/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slices: ["overview"] })
      });
      assert.equal(refreshRes.status, 200);
      const refresh = await refreshRes.json();
      assert.equal(refresh.ok, true);
      assert.ok(refresh.changedSlices.includes("overview"));

      const healthAfter = await waitForSliceFresh(base, "overview");
      assert.equal(healthAfter.slices.overview?.status, "fresh");
      assert.equal(typeof healthAfter.slices.overview?.lastDurationMs, "number");
      assert.equal(healthAfter.summary.totalRefreshes >= 1, true);

      const snapshotRes = await fetch(`${base}/dashboard/snapshot`);
      assert.equal(snapshotRes.status, 200);
      const snapshot = await snapshotRes.json();
      assert.equal(snapshot.schemaVersion, 1);
      assert.equal(snapshot.slices.overview?.status, "fresh");

      const sliceRes = await fetch(`${base}/dashboard/slices/overview`);
      assert.equal(sliceRes.status, 200);
      const slice = await sliceRes.json();
      assert.equal(slice.name, "overview");
      assert.equal(slice.status, "fresh");

      const events = [];
      const ac = new AbortController();
      const ssePromise = (async () => {
        const res = await fetch(`${base}/dashboard/events`, { signal: ac.signal });
        assert.equal(res.status, 200);
        const reader = res.body?.getReader();
        assert.ok(reader);
        const decoder = new TextDecoder();
        let buffer = "";
        while (events.length < 1) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const chunks = buffer.split("\n\n");
          buffer = chunks.pop() ?? "";
          for (const chunk of chunks) {
            const line = chunk.split("\n").find((l) => l.startsWith("data: "));
            if (!line) continue;
            events.push(JSON.parse(line.slice(6)));
          }
        }
      })();

      await fetch(`${base}/dashboard/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slices: ["overview"] })
      });

      await Promise.race([
        ssePromise,
        new Promise((_, reject) => setTimeout(() => reject(new Error("SSE timeout")), 5000))
      ]);
      ac.abort();
      assert.ok(events.length >= 1);
      const first = events[0];
      assert.ok(
        first.type === "dashboard.slice.updated" || first.type === "dashboard.snapshot.updated"
      );

      const pauseRes = await fetch(`${base}/task-sync/pause`, { method: "POST" });
      assert.equal(pauseRes.status, 200);
      const pause = await pauseRes.json();
      assert.equal(pause.ok, true);
      const resumeRes = await fetch(`${base}/task-sync/resume`, { method: "POST" });
      assert.equal(resumeRes.status, 200);
      const resume = await resumeRes.json();
      assert.equal(resume.ok, true);
    } finally {
      await svc.stop();
    }
  });
});
