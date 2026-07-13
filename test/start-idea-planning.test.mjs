import assert from "node:assert/strict";
import { mkdir, mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { planningModule } from "../dist/index.js";
import { buildIdeaPlanningPrompt } from "../dist/modules/planning/idea-plan/build-idea-planning-prompt.js";
import { writeActiveDraftPlanArtifact } from "../dist/modules/planning/idea-plan/idea-planning-metadata.js";
import { getPlanningChatSession, persistPlanningChatSession } from "../dist/modules/planning/idea-plan/planning-chat-session.js";
import { SqliteDualPlanningStore } from "../dist/modules/task-engine/persistence/sqlite-dual-planning.js";

const SQLITE_CFG = { tasks: { persistenceBackend: "sqlite" } };

async function tmpWorkspace() {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "start-idea-planning-"));
  await mkdir(path.join(workspace, ".workspace-kit", "tasks"), { recursive: true });
  const dual = new SqliteDualPlanningStore(workspace, ".workspace-kit/tasks/workspace-kit.db");
  dual.loadFromDisk();
  return { workspace, dual };
}

function ctx(workspace) {
  return { runtimeVersion: "0.1", workspacePath: workspace, effectiveConfig: SQLITE_CFG };
}

function policyApproval() {
  return { confirmed: true, rationale: "test start-idea-planning" };
}

async function createOpenIdea(workspace, title = "Plan this idea") {
  const created = await planningModule.onCommand(
    { name: "create-idea", args: { title, policyApproval: policyApproval() } },
    ctx(workspace)
  );
  assert.equal(created.ok, true);
  return created.data.idea;
}

async function runStart(workspace, args) {
  const planningGeneration =
    (await planningModule.onCommand({ name: "list-ideas", args: {} }, ctx(workspace))).data.planningGeneration;
  return planningModule.onCommand(
    {
      name: "start-idea-planning",
      args: {
        expectedPlanningGeneration: planningGeneration,
        policyApproval: policyApproval(),
        ...args
      }
    },
    ctx(workspace)
  );
}

test("buildIdeaPlanningPrompt includes lineage and playbook pointers", () => {
  const prompt = buildIdeaPlanningPrompt({
    ideaId: "I001",
    title: "Try planner chat",
    note: "Keep it small.",
    linkedPlanArtifact: "plan-artifact:accepted-plan",
    activeDraftPlanArtifact: "plan-artifact:draft-plan",
    previousPlanArtifacts: ["plan-artifact:old-plan"],
    planningSessionId: "pcs-fixture-1"
  });
  assert.match(prompt, /I001/);
  assert.match(prompt, /Try planner chat/);
  assert.match(prompt, /accepted-plan/);
  assert.match(prompt, /draft-plan/);
  assert.match(prompt, /old-plan/);
  assert.match(prompt, /planner-chat/);
  assert.match(prompt, /pcs-fixture-1/);
  assert.doesNotMatch(prompt, /pnpm exec wk run/);
});

test("start-idea-planning returns actionable error for missing idea", async () => {
  const { workspace } = await tmpWorkspace();
  const out = await runStart(workspace, { ideaId: "I999" });
  assert.equal(out.ok, false);
  assert.equal(out.code, "idea-not-found");
  assert.match(out.message, /I999/);
  assert.match(out.message, /create-idea|list-ideas/);
});

test("start-idea-planning starts open idea and returns compact prompt", async () => {
  const { workspace } = await tmpWorkspace();
  const idea = await createOpenIdea(workspace, "Open spark");

  const out = await runStart(workspace, { ideaId: idea.id });
  assert.equal(out.ok, true);
  assert.equal(out.code, "idea-planning-started");
  assert.equal(out.data.mode, "started");
  assert.equal(out.data.ideaId, idea.id);
  assert.equal(out.data.status, "planning");
  assert.equal(typeof out.data.planningChatPrompt, "string");
  assert.match(out.data.planningChatPrompt, /Open spark/);
  assert.match(out.data.planningChatPrompt, /Planning session:/);
  assert.match(out.data.planningChatPrompt, new RegExp(out.data.planningChatSession.sessionId));
  assert.equal(out.data.planningChatSession.status, "active");
  assert.equal(typeof out.data.planningChatSession.sessionId, "string");
  assert.deepEqual(out.data.previousPlanArtifacts, []);

  const retrieved = await planningModule.onCommand({ name: "get-idea", args: { ideaId: idea.id } }, ctx(workspace));
  assert.equal(retrieved.data.idea.status, "planning");
});

test("start-idea-planning includes linked, active draft, and previous plan data", async () => {
  const { workspace, dual } = await tmpWorkspace();
  const created = await planningModule.onCommand(
    {
      name: "create-idea",
      args: {
        title: "Lineage idea",
        linkedPlanArtifact: "plan-artifact:accepted-plan",
        previousPlanArtifacts: ["plan-artifact:old-plan"],
        policyApproval: policyApproval()
      }
    },
    ctx(workspace)
  );
  const idea = created.data.idea;
  const db = dual.getDatabase();
  writeActiveDraftPlanArtifact(db, idea.id, "plan-artifact:draft-plan", new Date().toISOString());

  const out = await runStart(workspace, { ideaId: idea.id });
  assert.equal(out.ok, true);
  assert.equal(out.data.linkedPlanArtifact, "plan-artifact:accepted-plan");
  assert.equal(out.data.activeDraftPlanArtifact, "plan-artifact:draft-plan");
  assert.deepEqual(out.data.previousPlanArtifacts, ["plan-artifact:old-plan"]);
  assert.match(out.data.planningChatPrompt, /accepted-plan/);
  assert.match(out.data.planningChatPrompt, /draft-plan/);
});

test("start-idea-planning resumes active session instead of creating another", async () => {
  const { workspace, dual } = await tmpWorkspace();
  const idea = await createOpenIdea(workspace, "Resume me");
  const db = dual.getDatabase();
  const nowIso = new Date().toISOString();
  persistPlanningChatSession(
    db,
    {
      ideaId: idea.id,
      title: idea.title,
      resumePrompt: "Existing resume prompt for I001"
    },
    nowIso
  );

  const out = await runStart(workspace, { ideaId: idea.id });
  assert.equal(out.ok, true);
  assert.equal(out.code, "idea-planning-resumed");
  assert.equal(out.data.mode, "resumed");
  assert.equal(out.data.planningChatPrompt, "Existing resume prompt for I001");

  const session = getPlanningChatSession(db, idea.id);
  assert.equal(session?.resumePrompt, "Existing resume prompt for I001");
});

test("start-idea-planning replays repeated clientMutationId", async () => {
  const { workspace } = await tmpWorkspace();
  const idea = await createOpenIdea(workspace, "Idempotent");

  const first = await runStart(workspace, { ideaId: idea.id, clientMutationId: "plan-click-1" });
  assert.equal(first.ok, true);
  assert.equal(first.code, "idea-planning-started");

  const second = await runStart(workspace, { ideaId: idea.id, clientMutationId: "plan-click-1" });
  assert.equal(second.ok, true);
  assert.equal(second.code, "idea-planning-idempotent-replay");
  assert.equal(second.data.replayed, true);
  assert.equal(second.data.mode, first.data.mode);
  assert.equal(second.data.planningChatPrompt, first.data.planningChatPrompt);
  assert.equal(second.data.planningChatSession.sessionId, first.data.planningChatSession.sessionId);
});

test("start-idea-planning rejects conflicting clientMutationId payload", async () => {
  const { workspace } = await tmpWorkspace();
  const firstIdea = await createOpenIdea(workspace, "First");
  const secondIdea = await createOpenIdea(workspace, "Second");

  const first = await runStart(workspace, { ideaId: firstIdea.id, clientMutationId: "shared-click" });
  assert.equal(first.ok, true);

  const conflict = await runStart(workspace, { ideaId: secondIdea.id, clientMutationId: "shared-click" });
  assert.equal(conflict.ok, false);
  assert.equal(conflict.code, "idempotency-key-conflict");
});

test("start-idea-planning works with ideaId only", async () => {
  const { workspace } = await tmpWorkspace();
  const idea = await createOpenIdea(workspace, "Minimal args");
  const out = await runStart(workspace, { ideaId: idea.id });
  assert.equal(out.ok, true);
  assert.equal(out.data.ideaId, idea.id);
  assert.equal(typeof out.data.planningChatPrompt, "string");
});
