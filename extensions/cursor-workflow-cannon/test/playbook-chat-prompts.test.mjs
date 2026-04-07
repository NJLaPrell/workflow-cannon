import test from "node:test";
import assert from "node:assert/strict";
import {
  GENERATE_FEATURES_SLASH_TEXT,
  RESEARCH_CHURN_SLASH_TEXT,
  buildCollaborationProfilesHubPrompt,
  buildGenerateFeaturesPrompt,
  buildImprovementTriagePrompt,
  buildPlanningInterviewPrompt,
  buildTaskToPhaseBranchPrompt,
  buildTranscriptChurnResearchPrompt
} from "../dist/playbook-chat-prompts.js";

test("GENERATE_FEATURES_SLASH_TEXT is the generate-features slash token", () => {
  assert.equal(GENERATE_FEATURES_SLASH_TEXT, "/generate-features");
});

test("RESEARCH_CHURN_SLASH_TEXT is the research-churn slash token", () => {
  assert.equal(RESEARCH_CHURN_SLASH_TEXT, "/research-churn");
});

test("buildTranscriptChurnResearchPrompt references playbook, slash, and synthesize command", () => {
  const p = buildTranscriptChurnResearchPrompt();
  assert.match(p, /transcript-churn-research\.md/);
  assert.match(p, /synthesize-transcript-churn/);
  assert.match(p, /\/research-churn/);
  assert.doesNotMatch(p, /research-church/);
});

test("buildTranscriptChurnResearchPrompt focuses task id when provided", () => {
  const p = buildTranscriptChurnResearchPrompt({ taskId: "T404" });
  assert.match(p, /\*\*T404\*\*/);
  assert.match(p, /get-task/);
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
  assert.match(p, /pnpm exec wk run list-planning-types/);
  assert.match(p, /pnpm exec wk run build-plan/);
  assert.match(p, /list-wishlist/);
  assert.match(p, /New Plan/);
});

test("buildCollaborationProfilesHubPrompt references slash hub, sync command, and policy", () => {
  const p = buildCollaborationProfilesHubPrompt();
  assert.match(p, /\/collaboration-profiles/);
  assert.match(p, /sync-effective-behavior-cursor-rule/);
  assert.match(p, /policyApproval/);
});
