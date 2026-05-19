import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { GUIDANCE_PANEL_WEBVIEW_CSS } from "../dist/views/shared/guidance-panel-webview-css.js";
import { renderDashboardRootInnerHtml } from "../dist/views/dashboard/render-dashboard.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Stable selector from the shared module — used to detect accidental removal. */
const GP_CSS_SENTINEL = ".gp-tabs button.is-active";

test("GUIDANCE_PANEL_WEBVIEW_CSS exports gp-* selectors for embedded CAE", () => {
  assert.match(GUIDANCE_PANEL_WEBVIEW_CSS, /\.gp-shell\b/);
  assert.match(GUIDANCE_PANEL_WEBVIEW_CSS, /\.gp-tabs\b/);
  assert.ok(GUIDANCE_PANEL_WEBVIEW_CSS.includes(GP_CSS_SENTINEL));
});

test("DashboardViewProvider composes GUIDANCE_PANEL_WEBVIEW_CSS into webview style", () => {
  const providerPath = path.join(__dirname, "../src/views/dashboard/DashboardViewProvider.ts");
  const src = fs.readFileSync(providerPath, "utf8");
  assert.match(
    src,
    /import\s+\{\s*GUIDANCE_PANEL_WEBVIEW_CSS\s*\}\s+from\s+["'][^"']*guidance-panel-webview-css/
  );
  assert.match(src, /\$\{GUIDANCE_PANEL_WEBVIEW_CSS\}/);
  assert.match(src, /CAE tab embed[\s\S]*\$\{GUIDANCE_PANEL_WEBVIEW_CSS\}/);
});

test("renderDashboardRootInnerHtml wraps embedded CAE in wc-dashboard-embedded-guidance host", () => {
  const embedded =
    '<section class="gp-root"><nav class="gp-tabs"><button data-gp-tab="overview" class="is-active">Overview</button></nav></section>';
  const html = renderDashboardRootInnerHtml(
    {
      ok: true,
      data: {
        stateSummary: { ready: 0, proposed: 0, blocked: 0, completed: 0 },
        readyImprovementsSummary: { schemaVersion: 1, count: 0, top: [], phaseBuckets: [] },
        readyExecutionSummary: { schemaVersion: 1, count: 0, top: [], phaseBuckets: [] },
        proposedImprovementsSummary: { schemaVersion: 1, count: 0, top: [], phaseBuckets: [] },
        proposedExecutionSummary: { schemaVersion: 1, count: 0, top: [], phaseBuckets: [] },
        blockedSummary: { count: 0, top: [], phaseBuckets: [] },
        transcriptChurnResearchSummary: { schemaVersion: 1, count: 0, top: [], phaseBuckets: [] },
        completedSummary: { schemaVersion: 1, count: 0, top: [], phaseBuckets: [] },
        cancelledSummary: { schemaVersion: 1, count: 0, top: [], phaseBuckets: [] },
        wishlist: {
          schemaVersion: 1,
          openCount: 0,
          totalCount: 0,
          openPage: 0,
          openPageSize: 10,
          openTotalPages: 0,
          openTop: []
        },
        readyQueueTop: [],
        readyQueueCount: 0,
        readyQueueBreakdown: { schemaVersion: 1, improvement: 0, other: 0 },
        executionPlanningScope: "tasks-only",
        suggestedNext: null,
        planningSession: null,
        workspaceStatus: { currentKitPhase: "100", nextKitPhase: "101" },
        blockingAnalysis: [],
        dependencyOverview: { schemaVersion: 1, blocked: [], ready: [], inProgress: [] }
      }
    },
    null,
    null,
    null,
    embedded
  );
  assert.match(html, /wc-dashboard-embedded-guidance/);
  assert.match(html, /wc-dash-cae-host/);
  assert.match(html, /data-wc-tab="cae"[\s\S]*gp-tabs/);
});
