import assert from "node:assert/strict";
import fs from "node:fs";
import { mkdir, mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { ideasModule } from "../dist/index.js";
import { applyBrainstormSectionSynthesis } from "../dist/modules/ideas/brainstorm-section-synthesis.js";
import { synthesizeBrainstormScores } from "../dist/modules/ideas/brainstorm-scoring.js";
import { writeIdeaPlanArtifactVersion } from "../dist/modules/ideas/idea-plan-artifact-storage.js";
import { validateBrainstormSectionForPlanning } from "../dist/modules/ideas/validate-brainstorm-section.js";
import { SqliteDualPlanningStore } from "../dist/modules/task-engine/persistence/sqlite-dual-planning.js";

const root = path.resolve(import.meta.dirname, "..");
const sessionFixture = JSON.parse(
  fs.readFileSync(path.join(root, "fixtures/ideas/brainstorming-session.fixture.json"), "utf8")
);
const brainstormingFixture = JSON.parse(
  fs.readFileSync(path.join(root, "fixtures/ideas/brainstorming-state.fixture.json"), "utf8")
);

const SQLITE_CFG = { tasks: { persistenceBackend: "sqlite" } };

async function tmpWorkspace() {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "complete-brainstorm-"));
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
  return { confirmed: true, rationale: "test complete-brainstorm" };
}

async function planningGeneration(workspace) {
  const listed = await ideasModule.onCommand({ name: "list-ideas", args: {} }, ctx(workspace));
  return listed.data.planningGeneration;
}

function seedBrainstormingDocument(workspace, overrides = {}) {
  const document = {
    ...brainstormingFixture,
    brainstorm: {
      sessions: [{ ...sessionFixture }],
      activeSessionId: sessionFixture.sessionId
    },
    ...overrides
  };
  writeIdeaPlanArtifactVersion(workspace, document);
  return document;
}

test("N=1 section synthesis equals session scores", () => {
  const section = applyBrainstormSectionSynthesis({
    sessions: [
      {
        sessionId: "one",
        startedAt: "2026-07-02T10:00:00.000Z",
        updatedAt: "2026-07-02T10:30:00.000Z",
        scores: { value: 7.6, risk: 4.7, effort: 7.8, confidence: 6.95, priority: 5.66 }
      }
    ]
  });
  assert.deepEqual(section.synthesis, { value: 7.6, risk: 4.7, effort: 7.8, confidence: 6.95, priority: 5.66 });
});

test("N=2 section synthesis applies 60/40 weighting", () => {
  const synthesized = synthesizeBrainstormScores([
    {
      sessionId: "first",
      startedAt: "2026-07-02T09:00:00.000Z",
      updatedAt: "2026-07-02T09:30:00.000Z",
      scores: { value: 7, risk: 5, effort: 6, confidence: 7 }
    },
    {
      sessionId: "second",
      startedAt: "2026-07-02T10:00:00.000Z",
      updatedAt: "2026-07-02T10:30:00.000Z",
      scores: { value: 9, risk: 4, effort: 8, confidence: 8 }
    }
  ]);
  assert.deepEqual(synthesized, {
    value: 8.2,
    risk: 4.4,
    effort: 7.2,
    confidence: 7.6
  });
});

test("validateBrainstormSectionForPlanning rejects empty sessions", () => {
  const result = validateBrainstormSectionForPlanning({ sessions: [] });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.code, "brainstorm-section-empty");
  }
});

test("complete-brainstorm transitions brainstorming to planning when valid", async () => {
  const { workspace } = await tmpWorkspace();
  const created = await ideasModule.onCommand(
    {
      name: "create-idea",
      args: {
        title: "Unified doc idea",
        linkedPlanArtifact: brainstormingFixture.planRef,
        policyApproval: policyApproval()
      }
    },
    ctx(workspace)
  );
  assert.equal(created.ok, true);
  seedBrainstormingDocument(workspace, { ideaId: created.data.idea.id });

  const generation = await planningGeneration(workspace);
  const out = await ideasModule.onCommand(
    {
      name: "complete-brainstorm",
      args: {
        planRef: brainstormingFixture.planRef,
        operatorConfirmedBrainstormComplete: true,
        expectedPlanningGeneration: generation,
        policyApproval: policyApproval()
      }
    },
    ctx(workspace)
  );
  assert.equal(out.ok, true, out.message);
  assert.equal(out.code, "brainstorm-completed");
  assert.equal(out.data.status, "planning");
  assert.ok(out.data.brainstorm.synthesis);
  assert.equal(out.data.plan.title, "Unified doc idea");
});

test("complete-brainstorm requires explicit operator confirmation", async () => {
  const { workspace } = await tmpWorkspace();
  const created = await ideasModule.onCommand(
    {
      name: "create-idea",
      args: {
        title: "Unified doc idea",
        linkedPlanArtifact: brainstormingFixture.planRef,
        policyApproval: policyApproval()
      }
    },
    ctx(workspace)
  );
  assert.equal(created.ok, true);
  seedBrainstormingDocument(workspace, { ideaId: created.data.idea.id });

  const generation = await planningGeneration(workspace);
  const out = await ideasModule.onCommand(
    {
      name: "complete-brainstorm",
      args: {
        planRef: brainstormingFixture.planRef,
        expectedPlanningGeneration: generation,
        policyApproval: policyApproval()
      }
    },
    ctx(workspace)
  );
  assert.equal(out.ok, false);
  assert.equal(out.code, "brainstorm-completion-confirmation-required");
});

test("complete-brainstorm rejects empty brainstorm sessions", async () => {
  const { workspace } = await tmpWorkspace();
  seedBrainstormingDocument(workspace, {
    brainstorm: { sessions: [], activeSessionId: undefined }
  });

  const generation = await planningGeneration(workspace);
  const out = await ideasModule.onCommand(
    {
      name: "complete-brainstorm",
      args: {
        planRef: brainstormingFixture.planRef,
        operatorConfirmedBrainstormComplete: true,
        expectedPlanningGeneration: generation,
        policyApproval: policyApproval()
      }
    },
    ctx(workspace)
  );
  assert.equal(out.ok, false);
  assert.equal(out.code, "brainstorm-section-empty");
});

test("get-idea returns unified ideaPlan with brainstorm synthesis", async () => {
  const { workspace } = await tmpWorkspace();
  const created = await ideasModule.onCommand(
    {
      name: "create-idea",
      args: {
        title: "Brainstorming idea",
        linkedPlanArtifact: brainstormingFixture.planRef,
        policyApproval: policyApproval()
      }
    },
    ctx(workspace)
  );
  assert.equal(created.ok, true);
  const document = seedBrainstormingDocument(workspace, { ideaId: created.data.idea.id });
  const withSynthesis = applyBrainstormSectionSynthesis(document.brainstorm);
  writeIdeaPlanArtifactVersion(workspace, { ...document, brainstorm: withSynthesis });

  const out = await ideasModule.onCommand(
    { name: "get-idea", args: { ideaId: created.data.idea.id } },
    ctx(workspace)
  );
  assert.equal(out.ok, true);
  assert.ok(out.data.ideaPlan);
  assert.equal(out.data.ideaPlan.status, "brainstorming");
  assert.ok(Array.isArray(out.data.ideaPlan.brainstorm.sessions));
  assert.ok(out.data.ideaPlan.brainstorm.synthesis);
});
