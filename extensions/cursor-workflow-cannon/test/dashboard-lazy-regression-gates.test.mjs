import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { renderDashboardRootInnerHtml } from "../dist/views/dashboard/render-dashboard.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.join(__dirname, "../src/views/dashboard");
const extensionSrcDir = path.join(__dirname, "../src");
const repoRoot = path.join(__dirname, "../../..");
const providerPath = path.join(srcDir, "DashboardViewProvider.ts");
const registryPath = path.join(srcDir, "dashboard-section-registry.ts");
const invalidationPath = path.join(srcDir, "dashboard-section-invalidation.ts");

function readSrc(name) {
  return fs.readFileSync(path.join(srcDir, name), "utf8");
}

test("initial overview hydration skips secondary kit commands (T100400 regression)", () => {
  const src = fs.readFileSync(providerPath, "utf8");
  const skipBlock = src.slice(src.indexOf("skipHeavyFetches) {"), src.indexOf("} else if (this.summaryHasCanonicalWorkspacePhase"));
  assert.match(skipBlock, /phaseJournal = undefined/);
  assert.match(skipBlock, /embeddedCaePanelHtml = null/);
  assert.doesNotMatch(skipBlock, /list-phase-notes/);
  assert.doesNotMatch(skipBlock, /get-phase-context/);
  assert.doesNotMatch(skipBlock, /cae-authoring-summary/);
});

test("initial webview resolve paints via startup direct render (overview)", () => {
  const providerSrc = fs.readFileSync(providerPath, "utf8");
  const resolveBlock = providerSrc.slice(providerSrc.indexOf("resolveWebviewView("));
  assert.match(resolveBlock, /renderDashboardStartupDirect\(webview\)/);
  assert.match(resolveBlock, /runDashboardSummary/);
  const startupBlock = providerSrc.slice(
    providerSrc.indexOf("private async renderDashboardStartupDirectOnce"),
    providerSrc.indexOf("private async postSectionPatch")
  );
  assert.match(startupBlock, /projection:\s*"overview"/);
  assert.match(startupBlock, /"startup overview"/);
  assert.doesNotMatch(startupBlock, /projection:\s*"full"/);
});

test("dashboard webview ready handshake retries initial hydration", () => {
  const providerSrc = fs.readFileSync(providerPath, "utf8");
  const webviewSrc = readSrc("dashboard-webview-client.ts");
  assert.match(webviewSrc, /dashboardWebviewReady/);
  assert.match(providerSrc, /dashboardWebviewBoot/);
  assert.match(providerSrc, /dashboardStartupTimeout/);
  assert.match(providerSrc, /dashboardStartupRefresh/);
  assert.match(providerSrc, /renderDashboardStartupDirect/);
  assert.match(providerSrc, /dashboardStartupError/);
  assert.match(providerSrc, /data-wc-startup-refresh/);
  assert.match(providerSrc, /data-wc-startup-status/);
  assert.match(providerSrc, /msg\?\.type === "dashboardWebviewReady"/);
  assert.match(providerSrc, /renderDashboardStartupDirect/);
});

test("boot ready and timeout startup triggers coalesce through the startup single-flight", () => {
  const providerSrc = fs.readFileSync(providerPath, "utf8");
  const directBlock = providerSrc.slice(
    providerSrc.indexOf("private async renderDashboardStartupDirect"),
    providerSrc.indexOf("private async renderDashboardStartupDirectOnce")
  );
  assert.match(directBlock, /dashboardStartupSingleFlight\.run/);
  assert.match(directBlock, /startup render coalesced with in-flight dashboard-summary/);

  const messageBlock = providerSrc.slice(
    providerSrc.indexOf("webview.onDidReceiveMessage"),
    providerSrc.indexOf("webviewView.onDidChangeVisibility")
  );
  assert.match(messageBlock, /dashboardWebviewBoot[\s\S]*renderDashboardStartupDirect\(webview\)/);
  assert.match(messageBlock, /dashboardStartupTimeout[\s\S]*renderDashboardStartupDirect\(webview\)/);
  assert.match(messageBlock, /dashboardWebviewReady[\s\S]*renderDashboardStartupDirect\(webview\)/);
});

test("first dashboard data render replaces full document before root patches", () => {
  const providerSrc = fs.readFileSync(providerPath, "utf8");
  assert.match(providerSrc, /dashboardRootHydrated = false/);
  assert.match(providerSrc, /if \(!this\.dashboardRootHydrated\)/);
  assert.match(providerSrc, /webview\.html = this\.buildHtml\(webview, rootInner\)/);
  assert.match(providerSrc, /wcReplaceRoot/);
});

test("startup timeout and refresh failures preserve actionable recovery without blanking a good dashboard", () => {
  const providerSrc = fs.readFileSync(providerPath, "utf8");
  const startupBlock = providerSrc.slice(
    providerSrc.indexOf("if (raw.ok !== true && raw.code === \"extension-cli-timeout\")"),
    providerSrc.indexOf("if (raw.ok === true && raw.data")
  );
  assert.match(startupBlock, /Dashboard overview timed out before JSON was returned/);
  assert.match(startupBlock, /pnpm exec wk run dashboard-summary/);
  assert.match(startupBlock, /\\"projection\\":\\"overview\\"/);
  assert.doesNotMatch(startupBlock, /create-idea/);

  const refreshFailureBlock = providerSrc.slice(
    providerSrc.indexOf("pushUpdate preserving last good dashboard after failure"),
    providerSrc.indexOf("this.lastDashboardSummaryData = null")
  );
  assert.match(refreshFailureBlock, /keeping the last loaded dashboard/);
  assert.doesNotMatch(refreshFailureBlock, /webview\.html = this\.buildHtml/);
  assert.doesNotMatch(refreshFailureBlock, /this\.lastDashboardSummaryData = null/);
});

function taskEnginePanelHtml(html) {
  const taskEngineStart = html.indexOf('<div class="wc-tab-panel" data-wc-tab="task-engine"');
  const statusStart = html.indexOf('<div class="wc-tab-panel" data-wc-tab="status"', taskEngineStart);
  assert.ok(taskEngineStart >= 0 && statusStart > taskEngineStart, "task-engine tab panel expected");
  return html.slice(taskEngineStart, statusStart);
}

function extractUnloadedLazyBucketBodies(panelHtml) {
  return [
    ...panelHtml.matchAll(
      /<div class="wc-lazy-bucket-body" data-wc-lazy-loaded="0">([\s\S]*?)<\/div><\/details>/g
    )
  ].map((match) => match[1]);
}

test("closed lazy queue buckets render placeholders not row HTML (T100400 regression)", () => {
  const fixturePath = path.join(__dirname, "../docs/fixtures/dashboard-summary.example.json");
  const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
  const html = renderDashboardRootInnerHtml(fixture);
  const taskEnginePanel = taskEnginePanelHtml(html);
  assert.match(taskEnginePanel, /wc-lazy-queue-bucket/);
  assert.match(taskEnginePanel, /data-wc-lazy-loaded="0"/);
  const lazyBodies = extractUnloadedLazyBucketBodies(taskEnginePanel);
  assert.ok(lazyBodies.length >= 3, "expected multiple lazy bucket placeholders");
  for (const body of lazyBodies) {
    assert.match(body, /wc-lazy-bucket-hint/);
    assert.doesNotMatch(body, /data-wc-action="task-detail"/);
    assert.doesNotMatch(body, /data-wc-action="proposed-imp-accept"/);
    assert.doesNotMatch(body, /imp-example/);
    assert.doesNotMatch(body, /T319/);
    assert.doesNotMatch(body, /T099/);
  }
});

test("section registry documents refresh policies for lazy architecture", () => {
  const src = fs.readFileSync(registryPath, "utf8");
  assert.match(src, /refreshPolicy/);
  assert.match(src, /on-tab-activate/);
  assert.match(src, /eager/);
});

test("invalidation module documents mutation to section mapping", () => {
  const src = fs.readFileSync(invalidationPath, "utf8");
  assert.match(src, /DashboardMutationKind/);
  assert.match(src, /task-queue/);
  assert.match(src, /phase-journal/);
});

test("bench script reports overview, queue, full, and secondary paths separately", () => {
  const bench = fs.readFileSync(
    path.join(__dirname, "../../../scripts/bench-dashboard-refresh.mjs"),
    "utf8"
  );
  assert.match(bench, /projection=overview/);
  assert.match(bench, /projection=queue/);
  assert.match(bench, /projection=full/);
  assert.match(bench, /cae-authoring-summary/);
  assert.match(bench, /secondary block/);
});

test("overview backend fast path uses lightweight status, task-state, wishlist, and terminal slices", () => {
  const baseSrc = fs.readFileSync(
    path.join(repoRoot, "src/modules/task-engine/dashboard/build-dashboard-base.ts"),
    "utf8"
  );
  const commandSrc = fs.readFileSync(
    path.join(repoRoot, "src/modules/task-engine/commands/task-engine-dashboard-on-command.ts"),
    "utf8"
  );
  assert.match(commandSrc, /projection === "overview"[\s\S]*buildDashboardOverview\(/);
  const overviewBlock = baseSrc.slice(
    baseSrc.indexOf("export async function buildDashboardOverview"),
    baseSrc.indexOf("export function buildDashboardFullProjection")
  );
  assert.match(overviewBlock, /buildDashboardSystemStatusOverview/);
  assert.doesNotMatch(overviewBlock, /buildDashboardSystemStatus\(/);
  assert.match(overviewBlock, /buildDashboardTaskStateProjectionOverview/);
  assert.doesNotMatch(overviewBlock, /buildDashboardTaskStateProjectionSummary/);
  assert.match(overviewBlock, /wishlist:\s*emptyWishlist\(10, includeWishlist\)/);
  assert.doesNotMatch(overviewBlock, /listWishlistIntakeTasksAsItems/);
  assert.match(overviewBlock, /completedSummary:[\s\S]*top:\s*\[\][\s\S]*lazy:\s*true/);
  assert.match(overviewBlock, /cancelledSummary:[\s\S]*top:\s*\[\][\s\S]*lazy:\s*true/);
});

test("queue hydration and pre-view reads are guarded against startup competition", () => {
  const providerSrc = fs.readFileSync(providerPath, "utf8");
  const extensionSrc = fs.readFileSync(path.join(extensionSrcDir, "extension.ts"), "utf8");
  assert.match(providerSrc, /queueRollupHydrationInFlight/);
  assert.match(providerSrc, /queue rollup hydration coalesced with in-flight dashboard-summary/);
  assert.match(providerSrc, /queue rollup hydration deferred: root not hydrated/);
  assert.match(providerSrc, /queue rollup hydration deferred: task-engine tab not visible/);
  assert.match(providerSrc, /tab:task-engine queue hydration/);
  assert.match(extensionSrc, /workspace-coordination-status/);
  assert.doesNotMatch(extensionSrc, /client\.run\("dashboard-summary", \{\}\)/);
});

test("dashboard timeout remediation is command specific", () => {
  const commandClientSrc = fs.readFileSync(
    path.join(extensionSrcDir, "runtime/command-client.ts"),
    "utf8"
  );
  assert.match(commandClientSrc, /commandName === "dashboard-summary"/);
  assert.match(commandClientSrc, /pnpm exec wk run dashboard-summary/);
  assert.match(commandClientSrc, /commandName === "create-idea"/);
  const dashboardTimeoutBlock = commandClientSrc.slice(
    commandClientSrc.indexOf('if (commandName === "dashboard-summary")'),
    commandClientSrc.indexOf('if (commandName === "create-idea"')
  );
  assert.doesNotMatch(dashboardTimeoutBlock, /create-idea/);
});

test("stale section state is wired in webview and provider", () => {
  assert.match(readSrc("dashboard-webview-client.ts"), /wc-dash-section--stale/);
  assert.match(fs.readFileSync(providerPath, "utf8"), /markDashboardSectionStale/);
});
