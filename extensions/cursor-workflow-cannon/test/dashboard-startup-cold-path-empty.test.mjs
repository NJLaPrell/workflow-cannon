/**
 * T100847 — Empty / first-run overview cold-path behavior.
 *
 * Fresh workspace with all-zero queue + state counts must still:
 *   shell-painted → hydrated (usable overview, not stuck on loading)
 * Background planning/queue hydration may hang — must NOT block hydrated.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { DashboardStartupController } from "../dist/views/dashboard/dashboard-startup-controller.js";
import {
  isUsableColdBootstrapCache,
  resolveBootstrapSnapshot
} from "../dist/views/dashboard/bootstrap-snapshot-adapter.js";
import { DashboardDataStore } from "../dist/views/dashboard/dashboard-data-store.js";
import { renderDashboardRootInnerHtml } from "../dist/views/dashboard/render-dashboard.js";
import { renderDashboardShellInnerHtml } from "../dist/views/dashboard/render-dashboard-shell.js";
import { dashboardSummaryNeedsQueueRollupHydration } from "../dist/views/dashboard/dashboard-queue-fingerprint.js";

/** Fresh workspace / first-run: phase identity present, every queue count is zero. */
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
  cancelledSummary: { schemaVersion: 1, count: 0, top: [], phaseBuckets: [] },
  wishlist: { schemaVersion: 1, openCount: 0, totalCount: 0, openTop: [] }
};

const FIRST_RUN_EMPTY_QUEUE = {
  readyQueueCount: 0,
  readyImprovementsSummary: { schemaVersion: 1, count: 0, top: [], phaseBuckets: [] },
  readyExecutionSummary: { schemaVersion: 1, count: 0, top: [], phaseBuckets: [] },
  blockedSummary: { schemaVersion: 1, count: 0, top: [], phaseBuckets: [] }
};

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function neverResolves() {
  return new Promise(() => {});
}

function assertEmptyUsableOverviewHtml(html, summary) {
  assert.doesNotMatch(
    html,
    /wc-dashboard-shell-initial/,
    "empty first-run must clear the stuck loading shell"
  );
  assert.match(
    html,
    /data-wc-section="overview"[^>]*class="[^"]*wc-dash-section--ready[^"]*"/,
    "overview section must be ready (not loading)"
  );
  assert.doesNotMatch(
    html,
    /data-wc-section="overview"[^>]*wc-dash-section--loading/,
    "overview must not remain in loading state"
  );
  assert.match(html, /aria-busy="false"/);
  assert.match(html, /Phase 146|phaseKey|146/);
  assert.match(html, /wc-stat-pills/);
  assert.match(html, /wc-stat-num">0</);
  assert.match(html, /No ready tasks\./);
  // Deferred secondary tabs may still show loading — that is fine; overview must not.
  assert.match(html, /data-wc-section="status"[\s\S]*?wc-dash-section--loading/);
  assert.equal(isUsableColdBootstrapCache(summary), true);
  assert.equal(summary.readyQueueCount, 0);
  assert.equal((summary.stateSummary)?.ready, 0);
}

/**
 * Mirrors DashboardViewProvider cold path without the VS Code host.
 * Background hydration is intentionally decoupled from the hydrated transition.
 */
async function runEmptyColdPath(options = {}) {
  const {
    fetchCliBootstrap = async () => ({
      ok: true,
      data: {
        overview: FIRST_RUN_EMPTY_OVERVIEW,
        queue: FIRST_RUN_EMPTY_QUEUE
      }
    }),
    fetchCliSummaryOverview = async () => ({ ok: false, code: "unused", message: "not needed" }),
    executeBackgroundHydration = async () => {},
    cache = null
  } = options;

  const store = new DashboardDataStore();
  const shellHtml = renderDashboardShellInnerHtml({ active: "cli-polling", detail: "service unavailable" });
  assert.match(shellHtml, /wc-dashboard-shell-initial/);

  let paintedHtml = null;
  let paintedSummary = null;
  let hydratedAtMs = null;
  let readyAtMs = null;
  let backgroundStarted = false;

  const t0 = performance.now();

  const controller = new DashboardStartupController({
    executeBootstrap: async () => {
      const snapshot = await resolveBootstrapSnapshot({
        cache,
        store,
        fetchCliBootstrap,
        fetchCliSummaryOverview,
        log: () => {}
      });
      assert.equal(snapshot.ok, true, `bootstrap must succeed: ${snapshot.message ?? ""}`);
      paintedSummary = snapshot.data;
      paintedHtml = renderDashboardRootInnerHtml(
        { ok: true, code: `bootstrap-${snapshot.provenance}`, data: snapshot.data },
        null,
        null,
        undefined,
        null,
        {
          deferredSections: new Set(["status", "config", "cae", "phase-journal"]),
          readModeBadge: { active: "cli-polling", detail: "service unavailable (forced)" }
        }
      );
    },
    executeBackgroundHydration: async () => {
      backgroundStarted = true;
      await executeBackgroundHydration();
    },
    onHydrated: () => {
      hydratedAtMs = performance.now() - t0;
    },
    onReady: () => {
      readyAtMs = performance.now() - t0;
    },
    log: () => {}
  });

  controller.markShellPainted();
  assert.equal(controller.getPhase(), "shell-painted");

  // Do not await controller.request() for hydrated — it also waits on background hydration.
  const startupPromise = controller.request("resolve-webview");

  const deadline = Date.now() + 5000;
  while (hydratedAtMs == null && Date.now() < deadline) {
    await delay(5);
  }

  return {
    controller,
    startupPromise,
    shellHtml,
    paintedHtml,
    paintedSummary,
    // Live getters — hydrated/ready may land after this object is returned.
    get hydratedAtMs() {
      return hydratedAtMs;
    },
    get readyAtMs() {
      return readyAtMs;
    },
    get backgroundStarted() {
      return backgroundStarted;
    }
  };
}

test("T100847: empty first-run cold path reaches hydrated with usable zero-count overview", async () => {
  const result = await runEmptyColdPath({
    executeBackgroundHydration: async () => {
      await delay(10);
    }
  });

  assert.ok(result.hydratedAtMs != null, "onHydrated must fire for empty first-run paint");
  assert.ok(result.paintedHtml, "root HTML must be painted");
  assertEmptyUsableOverviewHtml(result.paintedHtml, result.paintedSummary);
  assert.equal(result.controller.isHydrated(), true);
  assert.equal(dashboardSummaryNeedsQueueRollupHydration(result.paintedSummary), true);

  await result.startupPromise;
  assert.equal(result.controller.getPhase(), "ready");
  assert.equal(result.controller.isReady(), true);
  assert.ok(result.readyAtMs != null);
  result.controller.reset();
});

test("T100847: empty first-run does not block hydrated when background planning/queue hangs", async () => {
  const result = await runEmptyColdPath({
    executeBackgroundHydration: () => neverResolves()
  });

  assert.ok(result.hydratedAtMs != null, "onHydrated must fire even when background hangs");
  assert.ok(
    result.hydratedAtMs < 2000,
    `empty first-run hydrated must not wait on background (got ${result.hydratedAtMs.toFixed(1)}ms)`
  );
  assertEmptyUsableOverviewHtml(result.paintedHtml, result.paintedSummary);
  assert.equal(result.controller.isHydrated(), true);
  assert.ok(
    result.controller.getPhase() === "hydrated" ||
      result.controller.getPhase() === "background-hydrating",
    `phase after paint should be hydrated/background-hydrating, got ${result.controller.getPhase()}`
  );
  assert.equal(result.readyAtMs, null, "ready must wait on background; hydrated must not");

  // Cleanup: abandon hung background so the test process can exit.
  result.controller.reset();
});

test("T100847: blank no-data queue states stay readable with deferred secondary sections", async () => {
  const result = await runEmptyColdPath();
  assert.ok(result.paintedHtml);
  assertEmptyUsableOverviewHtml(result.paintedHtml, result.paintedSummary);
  // Secondary tabs deferred — blank queue must not force overview back into loading.
  assert.match(result.paintedHtml, /data-wc-section="config"[\s\S]*?wc-dash-section--loading/);
  assert.match(result.paintedHtml, /data-wc-section="cae"[\s\S]*?wc-dash-section--loading/);
  assert.match(result.paintedHtml, /data-wc-section="phase-journal"[\s\S]*?wc-dash-section--loading/);
  await result.startupPromise;
  result.controller.reset();
});

test("T100847: session-cache all-zero first-run paints without CLI", async () => {
  let cliCalls = 0;
  const result = await runEmptyColdPath({
    cache: { ...FIRST_RUN_EMPTY_OVERVIEW },
    fetchCliBootstrap: async () => {
      cliCalls += 1;
      return { ok: false, code: "should-not-run", message: "cache hit" };
    }
  });
  assert.equal(cliCalls, 0);
  assertEmptyUsableOverviewHtml(result.paintedHtml, result.paintedSummary);
  await result.startupPromise;
  result.controller.reset();
});
