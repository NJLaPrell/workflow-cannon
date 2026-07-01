/**
 * Regression guard for the dashboard-service slice-refresh cache-bypass fix (Option-A).
 *
 * `DashboardSliceRefresher` opens a read-only planning store once and memoizes it
 * (`storesPromise`). Slice-native commands (dashboard-*-slice / dashboard-terminal-tasks-page)
 * must build their payload from that cached store instead of falling through to
 * `router.execute`, which would open a fresh store on every refresh. We assert the
 * low-level store open (`SqliteDualPlanningStore#loadFromDisk`) happens at most once
 * across many sequential slice refreshes.
 */
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it, mock } from "node:test";

import { DashboardSliceRefresher } from "../dist/services/dashboard-service/slice-refreshers.js";
import { DashboardSnapshotStore } from "../dist/services/dashboard-service/snapshot-store.js";
import { SqliteDualPlanningStore } from "../dist/modules/task-engine/persistence/sqlite-dual-planning.js";
import { TaskStore } from "../dist/modules/task-engine/persistence/store.js";

async function tmpWorkspace() {
  return fs.mkdtemp(path.join(os.tmpdir(), "wk-slice-open-"));
}

async function seedEmptySqlite(workspace) {
  await fs.mkdir(path.join(workspace, ".workspace-kit", "tasks"), { recursive: true });
  const dual = new SqliteDualPlanningStore(workspace, ".workspace-kit/tasks/workspace-kit.db");
  dual.loadFromDisk();
  const store = TaskStore.forSqliteDual(dual);
  await store.load();
  await store.save();
}

const SLICE_NATIVE_SLICES = [
  "overview",
  "queue",
  "status",
  "agentActivity",
  "agentTypes",
  "terminalTasks"
];

describe("dashboard slice refresher store reuse", () => {
  it("opens the read-only store at most once across many slice-native refreshes", async () => {
    const workspace = await tmpWorkspace();
    await seedEmptySqlite(workspace);

    // Spy AFTER seeding so only refresher-driven opens are counted.
    const openSpy = mock.method(SqliteDualPlanningStore.prototype, "loadFromDisk");

    const snapshotStore = new DashboardSnapshotStore("test");
    const refresher = new DashboardSliceRefresher({ workspacePath: workspace, snapshotStore });
    try {
      await refresher.start();
      const opensAfterStart = openSpy.mock.callCount();
      assert.equal(opensAfterStart, 1, `expected a single store open during start, saw ${opensAfterStart}`);

      // Refresh every slice-native slice several times.
      for (let round = 0; round < 3; round += 1) {
        for (const slice of SLICE_NATIVE_SLICES) {
          await refresher.refreshSlice(slice);
        }
      }

      const totalOpens = openSpy.mock.callCount();
      assert.equal(
        totalOpens,
        1,
        `slice-native refreshes must reuse the cached store; store was opened ${totalOpens} times`
      );

      // Every refreshed slice-native slice must be fresh (builder path actually ran).
      for (const slice of SLICE_NATIVE_SLICES) {
        const record = snapshotStore.getSlice(slice);
        assert.ok(record, `missing slice snapshot for ${slice}`);
        assert.equal(record.status, "fresh", `slice ${slice} not fresh: ${JSON.stringify(record)}`);
      }
    } finally {
      await refresher.stop();
      openSpy.mock.restore();
    }
  });
});
