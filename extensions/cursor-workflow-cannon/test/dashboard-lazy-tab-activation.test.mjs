import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { renderDashboardRootInnerHtml } from "../dist/views/dashboard/render-dashboard.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.join(__dirname, "../src/views/dashboard");

test("renderDashboardRootInnerHtml defers secondary tabs when requested", () => {
  const fixturePath = path.join(__dirname, "../docs/fixtures/dashboard-summary.example.json");
  const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
  const html = renderDashboardRootInnerHtml(fixture, null, null, null, null, {
    deferredSections: new Set(["status", "config", "cae", "phase-journal"])
  });
  assert.match(html, /data-wc-section="overview"/);
  assert.match(html, /data-wc-section="queue"/);
  assert.match(html, /data-wc-section="phase-journal"[\s\S]*wc-dash-section--loading/);
  assert.match(html, /data-wc-section="status"[\s\S]*wc-dash-section--loading/);
  assert.match(html, /data-wc-section="config"[\s\S]*wc-dash-section--loading/);
  assert.match(html, /data-wc-section="cae"[\s\S]*wc-dash-section--loading/);
});

test("dashboard webview posts dashboardTabActivated on tab switch", () => {
  const clientPath = path.join(srcDir, "dashboard-webview-client.ts");
  const src = fs.readFileSync(clientPath, "utf8");
  assert.match(src, /dashboardTabActivated/);
  assert.match(src, /tab !== prevTab \|\| forceNotify === true/);
  assert.match(src, /applyTab\(activeTab, activeTab === 'task-engine'/);
});

test("DashboardViewProvider hydrates deferred sections on tab activation", () => {
  const providerPath = path.join(srcDir, "DashboardViewProvider.ts");
  const src = fs.readFileSync(providerPath, "utf8");
  assert.match(src, /hydrateDashboardSection/);
  assert.match(src, /onDashboardTabActivated/);
  assert.match(src, /deferredSections/);
  assert.match(src, /dashboardTabActivated/);
  assert.match(src, /ensureQueueRollupsHydrated/);
  assert.match(src, /tabId === "task-engine"/);
  assert.match(src, /scheduleKitStateChangedRefresh/);
  assert.match(src, /kitStateRefreshInFlight/);
  assert.match(src, /lastKitStateRefreshAt/);
});
