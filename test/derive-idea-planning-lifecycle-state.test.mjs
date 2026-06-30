import test from "node:test";
import assert from "node:assert/strict";

import { deriveIdeaPlanningLifecycleState } from "../dist/modules/ideas/derive-idea-planning-lifecycle-state.js";

function baseIdea(overrides = {}) {
  return {
    id: "I001",
    title: "Idea",
    status: "open",
    previousPlanArtifacts: [],
    createdAt: "2026-06-30T00:00:00.000Z",
    updatedAt: "2026-06-30T00:00:00.000Z",
    ...overrides
  };
}

test("deriveIdeaPlanningLifecycleState returns open for a fresh idea", () => {
  assert.equal(deriveIdeaPlanningLifecycleState({ idea: baseIdea() }), "open");
});

test("deriveIdeaPlanningLifecycleState returns planning for active session or planning idea", () => {
  assert.equal(
    deriveIdeaPlanningLifecycleState({
      idea: baseIdea(),
      planningChatSession: { status: "active" }
    }),
    "planning"
  );

  assert.equal(
    deriveIdeaPlanningLifecycleState({
      idea: baseIdea({ status: "planning" })
    }),
    "planning"
  );
});

test("deriveIdeaPlanningLifecycleState prefers active draft over session", () => {
  assert.equal(
    deriveIdeaPlanningLifecycleState({
      idea: baseIdea({ status: "planning" }),
      planningChatSession: { status: "active" },
      activeDraftPlanArtifact: { planRef: "plan-artifact:draft-1", status: "draft" }
    }),
    "draft_ready"
  );
});

test("deriveIdeaPlanningLifecycleState maps review blockers to needs_revision", () => {
  assert.equal(
    deriveIdeaPlanningLifecycleState({
      idea: baseIdea({ status: "planning" }),
      activeDraftPlanArtifact: { planRef: "plan-artifact:draft-2", status: "reviewed" },
      latestReview: {
        planRef: "plan-artifact:draft-2",
        passed: false,
        blockerCount: 1,
        warningCount: 0,
        openQuestionCount: 0
      }
    }),
    "needs_revision"
  );
});

test("deriveIdeaPlanningLifecycleState maps passed review to approval_ready", () => {
  assert.equal(
    deriveIdeaPlanningLifecycleState({
      idea: baseIdea({ status: "planning" }),
      activeDraftPlanArtifact: { planRef: "plan-artifact:draft-3", status: "reviewed" },
      latestReview: {
        planRef: "plan-artifact:draft-3",
        passed: true,
        blockerCount: 0,
        warningCount: 2,
        openQuestionCount: 1
      }
    }),
    "approval_ready"
  );
});

test("deriveIdeaPlanningLifecycleState ignores stale review for another draft", () => {
  assert.equal(
    deriveIdeaPlanningLifecycleState({
      idea: baseIdea({ status: "planning" }),
      activeDraftPlanArtifact: { planRef: "plan-artifact:draft-new", status: "draft" },
      latestReview: {
        planRef: "plan-artifact:draft-old",
        passed: false,
        blockerCount: 2,
        warningCount: 0,
        openQuestionCount: 0
      }
    }),
    "draft_ready"
  );
});

test("deriveIdeaPlanningLifecycleState prefers accepted linked plan over review, draft, session, and raw idea", () => {
  assert.equal(
    deriveIdeaPlanningLifecycleState({
      idea: baseIdea({ status: "planning", linkedPlanArtifact: "plan-artifact:accepted-1" }),
      planningChatSession: { status: "needs_revision", currentPlanRef: "plan-artifact:draft-4" },
      linkedPlanArtifact: { planRef: "plan-artifact:accepted-1", status: "accepted" },
      activeDraftPlanArtifact: { planRef: "plan-artifact:draft-4", status: "reviewed" },
      latestReview: {
        planRef: "plan-artifact:draft-4",
        passed: false,
        blockerCount: 3,
        warningCount: 0,
        openQuestionCount: 0
      }
    }),
    "accepted"
  );
});

test("deriveIdeaPlanningLifecycleState treats completed session with currentPlanRef as accepted fallback", () => {
  assert.equal(
    deriveIdeaPlanningLifecycleState({
      idea: baseIdea({ status: "planning" }),
      planningChatSession: {
        status: "completed",
        currentPlanRef: "plan-artifact:accepted-2",
        completedAt: "2026-06-30T12:00:00.000Z"
      }
    }),
    "accepted"
  );
});

test("deriveIdeaPlanningLifecycleState prefers finalized result over accepted plan", () => {
  assert.equal(
    deriveIdeaPlanningLifecycleState({
      idea: baseIdea({ status: "planned", linkedPlanArtifact: "plan-artifact:accepted-3" }),
      linkedPlanArtifact: { planRef: "plan-artifact:accepted-3", status: "accepted" },
      finalizeResult: {
        dryRun: false,
        status: "finalized",
        count: 4,
        createdTasks: [{ id: "T1" }]
      }
    }),
    "finalized"
  );
});

test("deriveIdeaPlanningLifecycleState returns superseded when that is the strongest remaining signal", () => {
  assert.equal(
    deriveIdeaPlanningLifecycleState({
      idea: baseIdea({ status: "planning" }),
      planningChatSession: { status: "superseded" }
    }),
    "superseded"
  );
});

test("deriveIdeaPlanningLifecycleState treats empty refs and missing signals as open", () => {
  assert.equal(
    deriveIdeaPlanningLifecycleState({
      idea: baseIdea({ status: "open", linkedPlanArtifact: "" }),
      planningChatSession: { status: "completed", currentPlanRef: "" },
      linkedPlanArtifact: { planRef: "", status: "" },
      activeDraftPlanArtifact: "",
      latestReview: null,
      finalizeResult: { dryRun: true, count: 2, createdTasks: [{ id: "T2" }] }
    }),
    "open"
  );
});
