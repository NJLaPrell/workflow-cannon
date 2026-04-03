import test from "node:test";
import assert from "node:assert/strict";
import {
  buildImprovementTriagePrompt,
  buildTaskToMainPrompt
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

test("buildTaskToMainPrompt references task-to-main playbook id and path", () => {
  const p = buildTaskToMainPrompt();
  assert.match(p, /task-to-main\.md/);
  assert.match(p, /task-to-main/);
});

test("buildTaskToMainPrompt focuses execution task id when provided", () => {
  const p = buildTaskToMainPrompt({ taskId: "T999" });
  assert.match(p, /\*\*T999\*\*/);
});
