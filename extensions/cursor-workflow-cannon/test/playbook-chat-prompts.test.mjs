import test from "node:test";
import assert from "node:assert/strict";
import {
  buildGenerateFeaturesPrompt,
  buildImprovementTriagePrompt,
  buildTaskToPhaseBranchPrompt
} from "../dist/playbook-chat-prompts.js";

test("buildGenerateFeaturesPrompt references slash and wishlist intake playbook", () => {
  const p = buildGenerateFeaturesPrompt();
  assert.match(p, /\/generate-features/);
  assert.match(p, /wishlist-intake-to-execution\.md/);
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
});

test("buildTaskToPhaseBranchPrompt focuses execution task id when provided", () => {
  const p = buildTaskToPhaseBranchPrompt({ taskId: "T999" });
  assert.match(p, /\*\*T999\*\*/);
});
