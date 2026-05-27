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
const webviewClientSrc = readFileSync(
  path.join(__dirname, "../src/views/dashboard/dashboard-webview-client.ts"),
  "utf8"
);

test("PlanArtifact accept posts a dedicated dashboard message", () => {
  assert.match(webviewClientSrc, /act === 'plan-artifact-accept'/);
  assert.match(webviewClientSrc, /type:'acceptPlanArtifact'/);
  assert.match(webviewClientSrc, /data-plan-id/);
  assert.match(webviewClientSrc, /data-plan-ref/);
  assert.match(webviewClientSrc, /data-plan-version/);
});

test("PlanArtifact accept host action calls accept-plan-artifact with policy approval", () => {
  const block = providerSrc.slice(
    providerSrc.indexOf('if (msg?.type === "acceptPlanArtifact")'),
    providerSrc.indexOf('if (msg?.type === "openTaskDetail")')
  );
  assert.match(block, /onAcceptPlanArtifact/);
  assert.match(providerSrc, /this\.client\.run\("accept-plan-artifact"/);
  assert.match(providerSrc, /workflowId: "plan-artifact"/);
  assert.match(providerSrc, /command: "accept-plan-artifact"/);
  assert.match(providerSrc, /expectedPlanningGenerationArgs/);
});