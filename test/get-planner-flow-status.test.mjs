import assert from "node:assert/strict";
import { mkdir, mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { ideasModule } from "../dist/index.js";
import { writeIdeaPlanArtifactVersion } from "../dist/modules/ideas/idea-plan-artifact-storage.js";
import { persistPlanningChatSession, updatePlanningChatSession } from "../dist/modules/ideas/planning-chat-session.js";
import { SqliteDualPlanningStore } from "../dist/modules/task-engine/persistence/sqlite-dual-planning.js";

const SQLITE_CFG = { tasks: { persistenceBackend: "sqlite" } };

async function tmpWorkspace() {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "get-planner-flow-status-"));
  await mkdir(path.join(workspace, ".workspace-kit", "tasks"), { recursive: true });
  await mkdir(path.join(workspace, ".workspace-kit", "planning", "plan-artifacts"), { recursive: true });
  const dual = new SqliteDualPlanningStore(workspace, ".workspace-kit/tasks/workspace-kit.db");
  dual.loadFromDisk();
  return { workspace, dual };
}

function ctx(workspace) {
  return { runtimeVersion: "0.1", workspacePath: workspace, effectiveConfig: SQLITE_CFG };
}

function policyApproval() {
  return { confirmed: true, rationale: "test get-planner-flow-status" };
}

async function planningGeneration(workspace) {
  const listed = await ideasModule.onCommand({ name: "list-ideas", args: {} }, ctx(workspace));
  return listed.data.planningGeneration;
}

async function createIdea(workspace, title = "Planner flow idea") {
  const gen = await planningGeneration(workspace);
  const created = await ideasModule.onCommand(
    {
      name: "create-idea",
      args: { title, expectedPlanningGeneration: gen, policyApproval: policyApproval() }
    },
    ctx(workspace)
  );
  assert.equal(created.ok, true, created.message);
  return created.data.idea;
}

async function runFlowStatus(workspace, args = {}) {
  return ideasModule.onCommand({ name: "get-planner-flow-status", args }, ctx(workspace));
}

test("get-planner-flow-status recommends start-brainstorm-session for a fresh idea document", async () => {
  const { workspace } = await tmpWorkspace();
  const idea = await createIdea(workspace);

  const out = await runFlowStatus(workspace, { ideaId: idea.id });
  assert.equal(out.ok, true);
  assert.equal(out.data.goldenPathStage, "idea");
  assert.equal(out.data.ideaId, idea.id);
  assert.equal(out.data.documentStatus, "idea");
  assert.equal(out.data.recommendedNextCommand.command, "start-brainstorm-session");
  assert.equal(out.data.recommendedNextCommand.readyRun.args.planRef, idea.linkedPlanArtifact);
});

test("get-planner-flow-status reports brainstorming stage and incomplete brainstorm blocker", async () => {
  const { workspace } = await tmpWorkspace();
  const idea = await createIdea(workspace);
  const existing = await ideasModule.onCommand({ name: "get-idea", args: { ideaId: idea.id } }, ctx(workspace));
  const document = existing.data.ideaPlan;
  writeIdeaPlanArtifactVersion(workspace, {
    ...document,
    status: "brainstorming",
    brainstorm: { sessions: [] }
  });

  const out = await runFlowStatus(workspace, { ideaId: idea.id });
  assert.equal(out.ok, true);
  assert.equal(out.data.goldenPathStage, "brainstorming");
  assert.ok(out.data.blockers.some((b) => b.code === "brainstorm-incomplete"));
  assert.equal(out.data.recommendedNextCommand.command, "update-brainstorm-session");
});

test("get-planner-flow-status reports session-document mismatch for draft_ready session during brainstorming", async () => {
  const { workspace, dual } = await tmpWorkspace();
  const idea = await createIdea(workspace);
  const existing = await ideasModule.onCommand({ name: "get-idea", args: { ideaId: idea.id } }, ctx(workspace));
  writeIdeaPlanArtifactVersion(workspace, {
    ...existing.data.ideaPlan,
    status: "brainstorming",
    brainstorm: { sessions: [] }
  });
  const started = persistPlanningChatSession(
    dual.getDatabase(),
    { ideaId: idea.id, title: idea.title },
    new Date().toISOString()
  );
  const session = updatePlanningChatSession(
    dual.getDatabase(),
    { ideaId: idea.id, sessionId: started.sessionId, status: "draft_ready" },
    new Date().toISOString()
  );
  assert.ok(session);

  const out = await runFlowStatus(workspace, { ideaId: idea.id });
  assert.equal(out.ok, true);
  assert.ok(out.data.mismatches.some((b) => b.code === "session-draft-ready-document-brainstorming"));
});

test("get-planner-flow-status recommends accepted follow-on for reviewed document", async () => {
  const { workspace } = await tmpWorkspace();
  const idea = await createIdea(workspace);
  const planRef = idea.linkedPlanArtifact;
  writeIdeaPlanArtifactVersion(workspace, {
    schemaVersion: 1,
    planId: planRef.replace("plan-artifact:", ""),
    version: 2,
    planRef,
    status: "reviewed",
    ideaId: idea.id,
    createdAt: "2026-07-08T09:00:00.000Z",
    updatedAt: "2026-07-08T10:00:00.000Z",
    review: { passed: true, blockerCount: 0, openQuestionCount: 0, warningCount: 0, reviewedAt: "2026-07-08T10:00:00.000Z" }
  });

  const out = await runFlowStatus(workspace, { ideaId: idea.id });
  assert.equal(out.ok, true);
  assert.equal(out.data.goldenPathStage, "reviewed");
  assert.equal(out.data.recommendedNextCommand.command, "accept-plan-artifact");
});

test("get-planner-flow-status returns idea-not-found for unknown ideaId", async () => {
  const { workspace } = await tmpWorkspace();
  await createIdea(workspace);
  const out = await runFlowStatus(workspace, { ideaId: "I999" });
  assert.equal(out.ok, false);
  assert.equal(out.code, "idea-not-found");
});
