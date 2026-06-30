import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { renderDashboardRootInnerHtml } from "../dist/views/dashboard/render-dashboard.js";

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

function ideaPlanHostBlock() {
  return providerSrc.slice(
    providerSrc.indexOf("private async runPrefillIdeaPlanningChat"),
    providerSrc.indexOf("private async onTaskCommentsComingSoon")
  );
}

test("Ideas Plan this posts prefillIdeaPlanningChat from the webview", () => {
  assert.match(webviewClientSrc, /act === 'idea-plan'/);
  assert.match(webviewClientSrc, /type:'prefillIdeaPlanningChat'/);
});

test("Ideas Plan this webview ignores repeat clicks while plan button is busy", () => {
  const block = webviewClientSrc.slice(
    webviewClientSrc.indexOf("function submitIdeaPlan"),
    webviewClientSrc.indexOf("function setIdeaEditMode")
  );
  assert.match(block, /planBtn\.disabled/);
  assert.match(block, /setIdeaRowBusy\(row, true, 'Opening\.\.\.'\)/);
});

test("Ideas Plan this host action calls start-idea-planning with policy approval", () => {
  const block = ideaPlanHostBlock();
  assert.match(block, /runMutationWithGenerationRetry\("start-idea-planning"/);
  assert.match(block, /command: "start-idea-planning"/);
  assert.match(block, /clientMutationId: this\.dashboardIdeaPlanMutationId/);
  assert.match(block, /data\.planningChatPrompt/);
  assert.match(block, /prefillCursorChat\(prompt/);
  assert.doesNotMatch(block, /buildPlannerChatPrompt/);
  assert.doesNotMatch(block, /update-idea/);
});

test("Ideas Plan this uses stable per-idea clientMutationId for command replay", () => {
  const mutationBlock = providerSrc.slice(
    providerSrc.indexOf("private dashboardIdeaPlanMutationId"),
    providerSrc.indexOf("private formatStartIdeaPlanningError")
  );
  assert.match(mutationBlock, /dashboard-idea-plan-\$\{ideaId\}/);
  assert.doesNotMatch(mutationBlock, /Date\.now\(\)/);
  assert.doesNotMatch(mutationBlock, /dashboardDrawerMutationId\("dashboard-idea-plan"/);
});

test("Ideas Plan this host single-flights concurrent Plan this for the same idea", () => {
  const block = providerSrc.slice(
    providerSrc.indexOf("private async onPrefillIdeaPlanningChat"),
    providerSrc.indexOf("private async runPrefillIdeaPlanningChat")
  );
  assert.match(block, /inFlightIdeaPlan\.get\(ideaId\)/);
  assert.match(block, /inFlightIdeaPlan\.set\(ideaId, work\)/);
  assert.match(block, /inFlightIdeaPlan\.delete\(ideaId\)/);
});

test("resolveDashboardPolicyTierRow maps Ideas plan to start-idea-planning", () => {
  const row = tierMod.resolveDashboardPolicyTierRow("ideas", "plan");
  assert.ok(row);
  assert.equal(row.tier, "routine");
  assert.equal(row.command, "start-idea-planning");
});

test("ideas row renders Plan this or Resume planning but never both labels", () => {
  const openHtml = renderDashboardRootInnerHtml({
    ok: true,
    data: {
      stateSummary: {},
      workspaceStatus: {},
      ideas: {
        available: true,
        totalCount: 1,
        openCount: 1,
        planningCount: 0,
        plannedCount: 0,
        top: [{ id: "I001", title: "New idea", note: "", status: "open" }]
      }
    }
  });
  assert.match(openHtml, /Plan this/);
  assert.doesNotMatch(openHtml, /Resume planning/);

  const activeHtml = renderDashboardRootInnerHtml({
    ok: true,
    data: {
      stateSummary: {},
      workspaceStatus: {},
      ideas: {
        available: true,
        totalCount: 1,
        openCount: 0,
        planningCount: 1,
        plannedCount: 0,
        top: [
          {
            id: "I002",
            title: "Active session",
            note: "",
            status: "planning",
            planningChatSession: { status: "active", ideaId: "I002", sessionId: "pcs-test" }
          }
        ]
      }
    }
  });
  assert.match(activeHtml, /Resume planning/);
  assert.doesNotMatch(activeHtml, />Plan this</);
});
