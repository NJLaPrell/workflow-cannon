import test from "node:test";
import assert from "node:assert/strict";

import {
  isUsableColdBootstrapCache,
  mergeColdBootstrapCounts,
  resolveBootstrapSnapshot,
  summaryFromBootstrapSlices,
  summaryFromStoreSlices
} from "../dist/views/dashboard/bootstrap-snapshot-adapter.js";
import { DashboardDataStore } from "../dist/views/dashboard/dashboard-data-store.js";
import { dashboardSummaryNeedsQueueRollupHydration } from "../dist/views/dashboard/dashboard-queue-fingerprint.js";

test("isUsableColdBootstrapCache accepts workspaceStatus / systemStatus.phase / stateSummary", () => {
  assert.equal(isUsableColdBootstrapCache(null), false);
  assert.equal(isUsableColdBootstrapCache({}), false);
  assert.equal(isUsableColdBootstrapCache({ workspaceStatus: { phaseKey: "146" } }), true);
  assert.equal(isUsableColdBootstrapCache({ systemStatus: { phase: "146" } }), true);
  assert.equal(isUsableColdBootstrapCache({ stateSummary: { ready: 1 } }), true);
});

test("mergeColdBootstrapCounts copies count-only fields and keeps dashboardProjection overview", () => {
  const merged = mergeColdBootstrapCounts(
    {
      dashboardProjection: "overview",
      workspaceStatus: { phaseKey: "146" },
      readyImprovementsSummary: { schemaVersion: 1, count: 0, top: [], phaseBuckets: [] }
    },
    {
      readyImprovementsSummary: {
        schemaVersion: 1,
        count: 3,
        top: [{ id: "T1" }],
        phaseBuckets: [{ phaseKey: "146", count: 3 }]
      },
      readyExecutionSummary: { schemaVersion: 1, count: 2, top: [], phaseBuckets: [] },
      blockedSummary: { count: 1, top: [], phaseBuckets: [] },
      readyQueueCount: 5
    }
  );
  assert.equal(merged.dashboardProjection, "overview");
  assert.equal(dashboardSummaryNeedsQueueRollupHydration(merged), true);
  assert.deepEqual(merged.readyImprovementsSummary, {
    schemaVersion: 1,
    count: 3,
    top: [],
    phaseBuckets: []
  });
  assert.equal(merged.readyQueueCount, 5);
  assert.equal((merged.blockedSummary).count, 1);
});

test("mergeColdBootstrapCounts does not clobber hydrated rollups with empty tops", () => {
  const prior = {
    dashboardProjection: "queue",
    readyImprovementsSummary: {
      schemaVersion: 1,
      count: 2,
      top: [{ id: "T9" }],
      phaseBuckets: []
    }
  };
  const merged = mergeColdBootstrapCounts(prior, {
    readyImprovementsSummary: { schemaVersion: 1, count: 99, top: [], phaseBuckets: [] }
  });
  assert.equal(merged.dashboardProjection, "overview");
  assert.deepEqual(merged.readyImprovementsSummary, prior.readyImprovementsSummary);
});

test("summaryFromBootstrapSlices merges overview + queue counts without queue projection stamp", () => {
  const summary = summaryFromBootstrapSlices({
    overview: {
      dashboardProjection: "overview",
      workspaceStatus: { phaseKey: "146" },
      systemStatus: { phase: "146" },
      stateSummary: { ready: 0 },
      readyImprovementsSummary: { schemaVersion: 1, count: 0, top: [], phaseBuckets: [] },
      readyQueueCount: 0
    },
    queue: {
      dashboardProjection: "queue",
      readyImprovementsSummary: { schemaVersion: 1, count: 4, top: [{ id: "T1" }], phaseBuckets: [] },
      readyQueueCount: 4
    }
  });
  assert.equal(summary.dashboardProjection, "overview");
  assert.equal(summary.readyQueueCount, 4);
  assert.equal((summary.readyImprovementsSummary).count, 4);
  assert.deepEqual((summary.readyImprovementsSummary).top, []);
  assert.equal(dashboardSummaryNeedsQueueRollupHydration(summary), true);
});

test("summaryFromStoreSlices uses fresh overview (+ optional queue counts)", () => {
  const store = new DashboardDataStore();
  assert.equal(summaryFromStoreSlices(store), null);
  store.updateSlice("overview", {
    workspaceStatus: { phaseKey: "146" },
    systemStatus: { phase: "146" },
    stateSummary: { ready: 1 },
    dashboardProjection: "overview"
  });
  store.updateSlice("queue", {
    readyImprovementsSummary: { schemaVersion: 1, count: 7, top: [], phaseBuckets: [] },
    readyQueueCount: 7
  });
  const summary = summaryFromStoreSlices(store);
  assert.ok(summary);
  assert.equal(summary.dashboardProjection, "overview");
  assert.equal(summary.readyQueueCount, 7);
});

test("resolveBootstrapSnapshot prefers session-cache then store then cli-bootstrap then cli-summary", async () => {
  const store = new DashboardDataStore();
  const calls = [];

  const cacheHit = await resolveBootstrapSnapshot({
    cache: { workspaceStatus: { phaseKey: "146" }, readyQueueCount: 1 },
    store,
    fetchCliBootstrap: async () => {
      calls.push("bootstrap");
      return { ok: false };
    },
    fetchCliSummaryOverview: async () => {
      calls.push("summary");
      return { ok: false };
    }
  });
  assert.equal(cacheHit.ok, true);
  assert.equal(cacheHit.provenance, "session-cache");
  assert.deepEqual(calls, []);

  store.updateSlice("overview", {
    workspaceStatus: { phaseKey: "146" },
    systemStatus: { phase: "146" }
  });
  const storeHit = await resolveBootstrapSnapshot({
    cache: null,
    store,
    fetchCliBootstrap: async () => {
      calls.push("bootstrap");
      return { ok: false };
    }
  });
  assert.equal(storeHit.ok, true);
  assert.equal(storeHit.provenance, "store-slices");
  assert.deepEqual(calls, []);

  const emptyStore = new DashboardDataStore();
  const bootstrapHit = await resolveBootstrapSnapshot({
    cache: null,
    store: emptyStore,
    fetchCliBootstrap: async () => {
      calls.push("bootstrap");
      return {
        ok: true,
        data: {
          overview: {
            workspaceStatus: { phaseKey: "146" },
            systemStatus: { phase: "146" }
          },
          queue: { readyQueueCount: 2, readyImprovementsSummary: { count: 2, top: [], phaseBuckets: [] } }
        }
      };
    },
    fetchCliSummaryOverview: async () => {
      calls.push("summary");
      return { ok: false };
    }
  });
  assert.equal(bootstrapHit.ok, true);
  assert.equal(bootstrapHit.provenance, "cli-bootstrap");
  assert.equal(bootstrapHit.data.readyQueueCount, 2);
  assert.deepEqual(calls, ["bootstrap"]);

  calls.length = 0;
  const summaryHit = await resolveBootstrapSnapshot({
    cache: null,
    store: new DashboardDataStore(),
    fetchCliBootstrap: async () => {
      calls.push("bootstrap");
      return { ok: false, code: "nope", message: "fail" };
    },
    fetchCliSummaryOverview: async () => {
      calls.push("summary");
      return {
        ok: true,
        data: {
          workspaceStatus: { phaseKey: "146" },
          systemStatus: { phase: "146" },
          dashboardProjection: "overview"
        }
      };
    }
  });
  assert.equal(summaryHit.ok, true);
  assert.equal(summaryHit.provenance, "cli-summary");
  assert.deepEqual(calls, ["bootstrap", "summary"]);
});

test("resolveBootstrapSnapshot never requires service health and fails closed when all paths miss", async () => {
  const result = await resolveBootstrapSnapshot({
    cache: null,
    store: new DashboardDataStore(),
    fetchCliBootstrap: async () => ({ ok: false, code: "cli-fail", message: "nope" })
  });
  assert.equal(result.ok, false);
  assert.match(result.message, /exhausted/i);
});

/** Fresh workspace / first-run: all queue + state counts are zero, but phase identity is present. */
const FIRST_RUN_EMPTY_OVERVIEW = {
  workspaceStatus: {
    phaseKey: "146",
    label: "Phase 146",
    currentKitPhase: "146",
    status: "active"
  },
  systemStatus: { phase: "146", status: "ok" },
  stateSummary: { ready: 0, blocked: 0, inProgress: 0, proposed: 0, completed: 0 },
  dashboardProjection: "overview",
  readyQueueCount: 0,
  readyImprovementsSummary: { schemaVersion: 1, count: 0, top: [], phaseBuckets: [] },
  readyExecutionSummary: { schemaVersion: 1, count: 0, top: [], phaseBuckets: [] },
  blockedSummary: { schemaVersion: 1, count: 0, top: [], phaseBuckets: [] },
  proposedImprovementsSummary: { schemaVersion: 1, count: 0, top: [], phaseBuckets: [] },
  proposedExecutionSummary: { schemaVersion: 1, count: 0, top: [], phaseBuckets: [] },
  completedSummary: { schemaVersion: 1, count: 0, top: [], phaseBuckets: [] },
  cancelledSummary: { schemaVersion: 1, count: 0, top: [], phaseBuckets: [] }
};

const FIRST_RUN_EMPTY_QUEUE = {
  readyQueueCount: 0,
  readyImprovementsSummary: { schemaVersion: 1, count: 0, top: [], phaseBuckets: [] },
  readyExecutionSummary: { schemaVersion: 1, count: 0, top: [], phaseBuckets: [] },
  blockedSummary: { schemaVersion: 1, count: 0, top: [], phaseBuckets: [] }
};

test("T100847: isUsableColdBootstrapCache accepts all-zero first-run bag", () => {
  assert.equal(isUsableColdBootstrapCache(FIRST_RUN_EMPTY_OVERVIEW), true);
  assert.equal(isUsableColdBootstrapCache({ stateSummary: { ready: 0, blocked: 0 } }), true);
  assert.equal(isUsableColdBootstrapCache({ systemStatus: { phase: "146" } }), true);
  // Zeros alone without phase/status/stateSummary still fail closed.
  assert.equal(isUsableColdBootstrapCache({ readyQueueCount: 0 }), false);
});

test("T100847: summaryFromBootstrapSlices keeps all-zero first-run usable and overview-stamped", () => {
  const summary = summaryFromBootstrapSlices({
    overview: FIRST_RUN_EMPTY_OVERVIEW,
    queue: FIRST_RUN_EMPTY_QUEUE
  });
  assert.equal(isUsableColdBootstrapCache(summary), true);
  assert.equal(summary.dashboardProjection, "overview");
  assert.equal(summary.readyQueueCount, 0);
  assert.equal((summary.readyImprovementsSummary).count, 0);
  assert.equal((summary.readyExecutionSummary).count, 0);
  assert.equal((summary.blockedSummary).count, 0);
  assert.deepEqual((summary.stateSummary).ready, 0);
  // Empty tops still need background rollup hydration — must not block first paint.
  assert.equal(dashboardSummaryNeedsQueueRollupHydration(summary), true);
});

test("T100847: resolveBootstrapSnapshot accepts cli-bootstrap all-zero first-run bag", async () => {
  const result = await resolveBootstrapSnapshot({
    cache: null,
    store: new DashboardDataStore(),
    fetchCliBootstrap: async () => ({
      ok: true,
      data: {
        overview: FIRST_RUN_EMPTY_OVERVIEW,
        queue: FIRST_RUN_EMPTY_QUEUE
      }
    }),
    fetchCliSummaryOverview: async () => ({ ok: false })
  });
  assert.equal(result.ok, true);
  assert.equal(result.provenance, "cli-bootstrap");
  assert.equal(isUsableColdBootstrapCache(result.data), true);
  assert.equal(result.data.readyQueueCount, 0);
  assert.equal(result.dashboardProjection, "overview");
  assert.equal(dashboardSummaryNeedsQueueRollupHydration(result.data), true);
});

test("T100847: resolveBootstrapSnapshot accepts session-cache all-zero first-run bag", async () => {
  const result = await resolveBootstrapSnapshot({
    cache: { ...FIRST_RUN_EMPTY_OVERVIEW },
    store: new DashboardDataStore(),
    fetchCliBootstrap: async () => {
      throw new Error("CLI must not run when session-cache is usable");
    }
  });
  assert.equal(result.ok, true);
  assert.equal(result.provenance, "session-cache");
  assert.equal(result.data.readyQueueCount, 0);
  assert.equal(isUsableColdBootstrapCache(result.data), true);
});
