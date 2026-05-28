import test from "node:test";
import assert from "node:assert/strict";

import { buildPlannerChatPrompt } from "../dist/planner-chat-prompt.js";
import { renderDashboardRootInnerHtml } from "../dist/views/dashboard/render-dashboard.js";

const RAW_CLI_INVOCATION = /(?:pnpm\s+exec\s+wk|workspace-kit)\s+run\s+[a-z][\w-]+\s+[`'"]\{/i;

function summaryWithPlan(status) {
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
            planningChatSession: {
              ideaId: "I-plan-1",
              status: "active",
              title: "Ship a dashboard planning loop",
              updatedAt: "2026-05-28T00:00:00.000Z"
            }
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
          openQuestionCount: 0
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
  assert.match(draftHtml, />Resume planning &rarr;<\/button>/);
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