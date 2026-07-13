import assert from "node:assert/strict";
import test from "node:test";

import {
  buildIdeaPlanningPrompt,
  formatPlanLineageSummary
} from "../dist/modules/planning/idea-plan/build-idea-planning-prompt.js";

function assertPromptBasics(prompt) {
  assert.match(prompt, /planner-chat/);
  assert.match(prompt, /\.ai\/playbooks\/planner-chat\.md/);
  assert.match(prompt, /accepted PlanArtifact with complete WBS/);
  assert.match(prompt, /command-layer transitions/);
  assert.doesNotMatch(prompt, /pnpm exec wk run/);
  assert.doesNotMatch(prompt, /workspace-kit run start-idea-planning/);
}

test("buildIdeaPlanningPrompt with no plan lineage", () => {
  const prompt = buildIdeaPlanningPrompt({
    ideaId: "I001",
    title: "Fresh spark",
    note: "Start from scratch.",
    planningSessionId: "pcs-test-1"
  });

  assertPromptBasics(prompt);
  assert.match(prompt, /Source idea id: \*\*I001\*\*/);
  assert.match(prompt, /Fresh spark/);
  assert.match(prompt, /Start from scratch\./);
  assert.match(prompt, /\*\*pcs-test-1\*\*/);
  assert.match(prompt, /Plan lineage: none yet/);
});

test("buildIdeaPlanningPrompt with active draft plan", () => {
  const prompt = buildIdeaPlanningPrompt({
    ideaId: "I002",
    title: "Draft in progress",
    activeDraftPlanArtifact: "plan-artifact:draft-plan",
    planningSessionId: "pcs-test-2"
  });

  assertPromptBasics(prompt);
  assert.match(prompt, /active draft \*\*plan-artifact:draft-plan\*\*/);
  assert.doesNotMatch(prompt, /Plan lineage: none yet/);
});

test("buildIdeaPlanningPrompt with linked accepted plan", () => {
  const prompt = buildIdeaPlanningPrompt({
    ideaId: "I003",
    title: "Accepted plan linked",
    linkedPlanArtifact: "plan-artifact:accepted-plan"
  });

  assertPromptBasics(prompt);
  assert.match(prompt, /accepted \*\*plan-artifact:accepted-plan\*\*/);
});

test("buildIdeaPlanningPrompt with previous plan artifacts", () => {
  const prompt = buildIdeaPlanningPrompt({
    ideaId: "I004",
    title: "Replan",
    previousPlanArtifacts: ["plan-artifact:old-plan", "plan-artifact:older-plan"]
  });

  assertPromptBasics(prompt);
  assert.match(prompt, /2 prior artifacts/);
  assert.match(prompt, /\*\*plan-artifact:old-plan\*\*/);
  assert.match(prompt, /\*\*plan-artifact:older-plan\*\*/);
});

test("buildIdeaPlanningPrompt with full lineage and active session summary", () => {
  const prompt = buildIdeaPlanningPrompt({
    ideaId: "I005",
    title: "Full context",
    linkedPlanArtifact: "plan-artifact:accepted-plan",
    activeDraftPlanArtifact: "plan-artifact:draft-plan",
    previousPlanArtifacts: ["plan-artifact:old-plan"],
    planningSessionId: "pcs-resume-99"
  });

  assertPromptBasics(prompt);
  assert.match(prompt, /Source idea id: \*\*I005\*\*/);
  assert.match(prompt, /Planning session: \*\*pcs-resume-99\*\* \(active\)\./);
  assert.match(prompt, /accepted \*\*plan-artifact:accepted-plan\*\*/);
  assert.match(prompt, /active draft \*\*plan-artifact:draft-plan\*\*/);
  assert.match(prompt, /1 prior artifact: \*\*plan-artifact:old-plan\*\*/);
});

test("buildIdeaPlanningPrompt includes brainstorm digest when provided", () => {
  const prompt = buildIdeaPlanningPrompt({
    ideaId: "I009",
    title: "Guided brainstorming",
    brainstormDigest: "## Feature ideas\n- Seed plan from ideation"
  });
  assert.match(prompt, /Brainstorm digest:/);
  assert.match(prompt, /Seed plan from ideation/);
});

test("formatPlanLineageSummary returns compact none-yet message", () => {
  assert.match(formatPlanLineageSummary({}), /none yet/);
});
