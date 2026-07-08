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

test("PlanArtifact review posts a dedicated dashboard message and reports missing identity", () => {
  assert.match(webviewClientSrc, /act === 'plan-artifact-review'/);
  assert.match(webviewClientSrc, /type:'reviewPlanArtifact'/);
  assert.match(webviewClientSrc, /type:'invalidPlanArtifactAction'/);
  assert.match(webviewClientSrc, /setButtonBusy\(t,true,'Reviewing\.\.\.'\)/);
  assert.match(webviewClientSrc, /data-plan-id/);
  assert.match(webviewClientSrc, /data-plan-version/);
});

test("PlanArtifact accept host action calls accept-plan-artifact with policy approval", () => {
  const block = providerSrc.slice(
    providerSrc.indexOf('if (msg?.type === "acceptPlanArtifact")'),
    providerSrc.indexOf('if (msg?.type === "openTaskDetail")')
  );
  assert.match(block, /onAcceptPlanArtifact/);
  assert.match(providerSrc, /runMutationWithGenerationRetry\("accept-plan-artifact"/);
  assert.match(providerSrc, /workflowId: "plan-artifact"/);
  assert.match(providerSrc, /command: "accept-plan-artifact"/);
  const hostBlock = providerSrc.slice(
    providerSrc.indexOf("private async onAcceptPlanArtifact"),
    providerSrc.indexOf("private async onReviewPlanArtifact")
  );
  assert.match(hostBlock, /applyDashboardMutationInvalidation\("plan-artifact"\)/);
});

test("PlanArtifact review host action also retries once on stale planning generation", () => {
  const block = providerSrc.slice(
    providerSrc.indexOf('if (msg?.type === "reviewPlanArtifact")'),
    providerSrc.indexOf('if (msg?.type === "finalizePlanArtifact")')
  );
  assert.match(block, /onReviewPlanArtifact/);
  assert.match(block, /Cannot review this plan because its dashboard identity is incomplete/);
  assert.match(providerSrc, /runMutationWithGenerationRetry\("review-plan-artifact"/);
  const hostBlock = providerSrc.slice(
    providerSrc.indexOf("private async onReviewPlanArtifact"),
    providerSrc.indexOf("private async onFinalizePlanArtifact")
  );
  assert.match(hostBlock, /applyDashboardMutationInvalidation\("plan-artifact"\)/);
});

test("PlanArtifact invalid action messages surface a dashboard warning", () => {
  const block = providerSrc.slice(
    providerSrc.indexOf('if (msg?.type === "invalidPlanArtifactAction")'),
    providerSrc.indexOf('if (msg?.type === "reviewPlanArtifact")')
  );
  assert.match(block, /showWarningMessage/);
  assert.match(block, /dashboard identity is incomplete/);
});

test("PlanArtifact finalize previews then persists and opens the phase queue", () => {
  assert.match(webviewClientSrc, /act === 'plan-artifact-finalize'/);
  assert.match(webviewClientSrc, /type:'finalizePlanArtifact'/);
  assert.match(webviewClientSrc, /wcOpenQueueForPhase/);
  const block = providerSrc.slice(
    providerSrc.indexOf('if (msg?.type === "finalizePlanArtifact")'),
    providerSrc.indexOf('if (msg?.type === "openTaskDetail")')
  );
  assert.match(block, /onFinalizePlanArtifact/);
  assert.match(providerSrc, /runMutationWithGenerationRetry\("finalize-plan-to-phase", \{[\s\S]*dryRun: true/);
  assert.match(providerSrc, /runMutationWithGenerationRetry\("finalize-plan-to-phase", \{[\s\S]*dryRun: false/);
  assert.match(providerSrc, /ingestPlanningMetaFromData\(preview\.data/);
  assert.match(providerSrc, /workflowId: "plan-artifact"/);
  assert.match(providerSrc, /action: "finalize"/);
  const hostBlock = providerSrc.slice(
    providerSrc.indexOf("private async onFinalizePlanArtifact"),
    providerSrc.indexOf("private async onViewPlanArtifact")
  );
  assert.match(hostBlock, /applyDashboardMutationInvalidation\("plan-artifact"\)/);
  assert.doesNotMatch(hostBlock, /inferPhaseKeyForKitPhaseNoteFromDashboard/);
  assert.doesNotMatch(hostBlock, /targetPhaseKey/);
  assert.match(providerSrc, /wcOpenQueueForPhase/);
});