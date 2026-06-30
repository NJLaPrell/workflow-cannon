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

function renderIdeas(top) {
  const counts = top.reduce(
    (acc, row) => {
      const status = String(row?.status ?? "");
      if (status === "open") acc.openCount += 1;
      if (status === "planning") acc.planningCount += 1;
      if (status === "planned") acc.plannedCount += 1;
      return acc;
    },
    { openCount: 0, planningCount: 0, plannedCount: 0 }
  );
  return renderDashboardRootInnerHtml({
    ok: true,
    data: {
      stateSummary: {},
      workspaceStatus: {},
      ideas: {
        available: true,
        totalCount: top.length,
        openCount: counts.openCount,
        planningCount: counts.planningCount,
        plannedCount: counts.plannedCount,
        top
      }
    }
  });
}

test("Ideas Plan this posts prefillIdeaPlanningChat from the webview", () => {
  assert.match(webviewClientSrc, /act === 'idea-plan'/);
  assert.match(webviewClientSrc, /type:'prefillIdeaPlanningChat'/);
});

test("Ideas View plan posts viewPlanArtifact from the webview", () => {
  assert.match(webviewClientSrc, /act === 'idea-view-plan'/);
  assert.match(webviewClientSrc, /type:'viewPlanArtifact'/);
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

test("Ideas View plan host opens persisted plan artifact file", () => {
  assert.match(providerSrc, /if \(msg\?\.type === "viewPlanArtifact"\)/);
  assert.match(providerSrc, /private async onViewPlanArtifact/);
  assert.match(providerSrc, /client\.run\("get-plan-artifact"/);
  assert.match(providerSrc, /openTextDocument/);
});

test("resolveDashboardPolicyTierRow maps Ideas plan to start-idea-planning", () => {
  const row = tierMod.resolveDashboardPolicyTierRow("ideas", "plan");
  assert.ok(row);
  assert.equal(row.tier, "routine");
  assert.equal(row.command, "start-idea-planning");
});

test("ideas row renders Plan this or Resume planning but never both labels", () => {
  const openHtml = renderIdeas([{ id: "I001", title: "New idea", note: "", status: "open" }]);
  assert.match(openHtml, /Plan this/);
  assert.doesNotMatch(openHtml, /Resume planning/);

  const activeHtml = renderIdeas([
    {
      id: "I002",
      title: "Active session",
      note: "",
      status: "planning",
      planningChatSession: { status: "active", ideaId: "I002", sessionId: "pcs-test" }
    }
  ]);
  assert.match(activeHtml, /Resume planning/);
  assert.doesNotMatch(activeHtml, />Plan this</);
});

test("ideas row renders Review and View plan for draft-ready ideas", () => {
  const html = renderIdeas([
    {
      id: "I003",
      title: "Draft ready",
      note: "",
      status: "planning",
      planningChatSession: {
        status: "draft_ready",
        ideaId: "I003",
        currentPlanRef: "plan-artifact:draft-ready",
        currentPlanVersion: 3
      },
      activeDraftPlanArtifactSummary: {
        planId: "draft-ready",
        planRef: "plan-artifact:draft-ready",
        status: "draft",
        version: 3
      }
    }
  ]);
  assert.match(html, /data-wc-action="plan-artifact-review"/);
  assert.match(html, /data-plan-id="draft-ready"/);
  assert.match(html, /data-wc-action="idea-view-plan"/);
  assert.doesNotMatch(html, /data-wc-action="plan-artifact-accept"/);
});

test("ideas row disables Accept when review blockers remain", () => {
  const html = renderIdeas([
    {
      id: "I004",
      title: "Needs revision",
      note: "",
      status: "planning",
      planningChatSession: {
        status: "needs_revision",
        ideaId: "I004",
        currentPlanRef: "plan-artifact:blocked-review",
        currentPlanVersion: 4
      },
      activeDraftPlanArtifactSummary: {
        planId: "blocked-review",
        planRef: "plan-artifact:blocked-review",
        status: "reviewed",
        version: 4,
        latestReview: {
          planRef: "plan-artifact:blocked-review",
          passed: false,
          blockerCount: 2,
          warningCount: 0,
          openQuestionCount: 0
        }
      }
    }
  ]);
  assert.match(html, /Resume planning/);
  const acceptButton = html.match(/<button[^>]+data-wc-action="plan-artifact-accept"[^>]*>/)?.[0] ?? "";
  assert.match(acceptButton, /disabled/);
});

test("ideas row allows Accept for warning-only approval-ready plans", () => {
  const html = renderIdeas([
    {
      id: "I005",
      title: "Approval ready",
      note: "",
      status: "planning",
      planningChatSession: {
        status: "approval_ready",
        ideaId: "I005",
        currentPlanRef: "plan-artifact:warning-only",
        currentPlanVersion: 5
      },
      activeDraftPlanArtifactSummary: {
        planId: "warning-only",
        planRef: "plan-artifact:warning-only",
        status: "reviewed",
        version: 5,
        latestReview: {
          planRef: "plan-artifact:warning-only",
          passed: true,
          blockerCount: 0,
          warningCount: 2,
          openQuestionCount: 1
        }
      }
    }
  ]);
  const acceptButton = html.match(/<button[^>]+data-wc-action="plan-artifact-accept"[^>]*>/)?.[0] ?? "";
  assert.doesNotMatch(acceptButton, /disabled/);
  assert.match(html, /data-plan-id="warning-only"/);
  assert.match(html, /View plan/);
});

test("ideas row renders Finalize plus View plan for accepted plans", () => {
  const html = renderIdeas([
    {
      id: "I006",
      title: "Accepted idea",
      note: "",
      status: "planned",
      linkedPlanArtifact: "plan-artifact:accepted-plan",
      linkedPlanArtifactSummary: {
        planId: "accepted-plan",
        planRef: "plan-artifact:accepted-plan",
        status: "accepted",
        version: 6,
        phaseKey: "139"
      }
    }
  ]);
  assert.match(html, /data-wc-action="plan-artifact-finalize"/);
  assert.match(html, /data-plan-id="accepted-plan"/);
  assert.match(html, /data-wc-action="idea-view-plan"/);
});

test("ideas row renders View tasks for finalized plans", () => {
  const html = renderIdeas([
    {
      id: "I007",
      title: "Finalized idea",
      note: "",
      status: "planned",
      linkedPlanArtifact: "plan-artifact:finalized-plan",
      linkedPlanArtifactSummary: {
        planId: "finalized-plan",
        planRef: "plan-artifact:finalized-plan",
        status: "finalized",
        version: 7,
        phaseKey: "139"
      }
    }
  ]);
  assert.match(html, /data-wc-action="open-queue-for-phase"/);
  assert.match(html, /data-wc-phase-key="139"/);
  assert.match(html, /View tasks/);
  assert.match(html, /View plan/);
  assert.doesNotMatch(html, /data-wc-action="plan-artifact-finalize"/);
});
