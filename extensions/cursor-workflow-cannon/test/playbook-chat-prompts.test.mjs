import test from "node:test";
import assert from "node:assert/strict";
import {
  buildImprovementTriagePrompt,
  buildTaskToPhaseBranchPrompt
} from "../dist/playbook-chat-prompts.js";

test("buildImprovementTriagePrompt references playbook id and path", () => {
  const p = buildImprovementTriagePrompt();
  assert.match(p, /improvement-triage-top-three\.md/);
  assert.match(p, /improvement-triage-top-three/);
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
