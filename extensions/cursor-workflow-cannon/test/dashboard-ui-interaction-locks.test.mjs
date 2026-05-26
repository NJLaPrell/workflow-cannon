import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.join(__dirname, "../src/views/dashboard");

function readDash(name) {
  return readFileSync(path.join(srcDir, name), "utf8");
}

const providerSrc = readDash("DashboardViewProvider.ts");
const webviewClientSrc = readDash("dashboard-webview-client.ts");
const refreshControllerSrc = readDash("dashboard-refresh-controller.ts");
const drawerSessionSrc = readDash("drawer-session.ts");

test("DashboardViewProvider defers host refresh while interaction locks are held", () => {
  assert.match(providerSrc, /dashboardInteractionLocks = new Set/);
  assert.match(providerSrc, /isDashboardRefreshDeferred/);
  assert.match(providerSrc, /setDashboardUiInteraction/);
  assert.match(providerSrc, /msg\?\.type === "wcUiInteraction"/);
  assert.match(providerSrc, /if \(this\.isDashboardRefreshDeferred\(\)\)/);
  assert.match(providerSrc, /refreshController\.onDeferredCleared/);
});

test("dashboard webview bootstrap queues wcReplaceRoot while UI is locked", () => {
  assert.match(webviewClientSrc, /var pendingReplaceRootHtml/);
  assert.match(webviewClientSrc, /function setUiInteraction\(source, active\)/);
  assert.match(webviewClientSrc, /type: 'wcUiInteraction'/);
  assert.match(webviewClientSrc, /if \(isLocalUiLocked\(\)\)/);
  assert.match(webviewClientSrc, /pendingReplaceRootHtml = m\.html/);
  assert.match(webviewClientSrc, /setUiInteraction\('phase-filter', true\)/);
  assert.match(webviewClientSrc, /setUiInteraction\('phase-deliverables', true\)/);
  assert.match(webviewClientSrc, /setUiInteraction\('context-help', true\)/);
  assert.match(providerSrc, /wc-context-help-popover/);
  assert.match(webviewClientSrc, /wcReinitEmbeddedCae/);
  assert.match(webviewClientSrc, /wcMarkPhaseBusy/);
  assert.match(webviewClientSrc, /wcHidePhaseCards/);
  assert.match(webviewClientSrc, /wcPhaseDeliverablesSaved/);
});

test("dashboard drawer submit shows animated loading overlay while kit command runs", () => {
  assert.match(webviewClientSrc, /function setDrawerBusy\(busy, label\)/);
  assert.match(webviewClientSrc, /function updateDrawerBusyLabel\(label\)/);
  assert.match(webviewClientSrc, /className = 'wc-drawer-loading'/);
  assert.match(webviewClientSrc, /class="wc-spinner"/);
  assert.match(webviewClientSrc, /setDrawerBusy\(true, drawerSubmitBusyLabel\(panel\)\)/);
  assert.match(webviewClientSrc, /setDrawerBusy\(false\)/);
  assert.match(webviewClientSrc, /wcDrawerClose[\s\S]*setDrawerBusy\(false\)/);
  assert.match(webviewClientSrc, /wcDrawerState/);
  assert.match(webviewClientSrc, /applyWcDrawerState/);
  assert.match(providerSrc, /wcDrawerProgress/);
  assert.match(providerSrc, /postDrawerProgressToWebview/);
  assert.match(webviewClientSrc, /updateDrawerBusyLabel\(m\.label\)/);
  assert.match(webviewClientSrc, /setDrawerBusy\(true, label\)/);
  assert.match(providerSrc, /Starting batch accept/);
  assert.match(providerSrc, /Accepting \$\{taskId\} \(\$\{step\} of \$\{total\}\)/);
  assert.match(webviewClientSrc, /drawerSubmitBusyLabel/);
  assert.match(webviewClientSrc, /data-wc-drawer-task-count/);
  assert.match(webviewClientSrc, /drawerBusyLabelForWorkflow/);
  assert.match(webviewClientSrc, /Updating task phase/);
  assert.match(drawerSessionSrc, /DrawerSessionController/);
});

test("dashboard drawer submit suppresses dashboard-summary refresh during batch kit runs", () => {
  assert.match(providerSrc, /refreshController/);
  assert.match(providerSrc, /beginDrawerSubmitRefreshHold/);
  assert.match(providerSrc, /endDrawerSubmitRefreshHold/);
  assert.match(providerSrc, /beginDashboardMutationRefreshHold/);
  assert.match(providerSrc, /setRefreshPaused\(true\)/);
  assert.match(refreshControllerSrc, /setSuppressed/);
  assert.match(refreshControllerSrc, /notifyMutationStart/);
  assert.match(providerSrc, /KIT_REFRESH_PAUSED_CODE/);
  assert.match(providerSrc, /summaryHasCanonicalWorkspacePhase/);
  assert.match(providerSrc, /pushUpdate\(\{ light: true \}\)/);
  assert.match(refreshControllerSrc, /this\.queued = true/);
});

test("dashboard roster start and mark complete pause refresh during kit mutations", () => {
  assert.match(providerSrc, /onStartPhaseFromRoster[\s\S]*beginDashboardMutationRefreshHold/);
  assert.match(providerSrc, /onMarkPhaseComplete[\s\S]*beginDashboardMutationRefreshHold/);
});

test("dashboard refresh button shows inline spinner while summary reloads", () => {
  assert.match(webviewClientSrc, /function setButtonBusy\(el, busy, label\)/);
  assert.match(webviewClientSrc, /setButtonBusy\(btn, true, 'Refreshing…'\)/);
  assert.match(webviewClientSrc, /setButtonBusy\(refreshBtn, false\)/);
});

test("dashboard drawer submit uses coordinator dispatch (T100493)", () => {
  assert.match(providerSrc, /dashboardDrawerSubmitInFlight/);
  assert.match(providerSrc, /webviewMessageDisposable/);
  assert.match(providerSrc, /this\.webviewMessageDisposable\?\.dispose\(\)/);
  assert.match(webviewClientSrc, /drawerSubmitInFlight/);
  assert.match(providerSrc, /coordinator\.dispatch/);
  assert.match(providerSrc, /queueDrawerNotify/);
  assert.match(providerSrc, /endDrawerSubmitRefreshHold/);
  assert.doesNotMatch(providerSrc, /drawerSubmit ignored \(already in flight\)/);
});

test("dashboard and kit tracing use Workflow Cannon output channel", () => {
  assert.match(providerSrc, /logWc\("dashboard"/);
  const logSrc = readFileSync(
    path.join(__dirname, "../src/runtime/workflow-cannon-log.ts"),
    "utf8"
  );
  assert.match(logSrc, /createOutputChannel\("Workflow Cannon"\)/);
  assert.doesNotMatch(logSrc, /log: true/);
});

test("phase deliverables save uses targeted webview patch instead of full pushUpdate", () => {
  const marker = 'type: "wcPhaseDeliverablesSaved"';
  const idx = providerSrc.indexOf(marker);
  assert.ok(idx >= 0, "wcPhaseDeliverablesSaved postMessage expected");
  const saveBlock = providerSrc.slice(Math.max(0, idx - 400), idx + 200);
  assert.doesNotMatch(saveBlock, /await this\.pushUpdate\(\)/);
});
