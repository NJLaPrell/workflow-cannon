import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { renderDashboardRootInnerHtml } from "../dist/views/dashboard/render-dashboard.js";
import {
  renderBrainstormScorePills,
  renderBrainstormSessionHistory,
  renderBrainstormingIdeasRollupSection
} from "../dist/views/dashboard/render-brainstorming-rollup.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dashboardFixture = JSON.parse(
  readFileSync(
    path.join(__dirname, "../../../fixtures/ideas/dashboard-summary-brainstorming.fixture.json"),
    "utf8"
  )
);

const brainstormingIdeas = dashboardFixture.brainstormingIdeas;

const sampleSessions = [
  {
    sessionId: "bsess-1",
    sessionIndex: 0,
    valueScore: 7.6,
    riskScore: 4.7,
    effortScore: 7.8,
    confidenceScore: 6.95,
    priorityScore: 61
  },
  {
    sessionId: "bsess-2",
    sessionIndex: 1,
    valueScore: 8.1,
    riskScore: 4.2,
    effortScore: 7.2,
    confidenceScore: 7.1,
    priorityScore: 64
  }
];

test("renderBrainstormScorePills renders all five synthesized scores", () => {
  const html = renderBrainstormScorePills(dashboardFixture.ideasTopPlanSummary.brainstormSynthesis);
  assert.match(html, /Value/);
  assert.match(html, /7\.6/);
  assert.match(html, /Risk/);
  assert.match(html, /4\.7/);
  assert.match(html, /Effort/);
  assert.match(html, /7\.8/);
  assert.match(html, /Confidence/);
  assert.match(html, /6\.95|7\.0/);
  assert.match(html, /Priority/);
  assert.match(html, />61</);
});

test("renderBrainstormingIdeasRollupSection renders brainstorming-state ideas with scores", () => {
  const html = renderBrainstormingIdeasRollupSection(brainstormingIdeas);
  assert.match(html, /Brainstorming/);
  assert.match(html, /Unified IdeaPlan document/);
  assert.match(html, /I005/);
  assert.match(html, /7\.6/);
  assert.match(html, /61/);
  assert.match(html, /Continue Brainstorming/);
  assert.match(html, /Operator action: finish brainstorming and start planning/);
  assert.equal((html.match(/wc-brainstorming-idea-row/g) ?? []).length, brainstormingIdeas.count);
});

test("renderBrainstormSessionHistory renders per-session and synthesized rows", () => {
  const html = renderBrainstormSessionHistory({
    sessions: sampleSessions,
    synthesis: {
      valueScore: 7.9,
      riskScore: 4.4,
      effortScore: 7.5,
      confidenceScore: 7.0,
      priorityScore: 63,
      sessionCount: 2
    },
    detailKey: "test-brainstorm-history"
  });
  assert.match(html, /Session 1/);
  assert.match(html, /Session 2/);
  assert.match(html, /Synthesized/);
  assert.match(html, /7\.9/);
  assert.match(html, /data-wc-ui-state-key="test-brainstorm-history"/);
});

test("renderDashboardRootInnerHtml shows Brainstorming rollup instead of New plan bucket label", () => {
  const html = renderDashboardRootInnerHtml({
    ok: true,
    data: {
      stateSummary: { ready: 0, proposed: 0, blocked: 0, completed: 0 },
      readyImprovementsSummary: { schemaVersion: 1, count: 0, top: [], phaseBuckets: [] },
      readyExecutionSummary: { schemaVersion: 1, count: 0, top: [], phaseBuckets: [] },
      proposedImprovementsSummary: { schemaVersion: 1, count: 0, top: [], phaseBuckets: [] },
      proposedExecutionSummary: { schemaVersion: 1, count: 0, top: [], phaseBuckets: [] },
      blockedSummary: { count: 0, top: [], phaseBuckets: [] },
      transcriptChurnResearchSummary: { schemaVersion: 1, count: 0, top: [], phaseBuckets: [] },
      completedSummary: { schemaVersion: 1, count: 0, top: [], phaseBuckets: [] },
      cancelledSummary: { schemaVersion: 1, count: 0, top: [], phaseBuckets: [] },
      wishlist: { schemaVersion: 1, openCount: 0, totalCount: 0, openTop: [] },
      workspaceStatus: { currentKitPhase: "140" },
      brainstormingIdeas,
      planArtifact: {
        schemaVersion: 1,
        count: 1,
        current: {
          planId: "plan-123",
          planRef: "plan-artifact:plan-123",
          version: 1,
          status: "draft",
          title: "Draft plan",
          planningType: "new-feature",
          updatedAt: "2026-07-02T10:00:00.000Z",
          wbsRowCount: 0,
          openQuestionCount: 0
        },
        recent: []
      }
    }
  }, null, null, null, null, { ideasUnifiedModelEnabled: true });
  assert.match(html, /wc-brainstorming-ideas-section/);
  assert.match(html, /Unified IdeaPlan document/);
  assert.doesNotMatch(html, /<summary>New \(/);
});
