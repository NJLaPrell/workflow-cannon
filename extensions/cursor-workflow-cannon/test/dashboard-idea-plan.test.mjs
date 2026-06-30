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
const tierMod = await import("../dist/policy/dashboard-policy-tier.js");

test("Ideas Plan this posts prefillIdeaPlanningChat from the webview", () => {
  assert.match(webviewClientSrc, /act === 'idea-plan'/);
  assert.match(webviewClientSrc, /type:'prefillIdeaPlanningChat'/);
});

test("Ideas Plan this host action calls start-idea-planning with policy approval", () => {
  const block = providerSrc.slice(
    providerSrc.indexOf("private async onPrefillIdeaPlanningChat"),
    providerSrc.indexOf("private async onTaskCommentsComingSoon")
  );
  assert.match(block, /runMutationWithGenerationRetry\("start-idea-planning"/);
  assert.match(block, /command: "start-idea-planning"/);
  assert.match(block, /clientMutationId: this\.dashboardIdeaPlanMutationId/);
  assert.match(block, /data\.planningChatPrompt/);
  assert.match(block, /prefillCursorChat\(prompt/);
  assert.doesNotMatch(block, /buildPlannerChatPrompt/);
  assert.doesNotMatch(block, /update-idea/);
});

test("resolveDashboardPolicyTierRow maps Ideas plan to start-idea-planning", () => {
  const row = tierMod.resolveDashboardPolicyTierRow("ideas", "plan");
  assert.ok(row);
  assert.equal(row.tier, "routine");
  assert.equal(row.command, "start-idea-planning");
});
