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
const coordinatorSrc = readFileSync(
  path.join(__dirname, "../src/views/dashboard/dashboard-coordinator.ts"),
  "utf8"
);

test("accept-proposed registered on coordinator and isolated handler", () => {
  assert.match(coordinatorSrc, /registerDrawerWorkflow/);
  assert.match(providerSrc, /registerDrawerWorkflow\("accept-proposed"\)/);
  assert.match(providerSrc, /handleAcceptProposedDrawerSubmit/);
  assert.match(providerSrc, /setDrawerMutationProgress/);
});

test("proposed row Accept opens drawer without immediate queue invalidation", () => {
  const block = providerSrc.slice(
    providerSrc.indexOf('if (msg?.type === "dashboardTransition")'),
    providerSrc.indexOf('if (msg?.type === "dismissPhaseNote")')
  );
  assert.match(block, /if \(action === "accept"\)[\s\S]*onDashboardAcceptProposed/);
  assert.match(block, /Drawer submit refreshes the queue/);
  assert.doesNotMatch(
    block.slice(block.indexOf('if (action === "accept")'), block.indexOf("await confirmAndRunTransition")),
    /applyDashboardMutationInvalidation\("task-queue"\)/
  );
});

test("accept-proposed skips accept transition when task already ready", () => {
  assert.match(providerSrc, /ensureTaskAcceptedFromProposed/);
  assert.match(providerSrc, /status === "ready"/);
});

test("accept-proposed uses snapshot progress not wcDrawerProgress", () => {
  const handlerBlock = providerSrc.slice(
    providerSrc.indexOf("handleAcceptProposedDrawerSubmit"),
    providerSrc.indexOf("private async handleDrawerSubmit")
  );
  assert.match(handlerBlock, /setDrawerMutationProgress/);
  assert.doesNotMatch(handlerBlock, /postDrawerProgressToWebview/);
  assert.doesNotMatch(handlerBlock, /notifyAfterDrawerClosed/);
  assert.doesNotMatch(handlerBlock, /showInformationMessage/);
  assert.match(handlerBlock, /queueDrawerNotify/);
  assert.doesNotMatch(handlerBlock, /queueDrawerKitStateChanged/);
  assert.doesNotMatch(handlerBlock, /this\.notifyKitStateChanged/);
});
