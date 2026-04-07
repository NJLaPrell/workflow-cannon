import test from "node:test";
import assert from "node:assert/strict";
import {
  GENERATE_FEATURES_SLASH_TEXT,
  buildGenerateFeaturesPrompt,
  buildImprovementTriagePrompt,
  buildPlanningInterviewPrompt,
  buildTaskToPhaseBranchPrompt
} from "../dist/playbook-chat-prompts.js";

test("GENERATE_FEATURES_SLASH_TEXT is the generate-features slash token", () => {
  assert.equal(GENERATE_FEATURES_SLASH_TEXT, "/generate-features");
});

test("buildGenerateFeaturesPrompt references slash and wishlist intake playbook", () => {
  const p = buildGenerateFeaturesPrompt();
  assert.match(p, /\/generate-features/);
  assert.match(p, /\.ai\/playbooks\/wishlist-intake-to-execution\.md/);
});

test("buildImprovementTriagePrompt references playbook id and path", () => {
  const p = buildImprovementTriagePrompt();
  assert.match(p, /improvement-triage-top-three\.md/);
  assert.match(p, /improvement-triage-top-three/);
  assert.match(p, /\/process-proposed-improvements/);
});

test("buildImprovementTriagePrompt focuses task id when provided", () => {
  const p = buildImprovementTriagePrompt({ taskId: "imp-deadbeef" });
  assert.match(p, /\*\*imp-deadbeef\*\*/);
  assert.match(p, /get-task/);
});

test("buildTaskToPhaseBranchPrompt references task-to-phase-branch playbook id and path", () => {
  const p = buildTaskToPhaseBranchPrompt();
  assert.match(p, /task-to-phase-branch\.md/);
  assert.match(p, /task-to-phase-branch/);
  assert.match(p, /clicked \*\*Deliver\*\*/);
});

test("buildTaskToPhaseBranchPrompt focuses execution task id when provided", () => {
  const p = buildTaskToPhaseBranchPrompt({ taskId: "T999" });
  assert.match(p, /\*\*T999\*\*/);
});

test("buildTaskToPhaseBranchPrompt includes kit phase when provided", () => {
  const p = buildTaskToPhaseBranchPrompt({ kitPhase: "64" });
  assert.match(p, /\*\*64\*\*/);
  assert.match(p, /release\/phase-64/);
});

test("buildPlanningInterviewPrompt references planning runbook and build-plan", () => {
  const p = buildPlanningInterviewPrompt();
  assert.match(p, /planning-workflow\.md/);
  assert.match(p, /list-planning-types/);
  assert.match(p, /New Plan/);
});
