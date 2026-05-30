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

test("Option 1: DashboardViewProvider wires store + pollers (no legacy 45s timer)", () => {
  assert.match(providerSrc, /DashboardDataStore/);
  assert.match(providerSrc, /DashboardPollerCoordinator/);
  assert.match(providerSrc, /dashboardPollers\.start\(\)/);
  assert.match(providerSrc, /refreshCriticalNow/);
  assert.doesNotMatch(providerSrc, /dashboardPollTimer/);
});

test("Option 1: slice freshness labels render in section patches", () => {
  assert.match(providerSrc, /wrapSectionHtmlWithFreshness/);
  const bridgeSrc = readFileSync(
    path.join(__dirname, "../src/views/dashboard/dashboard-store-bridge.ts"),
    "utf8"
  );
  assert.match(bridgeSrc, /wc-dash-slice-freshness/);
});

test("Option 1: mutation path marks store slices stale and refreshes pollers", () => {
  assert.match(providerSrc, /dashboardSliceNamesForMutation/);
  assert.match(providerSrc, /dashboardPollers\.pause\(\)/);
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
