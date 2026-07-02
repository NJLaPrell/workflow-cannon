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
    providerSrc.indexOf("private async runPrefillIdeaBrainstormChat")
  );
}

function ideaBrainstormHostBlock() {
  return providerSrc.slice(
    providerSrc.indexOf("private async runPrefillIdeaBrainstormChat"),
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

test("Ideas Plan posts prefillIdeaPlanningChat from the webview", () => {
  assert.match(webviewClientSrc, /act === 'idea-plan'/);
  assert.match(webviewClientSrc, /type:'prefillIdeaPlanningChat'/);
});

test("Ideas Brainstorm posts prefillIdeaBrainstormChat from the webview", () => {
  assert.match(webviewClientSrc, /act === 'idea-brainstorm'/);
  assert.match(webviewClientSrc, /type:'prefillIdeaBrainstormChat'/);
});

test("Plan card secondary Brainstorm posts prefillIdeaBrainstormChat from the webview", () => {
  assert.match(webviewClientSrc, /act === 'plan-artifact-brainstorm'/);
  assert.match(webviewClientSrc, /submitPlanBrainstorm/);
});

test("Ideas View plan posts viewPlanArtifact from the webview", () => {
  assert.match(webviewClientSrc, /act === 'idea-view-plan'/);
  assert.match(webviewClientSrc, /type:'viewPlanArtifact'/);
});

test("Ideas Plan webview ignores repeat clicks while plan button is busy", () => {
  const block = webviewClientSrc.slice(
    webviewClientSrc.indexOf("function submitIdeaPlan"),
    webviewClientSrc.indexOf("function submitIdeaBrainstorm")
  );
  assert.match(block, /planBtn\.disabled/);
  assert.match(block, /setIdeaRowBusy\(row, true, 'Opening\.\.\.'\)/);
});

test("Ideas Brainstorm webview ignores repeat clicks while brainstorm button is busy", () => {
  const block = webviewClientSrc.slice(
    webviewClientSrc.indexOf("function submitIdeaBrainstorm"),
    webviewClientSrc.indexOf("function submitPlanBrainstorm")
  );
  assert.match(block, /brainstormBtn\.disabled/);
  assert.match(block, /setIdeaRowBusy\(row, true, 'Opening\.\.\.'\)/);
});

test("Ideas Plan host action calls start-idea-planning with policy approval", () => {
  const block = ideaPlanHostBlock();
  assert.match(block, /runMutationWithGenerationRetry\("start-idea-planning"/);
  assert.match(block, /command: "start-idea-planning"/);
  assert.match(block, /clientMutationId: this\.dashboardIdeaPlanMutationId/);
  assert.match(block, /data\.planningChatPrompt/);
  assert.match(block, /prefillCursorChat\(prompt/);
  assert.doesNotMatch(block, /buildPlannerChatPrompt/);
  assert.doesNotMatch(block, /update-idea/);
});

test("Ideas Brainstorm host action calls start-brainstorm-session then prefillCursorChat", () => {
  const block = ideaBrainstormHostBlock();
  assert.match(block, /runMutationWithGenerationRetry\("start-brainstorm-session"/);
  assert.match(block, /command: "start-brainstorm-session"/);
  assert.match(block, /clientMutationId: this\.dashboardIdeaBrainstormMutationId/);
  assert.match(block, /buildBrainstormSessionPrompt/);
  assert.match(block, /prefillCursorChat\(brainstormChatPrompt/);
});

test("Ideas Plan uses stable per-idea clientMutationId for command replay", () => {
  const mutationBlock = providerSrc.slice(
    providerSrc.indexOf("private dashboardIdeaPlanMutationId"),
    providerSrc.indexOf("private dashboardIdeaBrainstormMutationId")
  );
  assert.match(mutationBlock, /dashboard-idea-plan-\$\{ideaId\}/);
  assert.doesNotMatch(mutationBlock, /Date\.now\(\)/);
  assert.doesNotMatch(mutationBlock, /dashboardDrawerMutationId\("dashboard-idea-plan"/);
});

test("Ideas Brainstorm uses stable per-idea clientMutationId for command replay", () => {
  const mutationBlock = providerSrc.slice(
    providerSrc.indexOf("private dashboardIdeaBrainstormMutationId"),
    providerSrc.indexOf("private formatStartBrainstormSessionError")
  );
  assert.match(mutationBlock, /dashboard-idea-brainstorm-/);
  assert.doesNotMatch(mutationBlock, /Date\.now\(\)/);
});

test("Ideas Plan host single-flights concurrent Plan for the same idea", () => {
  const block = providerSrc.slice(
    providerSrc.indexOf("private async onPrefillIdeaPlanningChat"),
    providerSrc.indexOf("private async runPrefillIdeaPlanningChat")
  );
  assert.match(block, /inFlightIdeaPlan\.get\(ideaId\)/);
  assert.match(block, /inFlightIdeaPlan\.set\(ideaId, work\)/);
  assert.match(block, /inFlightIdeaPlan\.delete\(ideaId\)/);
});

test("Ideas Brainstorm host single-flights concurrent Brainstorm for the same idea and planRef", () => {
  const block = providerSrc.slice(
    providerSrc.indexOf("private async onPrefillIdeaBrainstormChat"),
    providerSrc.indexOf("private async runPrefillIdeaBrainstormChat")
  );
  assert.match(block, /inFlightIdeaBrainstorm\.get\(flightKey\)/);
  assert.match(block, /inFlightIdeaBrainstorm\.set\(flightKey, work\)/);
  assert.match(block, /inFlightIdeaBrainstorm\.delete\(flightKey\)/);
});

test("Ideas View plan host opens persisted plan artifact file", () => {
  assert.match(providerSrc, /if \(msg\?\.type === "viewPlanArtifact"\)/);
  assert.match(providerSrc, /private async onViewPlanArtifact/);
  assert.match(providerSrc, /client\.run\("get-plan-artifact"/);
  assert.match(providerSrc, /openTextDocument/);
});

test("resolveDashboardPolicyTierRow maps Ideas brainstorm to start-brainstorm-session", () => {
  const row = tierMod.resolveDashboardPolicyTierRow("ideas", "brainstorm");
  assert.ok(row);
  assert.equal(row.tier, "routine");
  assert.equal(row.command, "start-brainstorm-session");
});

test("resolveDashboardPolicyTierRow maps Ideas plan to start-idea-planning", () => {
  const row = tierMod.resolveDashboardPolicyTierRow("ideas", "plan");
  assert.ok(row);
  assert.equal(row.tier, "routine");
  assert.equal(row.command, "start-idea-planning");
});

test("ideas row renders Brainstorm and Plan buttons for open ideas", () => {
  const openHtml = renderIdeas([
    {
      id: "I001",
      title: "New idea",
      note: "",
      status: "open",
      activeDraftPlanArtifact: "plan-artifact:idea-state-plan",
      activeDraftPlanArtifactSummary: {
        planId: "idea-state-plan",
        planRef: "plan-artifact:idea-state-plan",
        status: "idea",
        version: 1
      }
    }
  ]);
  assert.match(openHtml, /data-wc-action="idea-brainstorm"/);
  assert.match(openHtml, />Brainstorm</);
  assert.match(openHtml, /data-wc-action="idea-plan"/);
  assert.match(openHtml, />Plan</);
  assert.doesNotMatch(openHtml, /Plan this/);
  assert.doesNotMatch(openHtml, /Resume planning/);

  const openWithoutPlanHtml = renderIdeas([{ id: "I001B", title: "No plan ref", note: "", status: "open" }]);
  assert.match(openWithoutPlanHtml, /data-wc-action="idea-brainstorm"[^>]*disabled/);

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
  assert.doesNotMatch(activeHtml, /data-wc-action="idea-brainstorm"/);
});

test("ideas row renders a status chip and Open plan link for draft-ready ideas", () => {
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
  assert.match(html, /wc-plan-lifecycle-chip">Draft</);
  assert.match(html, /data-wc-action="idea-open-plan-card"[^>]*data-plan-id="draft-ready"/);
  assert.doesNotMatch(html, /data-wc-action="plan-artifact-review"/);
  assert.doesNotMatch(html, /data-wc-action="plan-artifact-accept"/);
});

test("ideas row disables Open plan when draft-ready plan identity is missing", () => {
  const html = renderIdeas([
    {
      id: "I003B",
      title: "Draft ready without identity",
      note: "",
      status: "planning",
      planningChatSession: {
        status: "draft_ready",
        ideaId: "I003B",
        currentPlanRef: "plan-artifact:missing-from-summary",
        currentPlanVersion: 1
      }
    }
  ]);
  assert.match(html, /data-wc-action="idea-open-plan-card"[^>]*disabled/);
  assert.match(html, /Plan identity is incomplete\. Refresh the dashboard and try again\./);
});

test("ideas row shows a Needs revision chip and Open plan link (Accept lives on the plan card)", () => {
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
  assert.match(html, /wc-plan-lifecycle-chip">Needs revision</);
  assert.match(html, /data-wc-action="idea-open-plan-card"[^>]*data-plan-id="blocked-review"/);
});

test("ideas row shows an Approval ready chip and Open plan link (Accept lives on the plan card)", () => {
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
  assert.match(html, /wc-plan-lifecycle-chip">Approval ready</);
  assert.match(html, /data-wc-action="idea-open-plan-card"[^>]*data-plan-id="warning-only"/);
});

test("ideas row shows an Accepted chip and Open plan link (Finalize lives on the plan card)", () => {
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
  assert.match(html, /wc-plan-lifecycle-chip">Accepted</);
  assert.match(html, /data-wc-action="idea-open-plan-card"[^>]*data-plan-id="accepted-plan"/);
});

test("ideas row shows Check delivery for accepted-state ideas with planRef", () => {
  const html = renderIdeas([
    {
      id: "I006B",
      title: "Accepted delivery check",
      note: "",
      status: "planned",
      linkedPlanArtifact: "plan-artifact:accepted-delivery",
      linkedPlanArtifactSummary: {
        planId: "accepted-delivery",
        planRef: "plan-artifact:accepted-delivery",
        status: "accepted",
        version: 2,
        phaseKey: "140"
      }
    }
  ]);
  assert.match(html, /data-wc-action="idea-check-delivery"[^>]*data-plan-ref="plan-artifact:accepted-delivery"/);
  assert.match(html, />Check delivery</);
});

test("Ideas Check delivery posts checkIdeaDelivery from the webview", () => {
  assert.match(webviewClientSrc, /act === 'idea-check-delivery'/);
  assert.match(webviewClientSrc, /type:'checkIdeaDelivery'/);
});

test("Ideas Check delivery host action calls check-delivery-status with policy approval", () => {
  assert.match(providerSrc, /if \(msg\?\.type === "checkIdeaDelivery"\)/);
  assert.match(providerSrc, /private async onCheckIdeaDelivery/);
  assert.match(providerSrc, /runMutationWithGenerationRetry\("check-delivery-status"/);
});

test("resolveDashboardPolicyTierRow maps Ideas check-delivery to check-delivery-status", () => {
  const row = tierMod.resolveDashboardPolicyTierRow("ideas", "check-delivery");
  assert.ok(row);
  assert.equal(row.tier, "routine");
  assert.equal(row.command, "check-delivery-status");
});

test("ideas row shows a Finalized chip and Open plan link (View tasks lives on the plan card)", () => {
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
  assert.match(html, /wc-plan-lifecycle-chip">Finalized</);
  assert.match(html, /data-wc-action="idea-open-plan-card"[^>]*data-plan-id="finalized-plan"/);
});

test("plan card renders secondary Brainstorm for post-brainstorming planning state", () => {
  const html = renderDashboardRootInnerHtml({
    ok: true,
    data: {
      stateSummary: {},
      workspaceStatus: {},
      planArtifact: {
        schemaVersion: 1,
        count: 1,
        current: {
          planId: "planning-doc",
          planRef: "plan-artifact:planning-doc",
          version: 3,
          status: "planning",
          title: "In planning",
          sourceIdeaId: "I010",
          updatedAt: "2026-07-02T00:00:00.000Z",
          wbsRowCount: 0,
          openQuestionCount: 0
        },
        recent: []
      }
    }
  });
  assert.match(html, /data-wc-action="plan-artifact-brainstorm"/);
  assert.match(html, /data-plan-ref="plan-artifact:planning-doc"/);
});

test("Open plan click scrolls to and highlights the matching plan card in the webview", () => {
  assert.match(webviewClientSrc, /act === 'idea-open-plan-card'/);
  assert.match(webviewClientSrc, /data-wc-plan-card-id="'\+jumpPlanId/);
  assert.match(webviewClientSrc, /wc-plan-card-highlight/);
});
