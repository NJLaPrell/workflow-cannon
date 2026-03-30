import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { renderDashboardRootInnerHtml, escapeHtml } from "../dist/views/dashboard/render-dashboard.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test("escapeHtml escapes angle brackets and ampersands", () => {
  assert.equal(escapeHtml("a<b>&c"), "a&lt;b&gt;&amp;c");
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
  assert.match(html, /Phase/);
  assert.match(html, /Wishlist/);
  assert.match(html, /Ready preview/);
  assert.match(html, /T319/);
  assert.match(html, /W1/);
});

test("renderDashboardRootInnerHtml handles null suggestedNext", () => {
  const html = renderDashboardRootInnerHtml({
    ok: true,
    data: {
      stateSummary: { proposed: 0, ready: 0, in_progress: 0, blocked: 0, completed: 0 },
      wishlist: { openCount: 0, totalCount: 0, openTop: [] },
      blockedSummary: { count: 0, top: [] },
      readyQueueTop: [],
      readyQueueCount: 0,
      suggestedNext: null,
      planningSession: null,
      taskStoreLastUpdated: "2026-01-01T00:00:00.000Z",
      workspaceStatus: { currentKitPhase: "1", activeFocus: "Test" }
    }
  });
  assert.match(html, /Suggested next/);
  assert.match(html, /—/);
});
