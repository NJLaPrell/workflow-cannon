import assert from "node:assert/strict";
import { existsSync } from "node:fs";
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
const PLAN_ID = "c9e1a2b3-d4f5-6789-abcd-ef0123456789";
const PLAN_REF = `plan-artifact:${PLAN_ID}`;

async function tmpWorkspace() {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "cancel-delete-plan-"));
  await mkdir(path.join(workspace, ".workspace-kit", "tasks"), { recursive: true });
  const dual = new SqliteDualPlanningStore(workspace, ".workspace-kit/tasks/workspace-kit.db");
  dual.loadFromDisk();
  return { workspace, dual };
}

function ctx(workspace) {
  return { runtimeVersion: "0.1", workspacePath: workspace, effectiveConfig: SQLITE_CFG };
}

function policyApproval(rationale = "test cancel/delete plan artifact") {
  return { confirmed: true, rationale };
}

async function planningGeneration(workspace) {
  return (await ideasModule.onCommand({ name: "list-ideas", args: {} }, ctx(workspace))).data
    .planningGeneration;
}

async function createIdea(workspace) {
  const generation = await planningGeneration(workspace);
  const out = await ideasModule.onCommand(
    {
      name: "create-idea",
      args: {
        title: "Cancel delete fixture idea",
        note: "for cancel/delete tests",
        expectedPlanningGeneration: generation,
        policyApproval: policyApproval("create idea for cancel/delete")
      }
    },
    ctx(workspace)
  );
  assert.equal(out.ok, true, out.message);
  return out.data.idea;
}

async function writeAcceptedFixture(workspace, ideaId) {
  const fixture = JSON.parse(
    await readFile(path.join(root, "fixtures", "ideas", "accepted-state.fixture.json"), "utf8")
  );
  const doc = {
    ...fixture,
    planId: PLAN_ID,
    planRef: PLAN_REF,
    ideaId
  };
  const paths = getPlanArtifactStoragePaths(workspace, PLAN_ID);
  await mkdir(paths.planDirAbsolute, { recursive: true });
  await writeFile(paths.artifactFileAbsolute(doc.version), `${JSON.stringify(doc, null, 2)}\n`, "utf8");
  return doc;
}

test("cancel-plan-artifact soft-archives any status to cancelled", async () => {
  const { workspace } = await tmpWorkspace();
  const idea = await createIdea(workspace);
  await writeAcceptedFixture(workspace, idea.id);
  const generation = await planningGeneration(workspace);
  const out = await ideasModule.onCommand(
    {
      name: "cancel-plan-artifact",
      args: {
        planRef: PLAN_REF,
        ideaId: idea.id,
        rationale: "operator cancelled from test",
        expectedPlanningGeneration: generation,
        policyApproval: policyApproval()
      }
    },
    ctx(workspace)
  );
  assert.equal(out.ok, true, out.message);
  assert.equal(out.code, "plan-artifact-cancelled");
  assert.equal(out.data.status, "cancelled");
  assert.equal(out.data.previousStatus, "accepted");
  assert.equal(out.data.transitioned, true);
  const doc = readIdeaPlanArtifact(workspace, PLAN_REF);
  assert.equal(doc?.status, "cancelled");
  assert.equal(doc?.cancellation?.previousStatus, "accepted");
});

test("cancel-plan-artifact is idempotent when already cancelled", async () => {
  const { workspace } = await tmpWorkspace();
  const idea = await createIdea(workspace);
  await writeAcceptedFixture(workspace, idea.id);
  let generation = await planningGeneration(workspace);
  await ideasModule.onCommand(
    {
      name: "cancel-plan-artifact",
      args: {
        planRef: PLAN_REF,
        expectedPlanningGeneration: generation,
        policyApproval: policyApproval()
      }
    },
    ctx(workspace)
  );
  generation = await planningGeneration(workspace);
  const out = await ideasModule.onCommand(
    {
      name: "cancel-plan-artifact",
      args: {
        planRef: PLAN_REF,
        expectedPlanningGeneration: generation,
        policyApproval: policyApproval()
      }
    },
    ctx(workspace)
  );
  assert.equal(out.ok, true);
  assert.equal(out.code, "plan-artifact-already-cancelled");
  assert.equal(out.data.transitioned, false);
});

test("start-brainstorm-session revives cancelled plan to brainstorming", async () => {
  const { workspace } = await tmpWorkspace();
  const idea = await createIdea(workspace);
  await writeAcceptedFixture(workspace, idea.id);
  let generation = await planningGeneration(workspace);
  await ideasModule.onCommand(
    {
      name: "cancel-plan-artifact",
      args: {
        planRef: PLAN_REF,
        expectedPlanningGeneration: generation,
        policyApproval: policyApproval()
      }
    },
    ctx(workspace)
  );
  generation = await planningGeneration(workspace);
  const out = await ideasModule.onCommand(
    {
      name: "start-brainstorm-session",
      args: {
        planRef: PLAN_REF,
        ideaId: idea.id,
        expectedPlanningGeneration: generation,
        policyApproval: policyApproval("revive cancelled via brainstorm")
      }
    },
    ctx(workspace)
  );
  assert.equal(out.ok, true, out.message);
  const doc = readIdeaPlanArtifact(workspace, PLAN_REF);
  assert.equal(doc?.status, "brainstorming");
});

test("delete-plan-artifact requires confirmDelete and removes plan + idea", async () => {
  const { workspace, dual } = await tmpWorkspace();
  const idea = await createIdea(workspace);
  await writeAcceptedFixture(workspace, idea.id);
  const paths = getPlanArtifactStoragePaths(workspace, PLAN_ID);
  assert.equal(existsSync(paths.planDirAbsolute), true);

  let generation = await planningGeneration(workspace);
  const blocked = await ideasModule.onCommand(
    {
      name: "delete-plan-artifact",
      args: {
        planRef: PLAN_REF,
        expectedPlanningGeneration: generation,
        policyApproval: policyApproval()
      }
    },
    ctx(workspace)
  );
  assert.equal(blocked.ok, false);
  assert.equal(blocked.code, "confirm-delete-required");

  generation = await planningGeneration(workspace);
  const out = await ideasModule.onCommand(
    {
      name: "delete-plan-artifact",
      args: {
        planRef: PLAN_REF,
        ideaId: idea.id,
        confirmDelete: true,
        expectedPlanningGeneration: generation,
        policyApproval: policyApproval("delete plan and idea")
      }
    },
    ctx(workspace)
  );
  assert.equal(out.ok, true, out.message);
  assert.equal(out.code, "plan-artifact-deleted");
  assert.equal(out.data.deletedPlanFiles, true);
  assert.equal(out.data.deletedIdea, true);
  assert.equal(existsSync(paths.planDirAbsolute), false);
  assert.equal(readIdeaPlanArtifact(workspace, PLAN_REF), null);
  const row = dual.getDatabase().prepare("SELECT id FROM workflow_ideas WHERE id = ?").get(idea.id);
  assert.equal(row, undefined);
});

test("cancel-plan-artifact soft-cancels classic PlanArtifact without ideaId", async () => {
  const { workspace } = await tmpWorkspace();
  const fixture = JSON.parse(
    await readFile(path.join(root, "fixtures", "planning", "plan-artifact-minimal.valid.v1.json"), "utf8")
  );
  const doc = {
    ...fixture,
    planId: PLAN_ID,
    planRef: PLAN_REF,
    status: "accepted",
    version: 1
  };
  const paths = getPlanArtifactStoragePaths(workspace, PLAN_ID);
  await mkdir(paths.planDirAbsolute, { recursive: true });
  await writeFile(paths.artifactFileAbsolute(1), `${JSON.stringify(doc, null, 2)}\n`, "utf8");

  const generation = await planningGeneration(workspace);
  const out = await ideasModule.onCommand(
    {
      name: "cancel-plan-artifact",
      args: {
        planRef: PLAN_REF,
        expectedPlanningGeneration: generation,
        policyApproval: policyApproval("cancel classic plan")
      }
    },
    ctx(workspace)
  );
  assert.equal(out.ok, true, out.message);
  assert.equal(out.code, "plan-artifact-cancelled");
  assert.equal(out.data.documentKind, "plan-artifact");
  assert.equal(out.data.previousStatus, "accepted");
  assert.equal(out.data.status, "cancelled");
  assert.equal(out.data.transitioned, true);

  const { readLatestPlanArtifact } = await import("../dist/core/planning/plan-artifact-storage.js");
  const latest = readLatestPlanArtifact(workspace, PLAN_ID);
  assert.equal(latest?.status, "cancelled");
  assert.ok((latest?.version ?? 0) > 1);
});
