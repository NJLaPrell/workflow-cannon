/**
 * Option B: router-bypass and timer recency backstop tests.
 *
 * Assertions:
 *  (a) The read-only planning store is opened at most once across multiple
 *      sequential refreshes of different slices (warm store shared, no re-open).
 *  (b) shouldSkipTimerRefresh correctly skips timer ticks for recently-refreshed
 *      slices and does not skip when the slice is stale or never refreshed.
 *  (c) A manual POST /dashboard/refresh always executes regardless of recency
 *      (the route calls refresher.refreshSlices directly with no recency gate).
 */
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { createDashboardService } from "../dist/services/dashboard-service/server.js";
import { shouldSkipTimerRefresh } from "../dist/services/dashboard-service/watchers.js";

async function tmpWorkspace() {
  return fs.mkdtemp(path.join(os.tmpdir(), "wk-bypass-"));
}

async function seedEmptySqlite(workspace) {
  const { mkdir } = await import("node:fs/promises");
  const { SqliteDualPlanningStore } = await import(
    "../dist/modules/task-engine/persistence/sqlite-dual-planning.js"
  );
  const { TaskStore } = await import("../dist/modules/task-engine/persistence/store.js");
  await mkdir(path.join(workspace, ".workspace-kit", "tasks"), { recursive: true });
  const dual = new SqliteDualPlanningStore(workspace, ".workspace-kit/tasks/workspace-kit.db");
  dual.loadFromDisk();
  const store = TaskStore.forSqliteDual(dual);
  await store.load();
  await store.save();
}

// ── (a) Store-open-once ──────────────────────────────────────────────────────

describe("router-bypass: shared warm store (a)", () => {
  it("opens the planning store exactly once across multiple sequential slice refreshes", async () => {
    const workspace = await tmpWorkspace();
    await seedEmptySqlite(workspace);

    // Start with polling disabled (long intervals) so only manual refreshes run.
    const svc = await createDashboardService({
      workspacePath: workspace,
      pollIntervalMs: { critical: 60000, live: 60000, queue: 60000, ops: 60000, status: 60000 }
    });

    try {
      const base = `http://${svc.host}:${svc.port}`;

      // Run three sequential refreshes for different slices via the HTTP API.
      for (const slice of ["overview", "queue", "status"]) {
        const res = await fetch(`${base}/dashboard/refresh`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ slices: [slice] })
        });
        assert.equal(res.status, 200, `refresh of '${slice}' should succeed`);
        const body = await res.json();
        assert.ok(body.ok, `refresh of '${slice}' body.ok should be true`);
      }

      // The refresher exposes storeOpenCount via getStoreOpenCount().
      // It should be 1: opened once during start(), never again.
      const openCount = svc.refresher.getStoreOpenCount();
      assert.equal(openCount, 1, `store should be opened exactly once, got ${openCount}`);
    } finally {
      await svc.stop();
    }
  });

  it("store open count stays at 1 after many slice refreshes including hot-path slices", async () => {
    const workspace = await tmpWorkspace();
    await seedEmptySqlite(workspace);

    const svc = await createDashboardService({
      workspacePath: workspace,
      pollIntervalMs: { critical: 60000, live: 60000, queue: 60000, ops: 60000, status: 60000 }
    });

    try {
      const base = `http://${svc.host}:${svc.port}`;

      // Refresh a mix of slices that previously went through the router and
      // those that previously returned empty data.
      const slices = ["overview", "queue", "status", "agentActivity", "phase", "agent"];
      for (const slice of slices) {
        const res = await fetch(`${base}/dashboard/refresh`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ slices: [slice] })
        });
        assert.equal(res.status, 200);
        const body = await res.json();
        assert.ok(body.ok, `refresh of '${slice}' should succeed`);
      }

      assert.equal(svc.refresher.getStoreOpenCount(), 1, "still only one store open after all refreshes");
    } finally {
      await svc.stop();
    }
  });
});

// ── (b) Timer recency backstop ────────────────────────────────────────────────

describe("shouldSkipTimerRefresh (b)", () => {
  it("returns false when the slice was never refreshed (lastRefreshAt = 0)", () => {
    assert.equal(shouldSkipTimerRefresh(0, 2000, Date.now()), false);
  });

  it("returns true when slice was refreshed within 50% of the interval", () => {
    const now = Date.now();
    const lastRefreshAt = now - 500; // 500 ms ago
    // interval = 2000 ms; threshold = 1000 ms; 500 < 1000 → skip
    assert.equal(shouldSkipTimerRefresh(lastRefreshAt, 2000, now), true);
  });

  it("returns false when slice was refreshed more than 50% of the interval ago", () => {
    const now = Date.now();
    const lastRefreshAt = now - 1200; // 1200 ms ago
    // interval = 2000 ms; threshold = 1000 ms; 1200 > 1000 → do not skip
    assert.equal(shouldSkipTimerRefresh(lastRefreshAt, 2000, now), false);
  });

  it("returns false exactly at the 50% boundary (not strictly less than)", () => {
    const now = Date.now();
    const lastRefreshAt = now - 1000; // exactly 1000 ms = 50% of 2000 ms
    // elapsed (1000) < threshold (1000) is false → do not skip
    assert.equal(shouldSkipTimerRefresh(lastRefreshAt, 2000, now), false);
  });

  it("respects different interval sizes (critical 2s vs ops 10s)", () => {
    const now = Date.now();
    const lastRefreshAt = now - 800; // 800 ms ago

    // critical: 2000 ms, threshold 1000 ms; 800 < 1000 → skip
    assert.equal(shouldSkipTimerRefresh(lastRefreshAt, 2000, now), true);

    // ops: 10000 ms, threshold 5000 ms; 800 < 5000 → skip
    assert.equal(shouldSkipTimerRefresh(lastRefreshAt, 10000, now), true);
  });

  it("returns false for a 30s status interval when slice was refreshed 20s ago", () => {
    const now = Date.now();
    const lastRefreshAt = now - 20_000; // 20s ago
    // status: 30000 ms, threshold 15000 ms; 20000 > 15000 → do not skip
    assert.equal(shouldSkipTimerRefresh(lastRefreshAt, 30000, now), false);
  });

  it("returns true for a 30s status interval when slice was refreshed 5s ago", () => {
    const now = Date.now();
    const lastRefreshAt = now - 5_000; // 5s ago
    // status: 30000 ms, threshold 15000 ms; 5000 < 15000 → skip
    assert.equal(shouldSkipTimerRefresh(lastRefreshAt, 30000, now), true);
  });
});

// ── (c) Manual POST /dashboard/refresh always runs ───────────────────────────

describe("manual refresh always executes (c)", () => {
  it("POST /dashboard/refresh runs even immediately after a watcher-triggered refresh", async () => {
    const workspace = await tmpWorkspace();
    await seedEmptySqlite(workspace);

    const svc = await createDashboardService({
      workspacePath: workspace,
      pollIntervalMs: { critical: 60000, live: 60000, queue: 60000, ops: 60000, status: 60000 }
    });

    try {
      const base = `http://${svc.host}:${svc.port}`;

      // First refresh (simulates bootstrap / watcher-driven refresh).
      const res1 = await fetch(`${base}/dashboard/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slices: ["overview"] })
      });
      assert.equal(res1.status, 200);
      const body1 = await res1.json();
      const genAfterFirst = body1.generation;

      // Immediately fire another manual refresh for the same slice.
      // Should always succeed (no recency gate on the manual endpoint).
      const res2 = await fetch(`${base}/dashboard/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slices: ["overview"] })
      });
      assert.equal(res2.status, 200);
      const body2 = await res2.json();
      assert.ok(body2.ok, "second manual refresh should succeed");
      // Generation must have advanced, proving a second refresh actually ran.
      assert.ok(
        body2.generation > genAfterFirst,
        `generation should advance after second manual refresh (${body2.generation} > ${genAfterFirst})`
      );
    } finally {
      await svc.stop();
    }
  });

  it("POST /dashboard/refresh with no slices body refreshes all slices and succeeds", async () => {
    const workspace = await tmpWorkspace();
    await seedEmptySqlite(workspace);

    const svc = await createDashboardService({
      workspacePath: workspace,
      pollIntervalMs: { critical: 60000, live: 60000, queue: 60000, ops: 60000, status: 60000 }
    });

    try {
      const base = `http://${svc.host}:${svc.port}`;

      const res = await fetch(`${base}/dashboard/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({})
      });
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.ok(body.ok, "full manual refresh should succeed");
      assert.ok(Array.isArray(body.changedSlices), "changedSlices should be an array");
      assert.ok(body.changedSlices.length > 0, "at least one slice should change");
      // Store still opened only once.
      assert.equal(svc.refresher.getStoreOpenCount(), 1);
    } finally {
      await svc.stop();
    }
  });
});
