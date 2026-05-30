/**
 * DashboardSnapshotStore unit tests (T100611).
 */
import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { describe, it } from "node:test";
import { DashboardSnapshotStore } from "../dist/services/dashboard-service/snapshot-store.js";
import { DASHBOARD_SERVICE_SNAPSHOT_SCHEMA_VERSION } from "../dist/contracts/dashboard-snapshot.js";

describe("DashboardSnapshotStore", () => {
  it("applySliceError preserves last-good slice value", () => {
    const store = new DashboardSnapshotStore("0.99.21", [
      {
        name: "queue",
        pollGroup: "critical",
        command: "dashboard-summary",
        args: { projection: "queue" },
        source: "dashboard-summary:queue",
        extractPayload: (data) => data
      }
    ]);

    store.applySliceSuccess("queue", "dashboard-summary:queue", { ready: 3 }, 4388);
    store.applySliceError("queue", "dashboard-summary:queue", "cli timeout");

    const slice = store.getSlice("queue");
    assert.equal(slice?.status, "error");
    assert.deepEqual(slice?.value, { ready: 3 });
    assert.match(String(slice?.error), /timeout/);
  });

  it("getSnapshot on warm store completes within 1 second", () => {
    const store = new DashboardSnapshotStore("0.99.21");
    store.applySliceSuccess("overview", "dashboard-summary:overview", { ok: true }, 4388);

    const t0 = performance.now();
    for (let i = 0; i < 500; i += 1) {
      store.getSnapshot();
    }
    const elapsedMs = performance.now() - t0;
    assert.ok(elapsedMs < 1000, `warm getSnapshot too slow: ${Math.round(elapsedMs)} ms`);
  });

  it("emits snapshot aligned with DashboardServiceSnapshot contract", () => {
    const store = new DashboardSnapshotStore("0.99.21");
    store.applySliceSuccess("overview", "dashboard-summary:overview", { schemaVersion: 7 }, 4389);

    const snapshot = store.getSnapshot();
    assert.equal(snapshot.schemaVersion, DASHBOARD_SERVICE_SNAPSHOT_SCHEMA_VERSION);
    assert.equal(snapshot.serviceVersion, "0.99.21");
    assert.equal(typeof snapshot.generatedAt, "string");
    assert.equal(snapshot.generation, 1);
    assert.equal(snapshot.planningGeneration, 4389);
    assert.equal(snapshot.slices.overview?.status, "fresh");
    assert.equal(typeof snapshot.slices.overview?.updatedAt, "string");
    assert.equal(snapshot.slices.overview?.source, "dashboard-summary:overview");
  });
});
