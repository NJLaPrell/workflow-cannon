import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  renderDashboardRootInnerHtml,
  escapeHtml,
  renderActiveFocusHtml,
  renderMarkdownBoldAfterEscape
} from "../dist/views/dashboard/render-dashboard.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test("escapeHtml escapes angle brackets and ampersands", () => {
  assert.equal(escapeHtml("a<b>&c"), "a&lt;b&gt;&amp;c");
});

test("renderMarkdownBoldAfterEscape wraps paired asterisks in b tags", () => {
  const esc = escapeHtml("**v0.24.0** next");
  const html = renderMarkdownBoldAfterEscape(esc);
  assert.match(html, /<b>v0\.24\.0<\/b>/);
  assert.match(html, /next/);
});

test("renderActiveFocusHtml escapes HTML then applies bold", () => {
  const html = renderActiveFocusHtml('Use **bold** and <script>');
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /<b>bold<\/b>/);
  assert.match(html, /&lt;script&gt;/);
});

test("renderDashboardRootInnerHtml shows error JSON when ok is false", () => {
  const html = renderDashboardRootInnerHtml({
    ok: false,
    code: "extension-exec-error",
    message: "CLI not found"
  });
  assert.match(html, /extension-exec-error/);
  assert.match(html, /bad/);
});

test("renderDashboardRootInnerHtml renders fixture-shaped success payload", () => {
  const fixturePath = path.join(__dirname, "../docs/fixtures/dashboard-summary.example.json");
  const fixture = JSON.parse(readFileSync(fixturePath, "utf8"));
  const html = renderDashboardRootInnerHtml(fixture);
  assert.match(html, /dashboard-overview/);
  assert.match(html, /Current phase/);
  assert.match(html, /Next phase/);
  assert.match(html, /Next action/);
  assert.match(html, /<p><b>Tasks<\/b><\/p>/);
  assert.match(html, /Ready · improvements/);
  assert.match(html, /Ready · execution/);
  assert.match(html, /Wishlist/);
  assert.match(html, /Proposed · improvements/);
  assert.match(html, /Proposed · execution/);
  assert.match(html, /imp-example/);
  assert.match(html, /T319/);
  assert.match(html, /T320/);
  assert.match(html, /W1/);
  assert.match(html, /data-wc-action="wishlist-chat"/);
  assert.match(html, /data-wc-action="proposed-imp-accept"/);
  assert.match(html, /data-wc-action="proposed-imp-chat"/);
  assert.match(html, /dash-row-action/);
  assert.match(html, /phase-bucket/);
  assert.match(html, /dashboard-terminal-tasks/);
  assert.match(html, /<p><b>Completed<\/b>/);
  assert.match(html, /<p><b>Cancelled<\/b>/);
  assert.match(html, /terminal-phase-bucket/);
  assert.match(html, /T099/);
  assert.match(html, /Not Phased/);
  assert.match(html, /Dependency overview/);
  assert.match(html, /Critical path \(ready frontier\)/);
  assert.match(html, /T320/);
  assert.match(html, /planning-card/);
  assert.match(html, /No in-flight/);
});

test("renderDashboardRootInnerHtml planning card shows resume CLI when session present", () => {
  const html = renderDashboardRootInnerHtml({
    ok: true,
    data: {
      stateSummary: { proposed: 0, ready: 0, in_progress: 0, blocked: 0, completed: 0 },
      proposedImprovementsSummary: { schemaVersion: 1, count: 0, top: [] },
      proposedExecutionSummary: { schemaVersion: 1, count: 0, top: [] },
      readyImprovementsSummary: { schemaVersion: 1, count: 0, top: [] },
      readyExecutionSummary: { schemaVersion: 1, count: 0, top: [] },
      wishlist: { openCount: 0, totalCount: 0, openTop: [] },
      blockedSummary: { count: 0, top: [] },
      readyQueueTop: [],
      readyQueueCount: 0,
      suggestedNext: null,
      planningSession: {
        schemaVersion: 1,
        updatedAt: "2026-04-01T12:00:00.000Z",
        planningType: "wishlist",
        outputMode: "wishlist",
        status: "in_progress",
        completionPct: 40,
        answeredCritical: 2,
        totalCritical: 5,
        resumeCli: "pnpm run wk run build-plan '{\"action\":\"resume\"}'"
      },
      taskStoreLastUpdated: "2026-01-01T00:00:00.000Z",
      workspaceStatus: { currentKitPhase: "1", nextKitPhase: "2", activeFocus: "Test" },
      blockingAnalysis: [],
      dependencyOverview: {
        schemaVersion: 1,
        activeTaskCount: 0,
        includedTaskCount: 0,
        edgeCount: 0,
        truncated: false,
        perfNote: null,
        nodes: [],
        edges: [],
        mermaidFlowchart: "",
        criticalPathReady: []
      }
    }
  });
  assert.match(html, /Resume/);
  assert.match(html, /build-plan/);
  assert.match(html, /40%/);
});

test("renderDashboardRootInnerHtml handles null suggestedNext", () => {
  const html = renderDashboardRootInnerHtml({
    ok: true,
    data: {
      stateSummary: { proposed: 0, ready: 0, in_progress: 0, blocked: 0, completed: 0 },
      proposedImprovementsSummary: { schemaVersion: 1, count: 0, top: [] },
      proposedExecutionSummary: { schemaVersion: 1, count: 0, top: [] },
      readyImprovementsSummary: { schemaVersion: 1, count: 0, top: [] },
      readyExecutionSummary: { schemaVersion: 1, count: 0, top: [] },
      wishlist: { openCount: 0, totalCount: 0, openTop: [] },
      blockedSummary: { count: 0, top: [] },
      readyQueueTop: [],
      readyQueueCount: 0,
      suggestedNext: null,
      planningSession: null,
      taskStoreLastUpdated: "2026-01-01T00:00:00.000Z",
      workspaceStatus: { currentKitPhase: "1", nextKitPhase: "2", activeFocus: "Test" },
      blockingAnalysis: [],
      dependencyOverview: {
        schemaVersion: 1,
        activeTaskCount: 0,
        includedTaskCount: 0,
        edgeCount: 0,
        truncated: false,
        perfNote: null,
        nodes: [],
        edges: [],
        mermaidFlowchart: "",
        criticalPathReady: []
      }
    }
  });
  assert.match(html, /Suggested next/);
  assert.match(html, /No proposed improvements/);
  assert.match(html, /No in-flight/);
});

test("renderDashboardRootInnerHtml proposed execution rows expose accept and chat actions", () => {
  const html = renderDashboardRootInnerHtml({
    ok: true,
    data: {
      stateSummary: { proposed: 1, ready: 0, in_progress: 0, blocked: 0, completed: 0 },
      proposedImprovementsSummary: { schemaVersion: 1, count: 0, top: [] },
      proposedExecutionSummary: {
        schemaVersion: 1,
        count: 1,
        top: [{ id: "T777", title: "Example proposed execution", phase: "Phase 9" }]
      },
      readyImprovementsSummary: { schemaVersion: 1, count: 0, top: [] },
      readyExecutionSummary: { schemaVersion: 1, count: 0, top: [] },
      wishlist: { openCount: 0, totalCount: 0, openTop: [] },
      blockedSummary: { count: 0, top: [] },
      readyQueueTop: [],
      readyQueueCount: 0,
      suggestedNext: null,
      planningSession: null,
      taskStoreLastUpdated: "2026-01-01T00:00:00.000Z",
      workspaceStatus: { currentKitPhase: "1", nextKitPhase: "2", activeFocus: "Test" },
      blockingAnalysis: [],
      dependencyOverview: {
        schemaVersion: 1,
        activeTaskCount: 0,
        includedTaskCount: 0,
        edgeCount: 0,
        truncated: false,
        perfNote: null,
        nodes: [],
        edges: [],
        mermaidFlowchart: "",
        criticalPathReady: []
      }
    }
  });
  assert.match(html, /data-wc-action="proposed-exe-accept"/);
  assert.match(html, /data-wc-action="proposed-exe-chat"/);
  assert.match(html, /T777/);
});

test("renderDashboardRootInnerHtml shows readyQueueBreakdown when present", () => {
  const html = renderDashboardRootInnerHtml({
    ok: true,
    data: {
      stateSummary: { proposed: 0, ready: 4, in_progress: 0, blocked: 0, completed: 0 },
      proposedExecutionSummary: { schemaVersion: 1, count: 0, top: [] },
      proposedImprovementsSummary: { schemaVersion: 1, count: 0, top: [] },
      readyImprovementsSummary: { schemaVersion: 1, count: 3, top: [] },
      readyExecutionSummary: { schemaVersion: 1, count: 1, top: [] },
      wishlist: { openCount: 0, totalCount: 0, openTop: [] },
      blockedSummary: { count: 0, top: [] },
      readyQueueTop: [],
      readyQueueCount: 4,
      readyQueueBreakdown: { schemaVersion: 1, improvement: 3, other: 1 },
      suggestedNext: null,
      planningSession: null,
      taskStoreLastUpdated: "2026-01-01T00:00:00.000Z",
      workspaceStatus: { currentKitPhase: "1", nextKitPhase: "2", activeFocus: "Test" },
      blockingAnalysis: [],
      dependencyOverview: {
        schemaVersion: 1,
        activeTaskCount: 0,
        includedTaskCount: 0,
        edgeCount: 0,
        truncated: false,
        perfNote: null,
        nodes: [],
        edges: [],
        mermaidFlowchart: "",
        criticalPathReady: []
      }
    }
  });
  assert.match(html, /Ready queue · 3 improvements · 1 other/);
});
