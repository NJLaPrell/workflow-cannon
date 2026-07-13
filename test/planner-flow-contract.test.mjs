/**
 * T100864 — merge contract gate: IdeaPlan golden-path lifecycle on dual-registration shim (T100863).
 * Re-run mandatory after WBS-7 (T100822 list-ideas MCP) and WBS-10 (T100825 finalize-preview-packet MCP).
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import { mkdir, mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { ideasModule } from "../dist/index.js";
import { writeIdeaPlanArtifactVersion } from "../dist/modules/ideas/idea-plan-artifact-storage.js";
import {
  getPlanningChatSession,
  persistPlanningChatSession,
  updatePlanningChatSession
} from "../dist/modules/ideas/planning-chat-session.js";
import { SqliteDualPlanningStore } from "../dist/modules/task-engine/persistence/sqlite-dual-planning.js";

const root = path.resolve(import.meta.dirname, "..");
const brainstormingFixture = JSON.parse(
  fs.readFileSync(path.join(root, "fixtures/ideas/brainstorming-state.fixture.json"), "utf8")
);
const planningFixture = JSON.parse(
  fs.readFileSync(path.join(root, "fixtures/ideas/planning-state.fixture.json"), "utf8")
);
const firstRunFixture = JSON.parse(
  fs.readFileSync(path.join(root, "fixtures/ideas/empty-inventory-first-run.fixture.json"), "utf8")
);

const SQLITE_CFG = { tasks: { persistenceBackend: "sqlite" } };

/** Frozen operator command names + success/error codes for dual-shim contract gate. */
const FROZEN_COMMAND_CODES = {
  "list-ideas": "ideas-listed",
  "get-planner-flow-status": "planner-flow-status",
  "create-idea": "idea-created",
  "start-idea-planning": "idea-planning-started",
  "update-idea-planning-session": "idea-planning-session-updated"
};

async function tmpWorkspace() {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "planner-flow-contract-"));
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
  return { confirmed: true, rationale: "test planner-flow-contract" };
}

async function planningGeneration(workspace) {
  return (await ideasModule.onCommand({ name: "list-ideas", args: {} }, ctx(workspace))).data.planningGeneration;
}

async function createIdea(workspace, title = "Planner flow contract idea") {
  const created = await ideasModule.onCommand(
    {
      name: "create-idea",
      args: {
        title,
        expectedPlanningGeneration: await planningGeneration(workspace),
        policyApproval: policyApproval()
      }
    },
    ctx(workspace)
  );
  assert.equal(created.ok, true, created.message);
  return created.data.idea;
}

async function startPlanning(workspace, ideaId) {
  const out = await ideasModule.onCommand(
    {
      name: "start-idea-planning",
      args: {
        ideaId,
        expectedPlanningGeneration: await planningGeneration(workspace),
        policyApproval: policyApproval()
      }
    },
    ctx(workspace)
  );
  assert.equal(out.ok, true, out.message);
  return out;
}

async function runSessionUpdate(workspace, args) {
  return ideasModule.onCommand(
    {
      name: "update-idea-planning-session",
      args: {
        expectedPlanningGeneration: await planningGeneration(workspace),
        policyApproval: policyApproval(),
        ...args
      }
    },
    ctx(workspace)
  );
}

async function runFlowStatus(workspace, args = {}) {
  return ideasModule.onCommand({ name: "get-planner-flow-status", args }, ctx(workspace));
}

async function runListIdeas(workspace, args = {}) {
  return ideasModule.onCommand({ name: "list-ideas", args }, ctx(workspace));
}

function writeDocument(workspace, idea, fixture, statusOverride) {
  writeIdeaPlanArtifactVersion(workspace, {
    ...fixture,
    ideaId: idea.id,
    planRef: idea.linkedPlanArtifact,
    planId: idea.linkedPlanArtifact.replace("plan-artifact:", ""),
    ...(statusOverride ? { status: statusOverride } : {})
  });
}

test("fresh dual-shim workspace: list-ideas returns frozen empty-inventory contract", async () => {
  const { workspace } = await tmpWorkspace();
  const listed = await runListIdeas(workspace);

  assert.equal(listed.ok, true, listed.message);
  assert.equal(listed.code, FROZEN_COMMAND_CODES["list-ideas"]);
  assert.equal(listed.code, firstRunFixture.listIdeas.code);
  assert.deepEqual(listed.data.ideas, firstRunFixture.listIdeas.emptyInventory.ideas);
  assert.equal(listed.data.count, firstRunFixture.listIdeas.emptyInventory.count);
  assert.equal(typeof listed.data.planningGeneration, "number");
});

test("fresh dual-shim workspace: get-planner-flow-status returns frozen first-run contract", async () => {
  const { workspace } = await tmpWorkspace();
  const out = await runFlowStatus(workspace);

  assert.equal(out.ok, true, out.message);
  assert.equal(out.code, FROZEN_COMMAND_CODES["get-planner-flow-status"]);
  assert.equal(out.code, firstRunFixture.plannerFlowStatus.code);
  assert.equal(out.data.goldenPathStage, firstRunFixture.plannerFlowStatus.firstRun.goldenPathStage);
  assert.equal(out.data.ideaCount, firstRunFixture.plannerFlowStatus.firstRun.ideaCount);
  assert.ok(out.data.blockers.some((b) => b.code === firstRunFixture.plannerFlowStatus.firstRun.blockerCode));
  assert.equal(
    out.data.recommendedNextCommand.command,
    firstRunFixture.plannerFlowStatus.firstRun.recommendedNextCommand
  );
});

test("golden-path mutations keep frozen command codes on dual-shim dispatcher", async () => {
  const { workspace } = await tmpWorkspace();
  const created = await ideasModule.onCommand(
    {
      name: "create-idea",
      args: {
        title: "Frozen code contract idea",
        expectedPlanningGeneration: await planningGeneration(workspace),
        policyApproval: policyApproval()
      }
    },
    ctx(workspace)
  );
  assert.equal(created.ok, true, created.message);
  assert.equal(created.code, FROZEN_COMMAND_CODES["create-idea"]);

  const started = await startPlanning(workspace, created.data.idea.id);
  assert.equal(started.ok, true, started.message);
  assert.equal(started.code, FROZEN_COMMAND_CODES["start-idea-planning"]);
});

test("brainstorming and planning document statuses are distinct golden-path stages", async () => {
  const { workspace } = await tmpWorkspace();
  const idea = await createIdea(workspace);

  writeDocument(workspace, idea, brainstormingFixture, "brainstorming");
  const brainstorming = await runFlowStatus(workspace, { ideaId: idea.id });
  assert.equal(brainstorming.ok, true);
  assert.equal(brainstorming.data.documentStatus, "brainstorming");
  assert.equal(brainstorming.data.goldenPathStage, "brainstorming");
  assert.notEqual(brainstorming.data.goldenPathStage, "planning");

  writeDocument(workspace, idea, planningFixture, "planning");
  const planning = await runFlowStatus(workspace, { ideaId: idea.id });
  assert.equal(planning.ok, true);
  assert.equal(planning.data.documentStatus, "planning");
  assert.equal(planning.data.goldenPathStage, "planning");
  assert.notEqual(planning.data.documentStatus, "brainstorming");
});

test("draft_ready session status is not lifecycle completion (completed)", async () => {
  const { workspace } = await tmpWorkspace();
  const idea = await createIdea(workspace);
  const started = await startPlanning(workspace, idea.id);
  const sessionId = started.data.planningChatSession.sessionId;

  const draftReady = await runSessionUpdate(workspace, {
    ideaId: idea.id,
    sessionId,
    status: "draft_ready",
    currentPlanRef: idea.linkedPlanArtifact,
    currentPlanVersion: 1
  });
  assert.equal(draftReady.ok, true);
  assert.equal(draftReady.data.planningChatSession.status, "draft_ready");
  assert.notEqual(draftReady.data.planningChatSession.status, "completed");
  assert.equal(draftReady.data.planningChatSession.completedAt, undefined);

  const jumpToCompleted = await runSessionUpdate(workspace, {
    ideaId: idea.id,
    sessionId,
    status: "completed"
  });
  assert.equal(jumpToCompleted.ok, false);
  assert.equal(jumpToCompleted.code, "planning-session-transition-invalid");
  assert.equal(jumpToCompleted.data.fromStatus, "draft_ready");
  assert.equal(jumpToCompleted.data.toStatus, "completed");
});

test("update-idea-planning-session rejects illegal active to completed transition", async () => {
  const { workspace } = await tmpWorkspace();
  const idea = await createIdea(workspace);
  const started = await startPlanning(workspace, idea.id);
  const sessionId = started.data.planningChatSession.sessionId;

  const blocked = await runSessionUpdate(workspace, {
    ideaId: idea.id,
    sessionId,
    status: "completed"
  });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.code, "planning-session-transition-invalid");
  assert.match(blocked.message, /active.*completed/);
  assert.equal(blocked.data.fromStatus, "active");
  assert.equal(blocked.data.toStatus, "completed");
});

test("get-planner-flow-status reports brainstorming document vs planning session mismatches", async () => {
  const { workspace, dual } = await tmpWorkspace();
  const idea = await createIdea(workspace);
  writeDocument(workspace, idea, brainstormingFixture, "brainstorming");

  const started = persistPlanningChatSession(
    dual.getDatabase(),
    { ideaId: idea.id, title: idea.title },
    new Date().toISOString()
  );
  updatePlanningChatSession(
    dual.getDatabase(),
    { ideaId: idea.id, sessionId: started.sessionId, status: "draft_ready" },
    new Date().toISOString()
  );

  const out = await runFlowStatus(workspace, { ideaId: idea.id });
  assert.equal(out.ok, true);
  assert.equal(out.data.documentStatus, "brainstorming");
  assert.equal(out.data.sessionStatus, "draft_ready");
  assert.ok(
    out.data.mismatches.some((entry) => entry.code === "session-draft-ready-document-brainstorming"),
    "expected draft_ready session vs brainstorming document mismatch"
  );
  assert.ok(
    out.data.mismatches.some((entry) => entry.code === "session-document-status-mismatch"),
    "expected planning-session vs brainstorming-document mismatch"
  );
});

test("get-planner-flow-status reports completed session while document still planning", async () => {
  const { workspace, dual } = await tmpWorkspace();
  const idea = await createIdea(workspace);
  writeDocument(workspace, idea, planningFixture, "planning");

  const started = persistPlanningChatSession(
    dual.getDatabase(),
    { ideaId: idea.id, title: idea.title },
    new Date().toISOString()
  );
  updatePlanningChatSession(
    dual.getDatabase(),
    { ideaId: idea.id, sessionId: started.sessionId, status: "draft_ready" },
    new Date().toISOString()
  );
  updatePlanningChatSession(
    dual.getDatabase(),
    { ideaId: idea.id, sessionId: started.sessionId, status: "approval_ready" },
    new Date().toISOString()
  );
  updatePlanningChatSession(
    dual.getDatabase(),
    { ideaId: idea.id, sessionId: started.sessionId, status: "completed" },
    new Date().toISOString()
  );

  const out = await runFlowStatus(workspace, { ideaId: idea.id });
  assert.equal(out.ok, true);
  assert.equal(out.data.documentStatus, "planning");
  assert.equal(out.data.sessionStatus, "completed");
  assert.ok(
    out.data.mismatches.some((entry) => entry.code === "session-completed-document-planning"),
    "expected completed session vs planning document mismatch"
  );
  assert.ok(
    out.data.mismatches.some((entry) => entry.code === "session-completed-document-not-accepted"),
    "expected completed session before document acceptance mismatch"
  );
});

test("start-idea-planning aligns Ideas row, IdeaPlan document, and planning session surfaces", async () => {
  const { workspace, dual } = await tmpWorkspace();
  const idea = await createIdea(workspace);
  writeDocument(workspace, idea, brainstormingFixture, "brainstorming");

  const started = await startPlanning(workspace, idea.id);
  assert.equal(started.code, FROZEN_COMMAND_CODES["start-idea-planning"]);
  const ideaRow = (
    await ideasModule.onCommand({ name: "get-idea", args: { ideaId: idea.id } }, ctx(workspace))
  ).data.idea;
  const session = getPlanningChatSession(dual.getDatabase(), idea.id);

  assert.equal(ideaRow.status, "planning");
  assert.equal(started.data.status, "planning");
  assert.equal(started.data.planningChatSession.status, "active");
  assert.equal(session?.status, "active");

  const flow = await runFlowStatus(workspace, { ideaId: idea.id });
  assert.equal(flow.ok, true);
  assert.equal(flow.data.documentStatus, "planning");
  assert.equal(flow.data.sessionStatus, "active");
  assert.equal(flow.data.goldenPathStage, "planning");
  assert.equal(flow.data.mismatches.length, 0);
});
