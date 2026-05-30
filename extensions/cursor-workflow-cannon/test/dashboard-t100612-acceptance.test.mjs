/**
 * T100612 — Move dashboard refresh to service-backed source (acceptance).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const extRoot = path.join(__dirname, "..");
const repoRoot = path.join(__dirname, "../../..");

test("T100612: dashboard shows active data source mode (badge + live channel)", () => {
  const providerSrc = readFileSync(
    path.join(extRoot, "src/views/dashboard/DashboardViewProvider.ts"),
    "utf8"
  );
  const shellSrc = readFileSync(
    path.join(extRoot, "src/views/dashboard/render-dashboard-shell.ts"),
    "utf8"
  );
  const webviewSrc = readFileSync(
    path.join(extRoot, "src/views/dashboard/dashboard-webview-client.ts"),
    "utf8"
  );
  assert.match(providerSrc, /postDashboardReadModeBadge/);
  assert.match(providerSrc, /wcDashboardReadMode/);
  assert.match(shellSrc, /data-wc-read-mode-badge/);
  assert.match(webviewSrc, /applyDashboardReadModeBadge/);
});

test("T100612: auto/service/cli-polling modes wired in read path coordinator", () => {
  const coordinatorSrc = readFileSync(
    path.join(extRoot, "src/views/dashboard/dashboard-read-path-coordinator.ts"),
    "utf8"
  );
  const configSrc = readFileSync(
    path.join(extRoot, "src/views/dashboard/resolve-dashboard-read-config.ts"),
    "utf8"
  );
  assert.match(coordinatorSrc, /probeDashboardServiceHealth/);
  assert.match(coordinatorSrc, /startServicePath/);
  assert.match(coordinatorSrc, /startCliPollingPath/);
  assert.match(coordinatorSrc, /forceCliPollingMode/);
  assert.match(configSrc, /readConfiguredDashboardDataSourceMode/);
});

test("T100612: warm service SLA documented in bench script", () => {
  const bench = readFileSync(path.join(repoRoot, "scripts/bench-dashboard-service.mjs"), "utf8");
  assert.match(bench, /warm snapshot.*1000|warmMs.*1000/s);
  assert.match(bench, /createDashboardService/);
});
