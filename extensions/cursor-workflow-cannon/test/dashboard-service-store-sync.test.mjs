import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DashboardDataStore } from "../dist/views/dashboard/dashboard-data-store.js";
import { DashboardServiceStoreSync } from "../dist/views/dashboard/dashboard-service-store-sync.js";

describe("DashboardServiceStoreSync", () => {
  it("ingests warm service snapshot into the store", async () => {
    const store = new DashboardDataStore();
    const dataSource = {
      runtime: { host: "127.0.0.1", port: 1 },
      started: false,
      async start() {
        this.started = true;
      },
      async stop() {
        this.started = false;
      },
      async refreshSlice() {},
      async getSnapshot() {
        return {
          schemaVersion: 1,
          generation: 1,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          planningGeneration: 99,
          slices: {
            overview: {
              name: "overview",
              value: { schemaVersion: 7, planningGeneration: 99, readyQueueCount: 1 },
              status: "fresh",
              updatedAt: Date.now(),
              source: "dashboard-summary:overview",
              sourceArgs: { projection: "overview" },
              planningGeneration: 99,
              error: null
            }
          }
        };
      },
      getRuntime() {
        return this.runtime;
      },
      subscribe() {
        return { dispose() {} };
      }
    };

    const sync = new DashboardServiceStoreSync(dataSource, store);
    await sync.start();
    assert.equal(store.getSnapshot().planningGeneration, 99);
    assert.equal(store.getSlice("overview").value?.readyQueueCount, 1);
    await sync.stop();
  });

  it("T100614: applies task-sync.status.changed into status slice", async () => {
    const store = new DashboardDataStore();
    const taskSyncStatus = {
      schemaVersion: 1,
      generatedAt: "2026-05-30T03:00:00.000Z",
      syncState: "current",
      reason: "ok",
      localProjection: "fresh",
      recommendedAction: "none",
      branch: "workflow-cannon/task-state",
      remoteLatestSequence: 3,
      localAppliedSequence: 3,
      outbox: {
        pending: 0,
        publishing: 0,
        failed: 0,
        conflict: 0,
        oldestPendingAgeMs: 0,
        latestPublishedAt: null
      }
    };
    const dataSource = {
      runtime: { host: "127.0.0.1", port: 1 },
      started: false,
      listener: null,
      async start() {
        this.started = true;
      },
      async stop() {
        this.started = false;
      },
      async refreshSlice() {},
      async getSnapshot() {
        return {
          schemaVersion: 1,
          generation: 1,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          planningGeneration: 99,
          slices: {}
        };
      },
      getRuntime() {
        return this.runtime;
      },
      subscribe(listener) {
        this.listener = listener;
        return { dispose() {} };
      }
    };

    const sync = new DashboardServiceStoreSync(dataSource, store);
    await sync.start();
    dataSource.listener({
      type: "task-sync.status.changed",
      status: taskSyncStatus,
      updatedAt: taskSyncStatus.generatedAt
    });
    await new Promise((resolve) => setImmediate(resolve));

    const statusSlice = store.getSlice("status");
    assert.equal(statusSlice.value?.taskSyncStatus?.syncState, "current");
    assert.equal(statusSlice.source, "task-sync:status");
    await sync.stop();
  });
});
