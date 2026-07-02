import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { ideasModule } from "../dist/index.js";
import { getPlanArtifactStoragePaths } from "../dist/core/planning/plan-artifact-storage.js";
import { readIdeaPlanArtifact } from "../dist/modules/ideas/idea-plan-artifact-storage.js";
import { SqliteDualPlanningStore } from "../dist/modules/task-engine/persistence/sqlite-dual-planning.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SQLITE_CFG = { tasks: { persistenceBackend: "sqlite" } };
const PLAN_ID = "f7a3b891-c5d2-4e6f-9a08-1b2c3d4e5f60";
const PLAN_REF = `plan-artifact:${PLAN_ID}`;

async function tmpWorkspace() {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "brainstorm-session-"));
  await mkdir(path.join(workspace, ".workspace-kit", "tasks"), { recursive: true });
  const dual = new SqliteDualPlanningStore(workspace, ".workspace-kit/tasks/workspace-kit.db");
  dual.loadFromDisk();
  return { workspace, dual };
}

function ctx(workspace) {
  return { runtimeVersion: "0.1", workspacePath: workspace, effectiveConfig: SQLITE_CFG };
}

function policyApproval() {
  return { confirmed: true, rationale: "test brainstorm session commands" };
}

async function writeIdeaPlanFixture(workspace, fixtureName) {
  const fixture = JSON.parse(
    await readFile(path.join(root, "fixtures", "ideas", fixtureName), "utf8")
  );
  const paths = getPlanArtifactStoragePaths(workspace, PLAN_ID);
  await mkdir(paths.planDirAbsolute, { recursive: true });
  const target = paths.artifactFileAbsolute(fixture.version);
  await writeFile(target, `${JSON.stringify(fixture, null, 2)}\n`, "utf8");
  return fixture;
}

async function planningGeneration(workspace) {
  return (await ideasModule.onCommand({ name: "list-ideas", args: {} }, ctx(workspace))).data.planningGeneration;
}

async function runStart(workspace, args) {
  const generation = await planningGeneration(workspace);
  return ideasModule.onCommand(
    {
      name: "start-brainstorm-session",
      args: {
        expectedPlanningGeneration: generation,
        policyApproval: policyApproval(),
        ...args
      }
    },
    ctx(workspace)
  );
}

async function runUpdate(workspace, args) {
  const generation = await planningGeneration(workspace);
  return ideasModule.onCommand(
    {
      name: "update-brainstorm-session",
      args: {
        expectedPlanningGeneration: generation,
        policyApproval: policyApproval(),
        ...args
      }
    },
    ctx(workspace)
  );
}

test("start-brainstorm-session transitions idea document to brainstorming and appends session slot", async () => {
  const { workspace } = await tmpWorkspace();
  await writeIdeaPlanFixture(workspace, "idea-state.fixture.json");

  const out = await runStart(workspace, { planRef: PLAN_REF, ideaId: "I005" });
  assert.equal(out.ok, true);
  assert.equal(out.code, "brainstorm-session-started");
  assert.equal(out.data.transitioned, true);
  assert.equal(out.data.status, "brainstorming");
  assert.equal(out.data.sessionIndex, 0);
  assert.equal(typeof out.data.session.sessionId, "string");
  assert.equal(typeof out.data.session.startedAt, "string");

  const persisted = readIdeaPlanArtifact(workspace, PLAN_REF);
  assert.equal(persisted?.status, "brainstorming");
  assert.equal(persisted?.brainstorm?.sessions.length, 1);
  assert.equal(persisted?.brainstorm?.activeSessionId, out.data.session.sessionId);
  assert.equal(persisted?.version, 2);
});

test("start-brainstorm-session on planning-state document appends without status change", async () => {
  const { workspace } = await tmpWorkspace();
  const fixture = await writeIdeaPlanFixture(workspace, "planning-state.fixture.json");
  const priorCount = fixture.brainstorm.sessions.length;

  const out = await runStart(workspace, { planRef: PLAN_REF });
  assert.equal(out.ok, true);
  assert.equal(out.data.transitioned, false);
  assert.equal(out.data.status, "planning");
  assert.equal(out.data.sessionIndex, priorCount);

  const persisted = readIdeaPlanArtifact(workspace, PLAN_REF);
  assert.equal(persisted?.status, "planning");
  assert.equal(persisted?.brainstorm?.sessions.length, priorCount + 1);
});

test("update-brainstorm-session merges fields at session index without affecting other sessions", async () => {
  const { workspace } = await tmpWorkspace();
  await writeIdeaPlanFixture(workspace, "brainstorming-state.fixture.json");
  const start = await runStart(workspace, { planRef: PLAN_REF });
  assert.equal(start.ok, true);
  const secondIndex = start.data.sessionIndex;

  const firstSessionId = readIdeaPlanArtifact(workspace, PLAN_REF)?.brainstorm?.sessions[0]?.sessionId;
  const update = await runUpdate(workspace, {
    planRef: PLAN_REF,
    sessionIndex: secondIndex,
    inputs: { valueImpact: 9, contextProblem: "Focused operator pain" }
  });
  assert.equal(update.ok, true);
  assert.equal(update.code, "brainstorm-session-updated");
  assert.equal(update.data.scoresComputed, false);
  assert.equal(update.data.session.inputs.valueImpact, 9);
  assert.equal(update.data.session.inputs.contextProblem, "Focused operator pain");

  const persisted = readIdeaPlanArtifact(workspace, PLAN_REF);
  assert.equal(persisted?.brainstorm?.sessions[0]?.sessionId, firstSessionId);
  assert.equal(persisted?.brainstorm?.sessions[0]?.inputs?.contextProblem, "Operators need one durable IdeaPlan document instead of parallel entities that drift.");
  assert.equal(persisted?.brainstorm?.sessions[secondIndex]?.inputs?.valueImpact, 9);
});

test("update-brainstorm-session computes all five scores when sub-inputs are complete", async () => {
  const { workspace } = await tmpWorkspace();
  await writeIdeaPlanFixture(workspace, "idea-state.fixture.json");
  const started = await runStart(workspace, { planRef: PLAN_REF });
  assert.equal(started.ok, true);

  const update = await runUpdate(workspace, {
    planRef: PLAN_REF,
    sessionIndex: 0,
    inputs: {
      valueImpact: 8,
      valueReach: 7,
      valueUrgency: 6,
      valueStrategicFit: 9,
      riskTechnical: 5,
      riskOperational: 4,
      riskUnknowns: 6,
      riskReversibility: 3,
      tShirtSize: "M",
      complexity: 9,
      confidenceEvidence: 7,
      confidenceExpertise: 8,
      confidenceClarity: 6
    }
  });
  assert.equal(update.ok, true);
  assert.equal(update.data.scoresComputed, true);
  assert.deepEqual(update.data.session.scores, {
    value: 7.6,
    risk: 4.7,
    effort: 7.8,
    confidence: 6.95,
    priority: 5.66
  });
});
