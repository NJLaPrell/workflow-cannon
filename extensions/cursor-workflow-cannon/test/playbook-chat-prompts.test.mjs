import test from "node:test";
import assert from "node:assert/strict";
import {
  GENERATE_FEATURES_SLASH_TEXT,
  buildCollaborationProfilesHubPrompt,
  buildGenerateFeaturesPrompt,
  buildImprovementTriagePrompt,
  buildPhaseNotesDiscoveryPrompt,
  buildPlanningInterviewPrompt,
  buildPlanningInterviewResumePrompt,
  buildPlannerChatPrompt,
  buildTaskToPhaseBranchPrompt,
  buildTranscriptChurnResearchPrompt
} from "../dist/playbook-chat-prompts.js";

test("GENERATE_FEATURES_SLASH_TEXT is the generate-features slash token", () => {
  assert.equal(GENERATE_FEATURES_SLASH_TEXT, "/generate-features");
});

test("buildTranscriptChurnResearchPrompt references playbook and synthesize command", () => {
  const p = buildTranscriptChurnResearchPrompt();
  assert.match(p, /transcript-churn-research\.md/);
  assert.match(p, /synthesize-transcript-churn/);
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

test("buildPlannerChatPrompt references planner-chat playbook and provenance", () => {
  const p = buildPlannerChatPrompt();
  assert.match(p, /planner-chat/);
  assert.match(p, /\.ai\/playbooks\/planner-chat\.md/);
  assert.match(p, /sourceIdeaId/);
  assert.match(p, /previousPlanArtifacts/);
});

test("buildPlannerChatPrompt includes idea context when provided", () => {
  const p = buildPlannerChatPrompt({
    ideaId: "I42",
    title: "Better planner flow",
    note: "Ask one decision at a time.",
    previousPlanArtifacts: ["plan-artifact:old-1"]
  });
  assert.match(p, /\*\*I42\*\*/);
  assert.match(p, /\*\*Better planner flow\*\*/);
  assert.match(p, /Ask one decision at a time\./);
  assert.match(p, /\*\*plan-artifact:old-1\*\*/);
});

test("buildImprovementTriagePrompt references playbook id and path", () => {
  const p = buildImprovementTriagePrompt();
  assert.match(p, /improvement-triage-top-three\.md/);
  assert.match(p, /improvement-triage-top-three/);
  assert.match(p, /dashboard proposed-improvements flow/);
});

test("buildImprovementTriagePrompt focuses task id when provided", () => {
  const p = buildImprovementTriagePrompt({ taskId: "imp-deadbeef" });
  assert.match(p, /\*\*imp-deadbeef\*\*/);
  assert.match(p, /get-task/);
});

test("buildTaskToPhaseBranchPrompt references task-to-phase-branch playbook id and path", () => {
  const p = buildTaskToPhaseBranchPrompt();
  assert.match(p, /\.ai\/playbooks\/task-to-phase-branch\.md/);
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
  assert.match(p, /\.ai\/POLICY-APPROVAL\.md/);
});

test("buildPhaseNotesDiscoveryPrompt references phase journal commands and policy", () => {
  const p = buildPhaseNotesDiscoveryPrompt();
  assert.match(p, /list-phase-notes/);
  assert.match(p, /get-phase-context/);
  assert.match(p, /add-phase-note/);
  assert.match(p, /convert-phase-note-to-task/);
  assert.match(p, /policyApproval/);
});

test("buildPlanningInterviewPrompt references planning runbook and build-plan", () => {
  const p = buildPlanningInterviewPrompt();
  assert.match(p, /planning-workflow\.md/);
  assert.match(p, /pnpm exec wk run list-planning-types/);
  assert.match(p, /pnpm exec wk run build-plan/);
  assert.match(p, /list-wishlist/);
  assert.match(p, /Start Interview/);
});

test("buildPlanningInterviewResumePrompt embeds saved resume command", () => {
  const p = buildPlanningInterviewResumePrompt(
    `workspace-kit run build-plan '{"planningType":"change","answers":{},"finalize":false}'`
  );
  assert.match(p, /Resume the in-progress/);
  assert.match(p, /workspace-kit run build-plan/);
  assert.match(p, /planning-workflow\.md/);
});

test("buildCollaborationProfilesHubPrompt references user chat entrypoints, sync command, and policy", () => {
  const p = buildCollaborationProfilesHubPrompt();
  assert.match(p, /\/onboarding/);
  assert.match(p, /\/behavior-interview/);
  assert.match(p, /sync-effective-behavior-cursor-rule/);
  assert.match(p, /policyApproval/);
});
