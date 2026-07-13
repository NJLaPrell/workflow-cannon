import assert from "node:assert/strict";
import { mkdir, mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { planningModule } from "../dist/index.js";
import { getPlanningChatSession } from "../dist/modules/planning/idea-plan/planning-chat-session.js";
import { SqliteDualPlanningStore } from "../dist/modules/task-engine/persistence/sqlite-dual-planning.js";

const SQLITE_CFG = { tasks: { persistenceBackend: "sqlite" } };

async function tmpWorkspace() {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "update-idea-planning-session-"));
  await mkdir(path.join(workspace, ".workspace-kit", "tasks"), { recursive: true });
  const dual = new SqliteDualPlanningStore(workspace, ".workspace-kit/tasks/workspace-kit.db");
  dual.loadFromDisk();
  return { workspace, dual };
}

function ctx(workspace) {
  return { runtimeVersion: "0.1", workspacePath: workspace, effectiveConfig: SQLITE_CFG };
}

function policyApproval() {
  return { confirmed: true, rationale: "test update-idea-planning-session" };
}

async function planningGeneration(workspace) {
  return (await planningModule.onCommand({ name: "list-ideas", args: {} }, ctx(workspace))).data.planningGeneration;
}

async function createOpenIdea(workspace, title = "Session idea") {
  const created = await planningModule.onCommand(
    { name: "create-idea", args: { title, policyApproval: policyApproval() } },
    ctx(workspace)
  );
  assert.equal(created.ok, true);
  return created.data.idea;
}

async function startPlanning(workspace, ideaId) {
  const out = await planningModule.onCommand(
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
  assert.equal(out.ok, true);
  return out;
}

async function runUpdate(workspace, args) {
  return planningModule.onCommand(
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

test("update-idea-planning-session rejects missing session", async () => {
  const { workspace } = await tmpWorkspace();
  const idea = await createOpenIdea(workspace);
  const out = await runUpdate(workspace, {
    ideaId: idea.id,
    sessionId: "pcs-missing",
    status: "draft_ready"
  });
  assert.equal(out.ok, false);
  assert.equal(out.code, "planning-session-not-found");
  assert.match(out.message, /start-idea-planning/);
});

test("update-idea-planning-session rejects mismatched sessionId", async () => {
  const { workspace } = await tmpWorkspace();
  const idea = await createOpenIdea(workspace);
  const started = await startPlanning(workspace, idea.id);
  const out = await runUpdate(workspace, {
    ideaId: idea.id,
    sessionId: "pcs-wrong-id",
    status: "draft_ready"
  });
  assert.equal(out.ok, false);
  assert.equal(out.code, "planning-session-mismatch");
  assert.equal(out.data.expectedSessionId, started.data.planningChatSession.sessionId);
});

test("update-idea-planning-session updates status, summary, plan ref, and version", async () => {
  const { workspace, dual } = await tmpWorkspace();
  const idea = await createOpenIdea(workspace);
  const started = await startPlanning(workspace, idea.id);
  const sessionId = started.data.planningChatSession.sessionId;

  const out = await runUpdate(workspace, {
    ideaId: idea.id,
    sessionId,
    status: "draft_ready",
    currentPlanRef: "plan-artifact:my-plan",
    currentPlanVersion: 2,
    summary: "Draft saved with WBS"
  });
  assert.equal(out.ok, true);
  assert.equal(out.code, "idea-planning-session-updated");
  assert.equal(out.data.planningChatSession.status, "draft_ready");
  assert.equal(out.data.planningChatSession.currentPlanRef, "plan-artifact:my-plan");
  assert.equal(out.data.planningChatSession.currentPlanVersion, 2);
  assert.equal(out.data.planningChatSession.summary, "Draft saved with WBS");

  const stored = getPlanningChatSession(dual.getDatabase(), idea.id);
  assert.equal(stored?.status, "draft_ready");
  assert.equal(stored?.currentPlanRef, "plan-artifact:my-plan");
  assert.equal(stored?.currentPlanVersion, 2);
});

test("update-idea-planning-session supports state transitions through approval_ready to completed", async () => {
  const { workspace } = await tmpWorkspace();
  const idea = await createOpenIdea(workspace);
  const started = await startPlanning(workspace, idea.id);
  const sessionId = started.data.planningChatSession.sessionId;

  assert.equal((await runUpdate(workspace, { ideaId: idea.id, sessionId, status: "draft_ready", currentPlanRef: "plan-artifact:plan-a", currentPlanVersion: 1 })).ok, true);
  assert.equal((await runUpdate(workspace, { ideaId: idea.id, sessionId, status: "needs_revision", summary: "Blockers found" })).data.planningChatSession.status, "needs_revision");
  assert.equal((await runUpdate(workspace, { ideaId: idea.id, sessionId, status: "approval_ready" })).ok, true);

  const completed = await runUpdate(workspace, { ideaId: idea.id, sessionId, status: "completed" });
  assert.equal(completed.ok, true);
  assert.equal(completed.data.planningChatSession.status, "completed");
  assert.equal(typeof completed.data.planningChatSession.completedAt, "string");
});

test("update-idea-planning-session rejects invalid transition from completed", async () => {
  const { workspace } = await tmpWorkspace();
  const idea = await createOpenIdea(workspace);
  const started = await startPlanning(workspace, idea.id);
  const sessionId = started.data.planningChatSession.sessionId;

  await runUpdate(workspace, { ideaId: idea.id, sessionId, status: "draft_ready", currentPlanRef: "plan-artifact:plan-a", currentPlanVersion: 1 });
  await runUpdate(workspace, { ideaId: idea.id, sessionId, status: "approval_ready" });
  await runUpdate(workspace, { ideaId: idea.id, sessionId, status: "completed" });

  const blocked = await runUpdate(workspace, { ideaId: idea.id, sessionId, status: "draft_ready" });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.code, "planning-session-transition-invalid");
});

test("update-idea-planning-session replays repeated clientMutationId", async () => {
  const { workspace } = await tmpWorkspace();
  const idea = await createOpenIdea(workspace);
  const started = await startPlanning(workspace, idea.id);
  const sessionId = started.data.planningChatSession.sessionId;

  const first = await runUpdate(workspace, {
    ideaId: idea.id,
    sessionId,
    status: "draft_ready",
    currentPlanRef: "plan-artifact:idem-plan",
    currentPlanVersion: 1,
    clientMutationId: "session-update-1"
  });
  const second = await runUpdate(workspace, {
    ideaId: idea.id,
    sessionId,
    status: "draft_ready",
    currentPlanRef: "plan-artifact:idem-plan",
    currentPlanVersion: 1,
    clientMutationId: "session-update-1"
  });
  assert.equal(second.code, "idea-planning-session-idempotent-replay");
  assert.equal(second.data.replayed, true);
  assert.deepEqual(second.data.planningChatSession, first.data.planningChatSession);
});

test("update-idea-planning-session rejects conflicting clientMutationId payload", async () => {
  const { workspace } = await tmpWorkspace();
  const idea = await createOpenIdea(workspace);
  const started = await startPlanning(workspace, idea.id);
  const sessionId = started.data.planningChatSession.sessionId;

  await runUpdate(workspace, {
    ideaId: idea.id,
    sessionId,
    status: "draft_ready",
    currentPlanRef: "plan-artifact:plan-a",
    currentPlanVersion: 1,
    clientMutationId: "shared-update"
  });

  const conflict = await runUpdate(workspace, {
    ideaId: idea.id,
    sessionId,
    status: "needs_revision",
    clientMutationId: "shared-update"
  });
  assert.equal(conflict.ok, false);
  assert.equal(conflict.code, "idempotency-key-conflict");
});
