import test from "node:test";
import assert from "node:assert/strict";

import { buildPlannerChatPrompt } from "../dist/planner-chat-prompt.js";
import { renderDashboardRootInnerHtml } from "../dist/views/dashboard/render-dashboard.js";

const RAW_CLI_INVOCATION = /(?:pnpm\s+exec\s+wk|workspace-kit)\s+run\s+[a-z][\w-]+\s+[`'"]\{/i;

function summaryWithPlan(status, options = {}) {
  const planningChatSession = options.planningChatSession === undefined
    ? {
        ideaId: "I-plan-1",
        status: "active",
        title: "Ship a dashboard planning loop",
        updatedAt: "2026-05-28T00:00:00.000Z"
      }
    : options.planningChatSession;
  return {
    ok: true,
    data: {
      stateSummary: {},
      workspaceStatus: { phase: "116", nextPhase: "117" },
      ideas: {
        schemaVersion: 1,
        available: true,
        totalCount: 1,
        openCount: 0,
        planningCount: 1,
        plannedCount: 0,
        top: [
          {
            id: "I-plan-1",
            title: "Ship a dashboard planning loop",
            status: "planning",
            note: "PlanArtifact happy path",
            previousPlanArtifacts: [],
            ...(planningChatSession ? { planningChatSession } : {})
          }
        ]
      },
      planArtifact: {
        schemaVersion: 1,
        count: 1,
        current: {
          planId: "plan-116-happy",
          planRef: "plan-artifact:plan-116-happy",
          version: 2,
          status,
          title: "Dashboard planning loop",
          planningType: "feature",
          updatedAt: "2026-05-28T00:00:00.000Z",
          wbsRowCount: 3,
          openQuestionCount: 0,
          ...(options.current ?? {})
        },
        recent: []
      }
    }
  };
}

test("PlanArtifact dashboard happy path stays UI-driven without raw CLI prompts", () => {
  const draftHtml = renderDashboardRootInnerHtml(summaryWithPlan("draft"));
  assert.match(draftHtml, /data-wc-action="plan-artifact-review"/);
  assert.match(draftHtml, />Review<\/button>/);
  assert.match(draftHtml, />Resume planning<\/button>/);
  assert.doesNotMatch(draftHtml, RAW_CLI_INVOCATION);

  const reviewedHtml = renderDashboardRootInnerHtml(summaryWithPlan("reviewed"));
  assert.match(reviewedHtml, /data-wc-action="plan-artifact-accept"/);
  assert.match(reviewedHtml, /data-plan-ref="plan-artifact:plan-116-happy"/);
  assert.doesNotMatch(reviewedHtml, /data-wc-action="plan-artifact-accept"[^>]* disabled/);
  assert.doesNotMatch(reviewedHtml, RAW_CLI_INVOCATION);

  const acceptedHtml = renderDashboardRootInnerHtml(summaryWithPlan("accepted"));
  assert.match(acceptedHtml, /data-wc-action="plan-artifact-finalize"/);
  assert.match(acceptedHtml, />Finalize<\/button>/);
  assert.doesNotMatch(acceptedHtml, RAW_CLI_INVOCATION);
});

test("planner-chat prefill prompt avoids copy-paste wk run invocations", () => {
  const prompt = buildPlannerChatPrompt({
    ideaId: "I-plan-1",
    title: "Ship a dashboard planning loop",
    note: "PlanArtifact happy path"
  });

  assert.match(prompt, /planner-chat/);
  assert.match(prompt, /provenance\.sourceIdeaId/);
  assert.doesNotMatch(prompt, RAW_CLI_INVOCATION);
});

test("PlanArtifact rejection routes needs-revision plans back to Resume planning instead of a disabled Accept", () => {
  const html = renderDashboardRootInnerHtml(
    summaryWithPlan("reviewed", {
      current: {
        blockerCount: 1,
        reviewSummary: "Acceptance criteria are not tied to WBS tasks."
      }
    })
  );

  assert.match(html, /Review summary/);
  assert.match(html, /Acceptance criteria are not tied to WBS tasks\./);
  assert.match(html, /wc-plan-card-chip-danger[^>]*>1 blocker</);
  assert.match(html, /wc-plan-status-pill wc-plan-status-warn">Needs revision</);
  // With blockers outstanding the plan card offers no Accept action at all (rather than a disabled one) —
  // the only path forward is resuming planning to resolve the review findings.
  assert.doesNotMatch(html, /data-wc-action="plan-artifact-accept"/);
  assert.doesNotMatch(html, /data-wc-action="plan-artifact-finalize"/);
  assert.match(html, />Resume planning<\/button>/);
  assert.doesNotMatch(html, RAW_CLI_INVOCATION);
});

test("Ideas row resume requires the matching active planning-chat session", () => {
  const inactiveHtml = renderDashboardRootInnerHtml(
    summaryWithPlan("draft", {
      planningChatSession: {
        ideaId: "I-plan-1",
        status: "closed",
        title: "Ship a dashboard planning loop",
        updatedAt: "2026-05-28T00:00:00.000Z"
      }
    })
  );
  assert.match(inactiveHtml, />Plan this<\/button>/);
  assert.doesNotMatch(inactiveHtml, />Resume planning &rarr;<\/button>/);

  const mismatchedHtml = renderDashboardRootInnerHtml(
    summaryWithPlan("draft", {
      planningChatSession: {
        ideaId: "I-other",
        status: "active",
        title: "Different idea",
        updatedAt: "2026-05-28T00:00:00.000Z"
      }
    })
  );
  assert.match(mismatchedHtml, />Plan this<\/button>/);
  assert.doesNotMatch(mismatchedHtml, />Resume planning &rarr;<\/button>/);
});
