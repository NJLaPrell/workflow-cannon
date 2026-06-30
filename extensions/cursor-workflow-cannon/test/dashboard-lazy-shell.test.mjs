import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  renderDashboardShellInnerHtml,
  DASHBOARD_SECTION_REGISTRY
} from "../dist/views/dashboard/render-dashboard-shell.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.join(__dirname, "../src/views/dashboard");

test("renderDashboardShellInnerHtml paints tab chrome without dashboard-summary payload", () => {
  const html = renderDashboardShellInnerHtml();
  assert.match(html, /wc-dashboard-tab-shell/);
  assert.match(html, /data-wc-tab="overview"/);
  assert.match(html, /data-wc-tab="planning"/);
  assert.match(html, /data-wc-tab="task-engine"/);
  assert.match(html, /data-wc-tab="status"/);
  assert.match(html, /data-wc-tab="config"/);
  assert.match(html, /data-wc-tab="cae"/);
  assert.doesNotMatch(html, /stateSummary/);
});

test("renderDashboardShellInnerHtml includes branded idle banner and segmented tabs", () => {
  const html = renderDashboardShellInnerHtml();
  const bannerIdx = html.indexOf("wc-banner");
  const tabBarIdx = html.indexOf("wc-tab-bar");
  assert.ok(bannerIdx >= 0, "startup shell should render branded idle banner");
  assert.ok(tabBarIdx > bannerIdx, "startup banner should appear before tabs");
  assert.match(html, /class="[^"]*\bwc-banner\b[^"]*"/);
  assert.match(html, /data-agent-status-kind="idle"/);
  assert.match(html, /wc-status-dot wc-status-dot--idle/);
  assert.match(html, /wc-banner-status-label wc-banner-status-label--idle[\s\S]*Idle/);
  assert.match(html, /wc-banner-name">Workflow Cannon<\/span>/);
  assert.match(html, /wc-banner-tagline">workspace-kit<\/span>/);
  assert.match(html, /wc-dash-section-skeleton/);
  assert.match(html, /data-wc-tab="overview"[\s\S]*<span class="wc-tab-icon">[\s\S]*Overview/);
  assert.match(html, /data-wc-tab="planning"[\s\S]*<span class="wc-tab-icon">[\s\S]*Planning/);
  assert.match(html, /data-wc-tab="task-engine"[\s\S]*<span class="wc-tab-icon">[\s\S]*Queue/);
  assert.match(html, /data-wc-tab="status"[\s\S]*<span class="wc-tab-icon">[\s\S]*Status/);
  assert.match(html, /data-wc-tab="config"[\s\S]*<span class="wc-tab-icon">[\s\S]*Config/);
  assert.match(html, /data-wc-tab="cae"[\s\S]*<span class="wc-tab-icon">[\s\S]*CAE/);
});

test("renderDashboardShellInnerHtml includes loading placeholders for every registry section", () => {
  const html = renderDashboardShellInnerHtml();
  for (const section of DASHBOARD_SECTION_REGISTRY) {
    assert.match(
      html,
      new RegExp(`data-wc-section="${section.id}"`),
      `missing placeholder for ${section.id}`
    );
    assert.match(
      html,
      new RegExp(`wc-dash-section--loading`),
      `section ${section.id} should start loading`
    );
  }
});

test("dashboard section registry lists overview, planning, queue, phase journal, status, config, cae sections", () => {
  assert.equal(DASHBOARD_SECTION_REGISTRY.length, 9);
  const ids = DASHBOARD_SECTION_REGISTRY.map((s) => s.id).sort();
  assert.deepEqual(ids, [
    "cae",
    "config",
    "ideas",
    "overview",
    "phase-journal",
    "phase-roster",
    "plan-artifact",
    "queue",
    "status"
  ]);
  const ideas = DASHBOARD_SECTION_REGISTRY.find((s) => s.id === "ideas");
  assert.equal(ideas?.tabId, "planning");
  assert.equal(ideas?.refreshPolicy, "eager");
  assert.equal(ideas?.ttlMs, 45_000);
  const phaseRoster = DASHBOARD_SECTION_REGISTRY.find((s) => s.id === "phase-roster");
  assert.equal(phaseRoster?.tabId, "planning");
});

test("DashboardViewProvider paints shell before pushUpdate (T100395)", () => {
  const providerPath = path.join(srcDir, "DashboardViewProvider.ts");
  const src = fs.readFileSync(providerPath, "utf8");
  assert.match(src, /renderDashboardShellInnerHtml\(\)/);
  assert.match(src, /shell painted synchronously/);
  const resolveBlock = src.slice(src.indexOf("resolveWebviewView("));
  const shellIdx = resolveBlock.indexOf("renderDashboardShellInnerHtml()");
  const paintIdx = resolveBlock.indexOf("void this.renderDashboardStartupDirect(webview)");
  assert.ok(shellIdx >= 0 && paintIdx >= 0 && shellIdx < paintIdx, "shell must render before startup direct paint");
});

test("DashboardViewProvider startup first paint uses overview then schedules queue rollup hydration", () => {
  const providerPath = path.join(srcDir, "DashboardViewProvider.ts");
  const src = fs.readFileSync(providerPath, "utf8");
  const startupBlock = src.slice(
    src.indexOf("private async renderDashboardStartupDirectOnce"),
    src.indexOf("private async postSectionPatch")
  );
  assert.match(startupBlock, /projection:\s*"overview"/);
  assert.doesNotMatch(startupBlock, /projection:\s*"full"/);
  assert.match(startupBlock, /ensureQueueRollupsHydrated\(/);
  assert.match(startupBlock, /startup queue rollup hydration scheduled/);
  assert.doesNotMatch(startupBlock, /ensureStatusHydrated\(/);
});

test("DashboardViewProvider preserves last good root when a later pushUpdate fails", () => {
  const providerPath = path.join(srcDir, "DashboardViewProvider.ts");
  const src = fs.readFileSync(providerPath, "utf8");
  const refreshBlock = src.slice(
    src.indexOf("private async executeDashboardRefresh"),
    src.indexOf("scheduleConfigTabRefresh")
  );
  assert.match(refreshBlock, /summaryProjection = refreshOptions\?\.projection \?\? "overview"/);
  assert.match(refreshBlock, /pushUpdate preserving last good dashboard after failure/);
  assert.match(refreshBlock, /Dashboard refresh failed; keeping the last loaded dashboard/);
});

test("dashboard webview bootstrap handles wcSectionPatch with interaction-lock queue", () => {
  const clientPath = path.join(srcDir, "dashboard-webview-client.ts");
  const src = fs.readFileSync(clientPath, "utf8");
  assert.match(src, /wcSectionPatch/);
  assert.match(src, /applySectionPatch/);
  assert.match(src, /pendingSectionPatches/);
});

test("dashboard ui interaction locks defer wcSectionPatch like wcReplaceRoot", () => {
  const clientPath = path.join(srcDir, "dashboard-webview-client.ts");
  const src = fs.readFileSync(clientPath, "utf8");
  const patchHandler = src.slice(src.indexOf("m.type === 'wcSectionPatch'"));
  assert.match(patchHandler, /isLocalUiLocked\(\)/);
  assert.match(patchHandler, /pendingSectionPatches/);
});
