import assert from "node:assert/strict";
import fs from "node:fs";
import { mkdir, mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { planningModule, taskEngineModule } from "../dist/index.js";
import { applyBrainstormSectionSynthesis } from "../dist/modules/planning/brainstorm/brainstorm-section-synthesis.js";
import { writeIdeaPlanArtifactVersion } from "../dist/modules/planning/idea-plan/idea-plan-artifact-storage.js";
import { mapBrainstormSynthesisForDashboard } from "../dist/modules/task-engine/dashboard/build-dashboard-brainstorm-synthesis.js";
import { SqliteDualPlanningStore } from "../dist/modules/task-engine/persistence/sqlite-dual-planning.js";

const root = path.resolve(import.meta.dirname, "..");
const sessionFixture = JSON.parse(
  fs.readFileSync(path.join(root, "fixtures/ideas/brainstorming-session.fixture.json"), "utf8")
);
const brainstormingFixture = JSON.parse(
  fs.readFileSync(path.join(root, "fixtures/ideas/brainstorming-state.fixture.json"), "utf8")
);
const dashboardFixture = JSON.parse(
  fs.readFileSync(path.join(root, "fixtures/ideas/dashboard-summary-brainstorming.fixture.json"), "utf8")
);

const SQLITE_CFG = { tasks: { persistenceBackend: "sqlite" } };

async function tmpWorkspace() {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "dashboard-brainstorming-"));
  await mkdir(path.join(workspace, ".workspace-kit", "tasks"), { recursive: true });
  await mkdir(path.join(workspace, ".workspace-kit", "planning", "plan-artifacts"), { recursive: true });
  const dual = new SqliteDualPlanningStore(workspace, ".workspace-kit/tasks/workspace-kit.db");
  dual.loadFromDisk();
  return { workspace, dual };
}

function ctx(workspace) {
  return { runtimeVersion: "0.1", workspacePath: workspace, effectiveConfig: SQLITE_CFG };
}

function sqliteTaskEngineCtx(workspace) {
  return {
    runtimeVersion: "0.1",
    workspacePath: workspace,
    effectiveConfig: SQLITE_CFG
  };
}

function policyApproval() {
  return { confirmed: true, rationale: "test dashboard brainstorming rollup" };
}

function seedBrainstormingDocument(workspace, ideaId) {
  const brainstorm = applyBrainstormSectionSynthesis({
    sessions: [{ ...sessionFixture }],
    activeSessionId: sessionFixture.sessionId
  });
  const document = {
    ...brainstormingFixture,
    ideaId,
    brainstorm
  };
  writeIdeaPlanArtifactVersion(workspace, document);
  return document;
}

test("mapBrainstormSynthesisForDashboard exposes score fields and sessionCount", () => {
  const mapped = mapBrainstormSynthesisForDashboard({
    sessions: [{ ...sessionFixture }],
    synthesis: sessionFixture.scores
  });
  assert.deepEqual(mapped, dashboardFixture.ideasTopPlanSummary.brainstormSynthesis);
});

test("dashboard-summary includes brainstormSynthesis on idea plan summaries for brainstorming state", async () => {
  const { workspace } = await tmpWorkspace();
  const created = await planningModule.onCommand(
    {
      name: "create-idea",
      args: {
        title: "Unified IdeaPlan document",
        linkedPlanArtifact: brainstormingFixture.planRef,
        policyApproval: policyApproval()
      }
    },
    ctx(workspace)
  );
  assert.equal(created.ok, true, created.message);
  seedBrainstormingDocument(workspace, created.data.idea.id);

  const summary = await taskEngineModule.onCommand({ name: "dashboard-summary", args: {} }, sqliteTaskEngineCtx(workspace));
  assert.equal(summary.ok, true, summary.message);

  const ideaRow = summary.data.ideas.top.find((row) => row.id === created.data.idea.id);
  assert.ok(ideaRow);
  const planSummary = ideaRow.linkedPlanArtifactSummary;
  assert.ok(planSummary);
  assert.equal(planSummary.status, "brainstorming");
  assert.deepEqual(planSummary.brainstormSynthesis, dashboardFixture.ideasTopPlanSummary.brainstormSynthesis);
});

test("dashboard-summary brainstormingIdeas rollup aggregates brainstorming-state ideas", async () => {
  const { workspace } = await tmpWorkspace();
  const created = await planningModule.onCommand(
    {
      name: "create-idea",
      args: {
        title: "Unified IdeaPlan document",
        linkedPlanArtifact: brainstormingFixture.planRef,
        policyApproval: policyApproval()
      }
    },
    ctx(workspace)
  );
  assert.equal(created.ok, true, created.message);
  seedBrainstormingDocument(workspace, created.data.idea.id);

  const summary = await taskEngineModule.onCommand({ name: "dashboard-summary", args: {} }, sqliteTaskEngineCtx(workspace));
  assert.equal(summary.ok, true, summary.message);
  assert.deepEqual(summary.data.brainstormingIdeas, {
    ...dashboardFixture.brainstormingIdeas,
    top: [
      {
        ...dashboardFixture.brainstormingIdeas.top[0],
        ideaId: created.data.idea.id
      }
    ]
  });
});

test("dashboard-summary overview projection stubs brainstormingIdeas rollup", async () => {
  const { workspace } = await tmpWorkspace();
  const created = await planningModule.onCommand(
    {
      name: "create-idea",
      args: {
        title: "Unified IdeaPlan document",
        linkedPlanArtifact: brainstormingFixture.planRef,
        policyApproval: policyApproval()
      }
    },
    ctx(workspace)
  );
  assert.equal(created.ok, true, created.message);
  seedBrainstormingDocument(workspace, created.data.idea.id);

  const overview = await taskEngineModule.onCommand(
    { name: "dashboard-summary", args: { projection: "overview" } },
    sqliteTaskEngineCtx(workspace)
  );
  assert.equal(overview.ok, true, overview.message);
  assert.equal(overview.data.brainstormingIdeas.available, false);
  assert.equal(overview.data.brainstormingIdeas.count, 0);
  assert.deepEqual(overview.data.brainstormingIdeas.top, []);
});

test("dashboard-summary queue projection includes brainstormingIdeas rollup", async () => {
  const { workspace } = await tmpWorkspace();
  const created = await planningModule.onCommand(
    {
      name: "create-idea",
      args: {
        title: "Unified IdeaPlan document",
        linkedPlanArtifact: brainstormingFixture.planRef,
        policyApproval: policyApproval()
      }
    },
    ctx(workspace)
  );
  assert.equal(created.ok, true, created.message);
  seedBrainstormingDocument(workspace, created.data.idea.id);

  const queue = await taskEngineModule.onCommand(
    { name: "dashboard-summary", args: { projection: "queue" } },
    sqliteTaskEngineCtx(workspace)
  );
  assert.equal(queue.ok, true, queue.message);
  assert.equal(queue.data.brainstormingIdeas.available, true);
  assert.equal(queue.data.brainstormingIdeas.count, 1);
  assert.equal(queue.data.brainstormingIdeas.top[0]?.ideaId, created.data.idea.id);
});
