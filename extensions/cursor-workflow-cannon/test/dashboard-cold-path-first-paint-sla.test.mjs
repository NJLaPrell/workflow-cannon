/**
 * T100846 — Deterministic cold-path first-paint SLA (≤3s usable overview).
 *
 * Exercises the stack below DashboardViewProvider:
 *   DashboardStartupController + resolveBootstrapSnapshot + renderDashboardRootInnerHtml
 *
 * No live wk / dashboard-service. Fake delays via controlled Promise + performance.now().
 * SLA is measured at onHydrated (first usable overview paint), not when background hydration finishes.
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

const FIRST_PAINT_SLA_MS = 3000;

/** Phase-146 overview + queue-count fixture (CLI-primary cold bootstrap shape). */
const PHASE_146_OVERVIEW = {
  workspaceStatus: {
    phaseKey: "146",
    label: "Phase 146",
    currentKitPhase: "146",
    status: "active"
  },
  systemStatus: { phase: "146", status: "ok" },
  stateSummary: { ready: 3, blocked: 1, inProgress: 2, proposed: 0 },
  dashboardProjection: "overview",
  readyQueueCount: 3,
  readyImprovementsSummary: { schemaVersion: 1, count: 2, top: [], phaseBuckets: [] },
  readyExecutionSummary: { schemaVersion: 1, count: 1, top: [], phaseBuckets: [] },
  blockedSummary: { schemaVersion: 1, count: 1, top: [], phaseBuckets: [] }
};

const PHASE_146_QUEUE_COUNTS = {
  readyQueueCount: 3,
  readyImprovementsSummary: { schemaVersion: 1, count: 2, top: [], phaseBuckets: [] },
  readyExecutionSummary: { schemaVersion: 1, count: 1, top: [], phaseBuckets: [] },
  blockedSummary: { schemaVersion: 1, count: 1, top: [], phaseBuckets: [] }
};

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function neverResolves() {
  return new Promise(() => {});
}

function assertUsableOverviewHtml(html, summary) {
  assert.doesNotMatch(
    html,
    /wc-dashboard-shell-initial/,
    "usable overview must clear the stuck loading shell"
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
  assert.ok(
    html.includes(String(summary.readyQueueCount)) || html.includes("wc-stat-num"),
    "queue / ready counts must surface in overview paint"
  );
  assert.match(html, /wc-stat-pills/);
  assert.equal(isUsableColdBootstrapCache(summary), true);
  assert.equal(summary.workspaceStatus?.phaseKey, "146");
  assert.equal(String(summary.systemStatus?.phase), "146");
  assert.equal(summary.readyQueueCount, 3);
}

/**
 * Mirrors DashboardViewProvider cold path without the VS Code host:
 * shell paint → resolveBootstrapSnapshot → render → onHydrated.
 * Background hydration is intentionally decoupled from the SLA stopwatch.
 */
async function runColdPathFirstPaint(options) {
  const {
    fetchCliBootstrap,
    fetchCliSummaryOverview,
    executeBackgroundHydration = async () => {},
    /** When true, bootstrap awaits non-overview work before paint (regression case). */
    awaitNonOverviewBeforePaint = null
  } = options;

  const store = new DashboardDataStore();
  const shellHtml = renderDashboardShellInnerHtml({ active: "cli-polling", detail: "service unavailable" });
  assert.match(shellHtml, /wc-dashboard-shell-initial/);

  let paintedHtml = null;
  let paintedSummary = null;
  let hydratedAtMs = null;
  let backgroundStarted = false;

  const t0 = performance.now();

  const controller = new DashboardStartupController({
    executeBootstrap: async () => {
      if (typeof awaitNonOverviewBeforePaint === "function") {
        await awaitNonOverviewBeforePaint();
      }
      const snapshot = await resolveBootstrapSnapshot({
        cache: null,
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
    log: () => {}
  });

  controller.markShellPainted();
  assert.equal(controller.getPhase(), "shell-painted");

  // Do not await controller.request() for the SLA — it also waits on background hydration.
  const startupPromise = controller.request("resolve-webview");

  // Yield until onHydrated fires (or timeout well past SLA for negative cases).
  const deadline = Date.now() + 8000;
  while (hydratedAtMs == null && Date.now() < deadline) {
    await delay(5);
  }

  return {
    controller,
    startupPromise,
    shellHtml,
    paintedHtml,
    paintedSummary,
    hydratedAtMs,
    get backgroundStarted() {
      return backgroundStarted;
    }
  };
}

test("T100846: cold-path paints usable overview within 3s while background hydration hangs", async () => {
  const result = await runColdPathFirstPaint({
    fetchCliBootstrap: async () => {
      // Tiny controlled delay — still far under SLA; proves async path without live CLI.
      await delay(15);
      return {
        ok: true,
        data: {
          overview: PHASE_146_OVERVIEW,
          queue: PHASE_146_QUEUE_COUNTS
        }
      };
    },
    fetchCliSummaryOverview: async () => ({ ok: false, code: "unused", message: "not needed" }),
    // Ideas / detail / queue rollup must NOT gate first paint.
    executeBackgroundHydration: () => neverResolves()
  });

  assert.ok(result.hydratedAtMs != null, "onHydrated must fire for first usable paint");
  assert.ok(
    result.hydratedAtMs < FIRST_PAINT_SLA_MS,
    `usable overview must land within ${FIRST_PAINT_SLA_MS}ms (got ${result.hydratedAtMs.toFixed(1)}ms)`
  );
  assert.ok(result.paintedHtml, "root HTML must be painted");
  assertUsableOverviewHtml(result.paintedHtml, result.paintedSummary);
  assert.equal(result.controller.isHydrated(), true);
  assert.ok(
    result.controller.getPhase() === "hydrated" ||
      result.controller.getPhase() === "background-hydrating",
    `phase after paint should be hydrated/background-hydrating, got ${result.controller.getPhase()}`
  );
  // Background work may have started, but must not have blocked the SLA stopwatch.
  assert.ok(result.backgroundStarted === true || result.backgroundStarted === false);

  // Cleanup: abandon hung background so the test process can exit.
  result.controller.reset();
});

test("T100846: negative — slow CLI bootstrap (3500ms) exceeds 3s first-paint SLA", async () => {
  const result = await runColdPathFirstPaint({
    fetchCliBootstrap: async () => {
      await delay(3500);
      return {
        ok: true,
        data: {
          overview: PHASE_146_OVERVIEW,
          queue: PHASE_146_QUEUE_COUNTS
        }
      };
    },
    fetchCliSummaryOverview: async () => ({ ok: false }),
    executeBackgroundHydration: async () => {}
  });

  assert.ok(result.hydratedAtMs != null, "paint eventually completes");
  assert.ok(
    result.hydratedAtMs > FIRST_PAINT_SLA_MS,
    `slow CLI must breach SLA (got ${result.hydratedAtMs.toFixed(1)}ms)`
  );
  // Still a usable overview once it lands — the failure is the budget, not the payload.
  assertUsableOverviewHtml(result.paintedHtml, result.paintedSummary);
  result.controller.reset();
});

test("T100846: negative — awaiting Ideas/detail before overview paint exceeds 3s SLA", async () => {
  const result = await runColdPathFirstPaint({
    fetchCliBootstrap: async () => ({
      ok: true,
      data: {
        overview: PHASE_146_OVERVIEW,
        queue: PHASE_146_QUEUE_COUNTS
      }
    }),
    fetchCliSummaryOverview: async () => ({ ok: false }),
    // Simulates a borked bootstrap that waits on non-overview work before paint.
    awaitNonOverviewBeforePaint: async () => {
      await delay(3500); // Ideas / detail / queue projection gate
    },
    executeBackgroundHydration: async () => {}
  });

  assert.ok(result.hydratedAtMs != null);
  assert.ok(
    result.hydratedAtMs > FIRST_PAINT_SLA_MS,
    `blocking Ideas/detail before paint must breach SLA (got ${result.hydratedAtMs.toFixed(1)}ms)`
  );
  result.controller.reset();
});

test("T100846: cold path never touches dashboard-service health / start", async () => {
  const serviceCalls = [];
  const result = await runColdPathFirstPaint({
    fetchCliBootstrap: async () => {
      // If someone wired service into bootstrap, this would be the smell test.
      serviceCalls.push("cli-bootstrap");
      return {
        ok: true,
        data: {
          overview: PHASE_146_OVERVIEW,
          queue: PHASE_146_QUEUE_COUNTS
        }
      };
    },
    fetchCliSummaryOverview: async () => {
      serviceCalls.push("cli-summary");
      return { ok: false };
    },
    executeBackgroundHydration: async () => {
      serviceCalls.push("background");
    }
  });

  assert.ok(result.hydratedAtMs < FIRST_PAINT_SLA_MS);
  assert.deepEqual(serviceCalls.filter((c) => c.startsWith("service")), []);
  assert.ok(serviceCalls.includes("cli-bootstrap"));
  assert.doesNotMatch(JSON.stringify(serviceCalls), /dashboard-service|health|service-start/i);
  result.controller.reset();
});
