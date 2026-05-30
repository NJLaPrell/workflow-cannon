import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "../../..");
const extRoot = path.join(__dirname, "..");
const providerSrc = readFileSync(path.join(extRoot, "src/views/dashboard/DashboardViewProvider.ts"), "utf8");
const coordinatorSrc = readFileSync(
  path.join(extRoot, "src/views/dashboard/dashboard-read-path-coordinator.ts"),
  "utf8"
);
const routesSrc = readFileSync(
  path.join(repoRoot, "src/services/dashboard-service/routes.ts"),
  "utf8"
);

test("Option 2: read path coordinator — service OR pollers, never both", () => {
  assert.match(coordinatorSrc, /stopActivePath/);
  assert.match(coordinatorSrc, /startServicePath/);
  assert.match(coordinatorSrc, /startCliPollingPath/);
  assert.doesNotMatch(coordinatorSrc, /dashboardPollers\.start\(\)[\s\S]*serviceSync\.start/);
});

test("Option 2: auto fallback preserves store (no blanket clear on service failure)", () => {
  assert.match(coordinatorSrc, /serviceFailDetail/);
  assert.match(coordinatorSrc, /probeDashboardServiceHealth/);
  assert.doesNotMatch(coordinatorSrc, /dashboardStore\.clear|\.reset\(/);
});

test("Option 2: /health exposes per-slice observability (T100600)", () => {
  assert.match(routesSrc, /buildDashboardServiceHealthPayload/);
  assert.match(routesSrc, /getSliceObservability/);
  assert.match(routesSrc, /getObservabilitySummary/);
});

test("Option 2: provider uses readPath not raw poller lifecycle", () => {
  assert.match(providerSrc, /readPath\.start\(\)/);
  assert.match(providerSrc, /readPath\.stop\(\)/);
  assert.match(providerSrc, /readPath\.pause\(\)/);
  assert.doesNotMatch(providerSrc, /this\.dashboardPollers\.start\(\)/);
});

test("Option 2: mode badge + live update channel", () => {
  assert.match(providerSrc, /wcDashboardReadMode/);
  assert.match(providerSrc, /renderDashboardReadModeBadgeHtml|readModeBadge/);
  const webviewSrc = readFileSync(
    path.join(extRoot, "src/views/dashboard/dashboard-webview-client.ts"),
    "utf8"
  );
  assert.match(webviewSrc, /wcDashboardReadMode/);
});

test("Option 2: service bench script documents SLA gates", () => {
  const bench = readFileSync(path.join(repoRoot, "scripts/bench-dashboard-service.mjs"), "utf8");
  assert.match(bench, /5000/);
  assert.match(bench, /1000/);
  assert.match(bench, /createDashboardService/);
});

test("Option 2: kit poll tiers match handoff (≤2s / ≤5s / ≤10s)", () => {
  const pollGroups = readFileSync(
    path.join(repoRoot, "src/services/dashboard-service/poll-groups.ts"),
    "utf8"
  );
  assert.match(pollGroups, /critical:\s*2000/);
  assert.match(pollGroups, /queue:\s*5000/);
  assert.match(pollGroups, /ops:\s*10000/);
});

test("Option 2: lifecycle commands registered for service daemon", () => {
  const manifest = readFileSync(
    path.join(repoRoot, "src/contracts/builtin-run-command-manifest.json"),
    "utf8"
  );
  for (const cmd of [
    "dashboard-service-start",
    "dashboard-service-stop",
    "dashboard-service-status",
    "dashboard-service-snapshot"
  ]) {
    assert.match(manifest, new RegExp(`"name":\\s*"${cmd}"`));
  }
});

test("Option 2 plan lists epic tasks through T100601", () => {
  const plan = readFileSync(
    path.join(repoRoot, ".ai/plans/dashboard-option-2-read-service.md"),
    "utf8"
  );
  assert.match(plan, /T100601/);
  assert.match(plan, /Option 2 stabilize/);
});
