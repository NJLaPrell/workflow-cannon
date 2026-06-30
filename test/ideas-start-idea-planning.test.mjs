import assert from "node:assert/strict";
import { mkdir, mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { ideasModule } from "../dist/index.js";
import { SqliteDualPlanningStore } from "../dist/modules/task-engine/persistence/sqlite-dual-planning.js";

const SQLITE_CFG = { tasks: { persistenceBackend: "sqlite" } };

async function tmpWorkspace() {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "ideas-start-planning-"));
  await mkdir(path.join(workspace, ".workspace-kit", "tasks"), { recursive: true });
  const dual = new SqliteDualPlanningStore(workspace, ".workspace-kit/tasks/workspace-kit.db");
  dual.loadFromDisk();
  return workspace;
}

function ctx(workspace) {
  return { runtimeVersion: "0.1", workspacePath: workspace, effectiveConfig: SQLITE_CFG };
}

test("start-idea-planning returns idea-not-found for missing idea", async () => {
  const workspace = await tmpWorkspace();
  const result = await ideasModule.onCommand(
    { name: "start-idea-planning", args: { ideaId: "I999" } },
    ctx(workspace)
  );

  assert.equal(result.ok, false);
  assert.equal(result.code, "idea-not-found");
});

test("start-idea-planning starts open idea and returns prompt plus lineage", async () => {
  const workspace = await tmpWorkspace();
  const created = await ideasModule.onCommand(
    {
      name: "create-idea",
      args: {
        title: "Ship planner chat",
        note: "Keep it small.",
        linkedPlanArtifact: "plan-artifact:accepted-plan",
        previousPlanArtifacts: ["plan-artifact:old-plan"]
      }
    },
    ctx(workspace)
  );

  const started = await ideasModule.onCommand(
    { name: "start-idea-planning", args: { ideaId: created.data.idea.id } },
    ctx(workspace)
  );

  assert.equal(started.ok, true);
  assert.equal(started.code, "idea-planning-started");
  assert.equal(started.data.ideaId, created.data.idea.id);
  assert.equal(started.data.status, "planning");
  assert.equal(started.data.mode, "started");
  assert.match(started.data.planningChatPrompt, /Ship planner chat/);
  assert.match(started.data.planningChatPrompt, /planner-chat\.md/);
  assert.match(started.data.planningChatPrompt, /sourceIdeaId=I001/);
  assert.equal(started.data.linkedPlanArtifact, "plan-artifact:accepted-plan");
  assert.deepEqual(started.data.previousPlanArtifacts, ["plan-artifact:old-plan"]);
  assert.equal(started.data.activeDraftPlanArtifact, undefined);
  assert.equal(started.data.planningChatSession.status, "active");
  assert.equal(started.data.planningChatSession.sessionId, "pcs-I001");
  assert.equal(started.data.planningChatSession.resumePrompt, started.data.planningChatPrompt);
  assert.equal(started.data.responseSchemaVersion, 1);

  const idea = await ideasModule.onCommand(
    { name: "get-idea", args: { ideaId: created.data.idea.id } },
    ctx(workspace)
  );
  assert.equal(idea.data.idea.status, "planning");
});

test("start-idea-planning resumes active session without duplicate session", async () => {
  const workspace = await tmpWorkspace();
  const created = await ideasModule.onCommand(
    { name: "create-idea", args: { title: "Resume me" } },
    ctx(workspace)
  );

  const first = await ideasModule.onCommand(
    { name: "start-idea-planning", args: { ideaId: created.data.idea.id } },
    ctx(workspace)
  );
  const second = await ideasModule.onCommand(
    { name: "start-idea-planning", args: { ideaId: created.data.idea.id } },
    ctx(workspace)
  );

  assert.equal(first.data.mode, "started");
  assert.equal(second.ok, true);
  assert.equal(second.code, "idea-planning-resumed");
  assert.equal(second.data.mode, "resumed");
  assert.equal(second.data.planningChatSession.sessionId, first.data.planningChatSession.sessionId);
  assert.equal(second.data.planningChatSession.startedAt, first.data.planningChatSession.startedAt);
  assert.match(second.data.planningChatPrompt, /Resume the existing planning session/);
});

test("start-idea-planning replays clientMutationId without duplicate mutation", async () => {
  const workspace = await tmpWorkspace();
  const created = await ideasModule.onCommand(
    { name: "create-idea", args: { title: "Idempotent start" } },
    ctx(workspace)
  );

  const first = await ideasModule.onCommand(
    {
      name: "start-idea-planning",
      args: { ideaId: created.data.idea.id, clientMutationId: "start-I001-once" }
    },
    ctx(workspace)
  );
  const replay = await ideasModule.onCommand(
    {
      name: "start-idea-planning",
      args: { ideaId: created.data.idea.id, clientMutationId: "start-I001-once" }
    },
    ctx(workspace)
  );

  assert.equal(first.ok, true);
  assert.equal(first.code, "idea-planning-started");
  assert.equal(replay.ok, true);
  assert.equal(replay.code, "start-idea-planning-idempotent-replay");
  assert.equal(replay.data.replayed, true);
  assert.equal(replay.data.planningChatSession.sessionId, first.data.planningChatSession.sessionId);
  assert.deepEqual(replay.data.planningChatPrompt, first.data.planningChatPrompt);
});

test("start-idea-planning rejects clientMutationId reuse for different idea", async () => {
  const workspace = await tmpWorkspace();
  const firstIdea = await ideasModule.onCommand(
    { name: "create-idea", args: { title: "First" } },
    ctx(workspace)
  );
  const secondIdea = await ideasModule.onCommand(
    { name: "create-idea", args: { title: "Second" } },
    ctx(workspace)
  );

  await ideasModule.onCommand(
    {
      name: "start-idea-planning",
      args: { ideaId: firstIdea.data.idea.id, clientMutationId: "shared-key" }
    },
    ctx(workspace)
  );
  const conflict = await ideasModule.onCommand(
    {
      name: "start-idea-planning",
      args: { ideaId: secondIdea.data.idea.id, clientMutationId: "shared-key" }
    },
    ctx(workspace)
  );

  assert.equal(conflict.ok, false);
  assert.equal(conflict.code, "idempotency-key-conflict");
});
