import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const providerSrc = readFileSync(
  path.join(__dirname, "../src/views/dashboard/DashboardViewProvider.ts"),
  "utf8"
);

test("DashboardViewProvider defers host refresh while interaction locks are held", () => {
  assert.match(providerSrc, /dashboardInteractionLocks = new Set/);
  assert.match(providerSrc, /dashboardRefreshAfterInteraction/);
  assert.match(providerSrc, /isDashboardRefreshDeferred/);
  assert.match(providerSrc, /setDashboardUiInteraction/);
  assert.match(providerSrc, /msg\?\.type === "wcUiInteraction"/);
  assert.match(providerSrc, /if \(this\.isDashboardRefreshDeferred\(\)\)/);
});

test("dashboard webview bootstrap queues wcReplaceRoot while UI is locked", () => {
  assert.match(providerSrc, /var pendingReplaceRootHtml/);
  assert.match(providerSrc, /function setUiInteraction\(source, active\)/);
  assert.match(providerSrc, /type: 'wcUiInteraction'/);
  assert.match(providerSrc, /if \(isLocalUiLocked\(\)\)/);
  assert.match(providerSrc, /pendingReplaceRootHtml = m\.html/);
  assert.match(providerSrc, /setUiInteraction\('phase-filter', true\)/);
  assert.match(providerSrc, /setUiInteraction\('phase-deliverables', true\)/);
  assert.match(providerSrc, /setUiInteraction\('context-help', true\)/);
  assert.match(providerSrc, /wc-context-help-popover/);
  assert.match(providerSrc, /wcPhaseDeliverablesSaved/);
});

test("dashboard drawer submit shows animated loading overlay while kit command runs", () => {
  assert.match(providerSrc, /function setDrawerBusy\(busy, label\)/);
  assert.match(providerSrc, /className = 'wc-drawer-loading'/);
  assert.match(providerSrc, /class="wc-spinner"/);
  assert.match(providerSrc, /setDrawerBusy\(true\)/);
  assert.match(providerSrc, /drawerBusyLabelForWorkflow/);
  assert.match(providerSrc, /Updating task phase/);
});

test("dashboard refresh button shows inline spinner while summary reloads", () => {
  assert.match(providerSrc, /function setButtonBusy\(el, busy, label\)/);
  assert.match(providerSrc, /setButtonBusy\(btn, true, 'Refreshing…'\)/);
  assert.match(providerSrc, /setButtonBusy\(refreshBtn, false\)/);
});

test("phase deliverables save uses targeted webview patch instead of full pushUpdate", () => {
  const marker = 'type: "wcPhaseDeliverablesSaved"';
  const idx = providerSrc.indexOf(marker);
  assert.ok(idx >= 0, "wcPhaseDeliverablesSaved postMessage expected");
  const saveBlock = providerSrc.slice(Math.max(0, idx - 400), idx + 200);
  assert.doesNotMatch(saveBlock, /await this\.pushUpdate\(\)/);
});
