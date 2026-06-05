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
const extensionSrc = readFileSync(path.join(__dirname, "../src/extension.ts"), "utf8");

test("Option 1: DashboardViewProvider wires store + pollers (no legacy 45s timer)", () => {
  assert.match(providerSrc, /DashboardDataStore/);
  assert.match(providerSrc, /DashboardPollerCoordinator/);
  assert.match(providerSrc, /readPath\.start\(\)/);
  assert.doesNotMatch(providerSrc, /refreshCriticalNow\(\)/);
  assert.doesNotMatch(providerSrc, /dashboardPollTimer/);
});

test("Option 1: slice freshness labels render in section patches (disabled)", () => {
  assert.match(providerSrc, /wrapSectionHtmlWithFreshness/);
  const bridgeSrc = readFileSync(
    path.join(__dirname, "../src/views/dashboard/dashboard-store-bridge.ts"),
    "utf8"
  );
  // Freshness indicators disabled per user feedback
  assert.doesNotMatch(bridgeSrc, /wc-dash-slice-freshness/);
});

test("Option 1: mutation path marks store slices stale and refreshes pollers", () => {
  assert.match(providerSrc, /dashboardSliceNamesForMutation/);
  assert.match(providerSrc, /readPath\.pause\(\)/);
  assert.match(providerSrc, /refreshSlicesNow/);
});

test("Option 1: load trace module exists for verbose diagnostics", () => {
  const traceSrc = readFileSync(
    path.join(__dirname, "../src/views/dashboard/dashboard-load-trace.ts"),
    "utf8"
  );
  assert.match(traceSrc, /recordSliceFetch/);
  assert.match(traceSrc, /formatTraceLine/);
});

test("Option 1 plan documents Option 2 deferred", () => {
  const plan = readFileSync(
    path.join(__dirname, "../../../.ai/plans/dashboard-option-1-state-store-and-pollers.md"),
    "utf8"
  );
  assert.match(plan, /Option 2/);
  assert.match(plan, /deferred|Out of scope/i);
});

test("Option 1: background status hydration exists and is single-flight", () => {
  assert.match(providerSrc, /runDashboardSummaryStatus/);
  assert.match(providerSrc, /ensureStatusHydrated/);
  assert.match(providerSrc, /inFlightStatusHydration/);
  assert.match(providerSrc, /hydration coalesced/);
});

test("Option 1: queue rollup hydration is single-flight after overview paint", () => {
  assert.match(providerSrc, /queueRollupHydrationInFlight/);
  assert.match(providerSrc, /ensureQueueRollupsHydratedOnce/);
  assert.match(providerSrc, /queue rollup hydration coalesced/);
  assert.match(providerSrc, /queue rollup hydration deferred: root not hydrated/);
  assert.match(providerSrc, /queue rollup hydration deferred: refresh paused or suppressed/);
  assert.match(providerSrc, /preserveOnSummaryFailure/);
  assert.match(providerSrc, /preserved existing sections after summary failure/);
});

test("Option 1: dashboard-summary calls are source labeled and activation avoids pre-view summary", () => {
  const pollerSrc = readFileSync(
    path.join(__dirname, "../src/views/dashboard/dashboard-pollers.ts"),
    "utf8"
  );
  assert.match(providerSrc, /dashboard-summary source=\$\{source\}/);
  assert.match(providerSrc, /tab:task-engine queue hydration/);
  assert.match(providerSrc, /tab:status status hydration/);
  assert.match(providerSrc, /"kit-state refresh"/);
  assert.match(providerSrc, /manual refresh/);
  assert.match(pollerSrc, /source: "read-path prefetch"/);
  assert.match(pollerSrc, /source: "poller refresh"/);
  assert.match(extensionSrc, /workspace-coordination-status/);
  assert.match(extensionSrc, /statusBarInFlight/);
  assert.match(extensionSrc, /lastStatusBarRefreshAt/);
  assert.doesNotMatch(extensionSrc, /client\.run\("dashboard-summary", \{\}\)/);
});

test("Option 1: DashboardViewProvider delegates to dashboard-terminal-rows for completed/cancelled tasks", () => {
  assert.match(providerSrc, /"dashboard-terminal-rows"/);
});
