import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildDashboardWebviewBootstrapScript } from "../dist/views/dashboard/dashboard-webview-client.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const providerSrc = readFileSync(
  path.join(__dirname, "../src/views/dashboard/DashboardViewProvider.ts"),
  "utf8"
);

test("dashboard extension src has no dashboardDrawerSubmitInFlight", () => {
  assert.doesNotMatch(providerSrc, /dashboardDrawerSubmitInFlight/);
});

test("dashboard webview bootstrap has no drawerSubmitInFlight", () => {
  const script = buildDashboardWebviewBootstrapScript(JSON.stringify("(function(){})();"));
  assert.doesNotMatch(script, /drawerSubmitInFlight/);
  assert.doesNotMatch(script, /wcDrawerProgress/);
  assert.doesNotMatch(script, /wcDrawerValidation/);
  assert.match(script, /wcHostSnapshot/);
});
