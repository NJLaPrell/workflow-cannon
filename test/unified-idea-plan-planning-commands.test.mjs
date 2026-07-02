/**
 * T100785 — unified IdeaPlan document integration for start-idea-planning and draft-plan-artifact.
 */
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import { ideasModule, planningModule } from "../dist/index.js";
import { getPlanArtifactStoragePaths } from "../dist/core/planning/plan-artifact-storage.js";
import { isIdeaPlanDocument, readIdeaPlanArtifact } from "../dist/modules/ideas/idea-plan-artifact-storage.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixturesDir = path.join(repoRoot, "fixtures", "planning");
const ideasFixturesDir = path.join(repoRoot, "fixtures", "ideas");
const SQLITE_CFG = { tasks: { persistenceBackend: "sqlite" } };

function loadFixture(name) {
  return JSON.parse(fs.readFileSync(path.join(fixturesDir, name), "utf8"));
}

function loadIdeaFixture(name) {
  return JSON.parse(fs.readFileSync(path.join(ideasFixturesDir, name), "utf8"));
}

function freshDraftArtifact(base) {
  const planId = crypto.randomUUID();
  const doc = structuredClone(base);
  doc.planId = planId;
  doc.planRef = `plan-artifact:${planId}`;
  doc.version = 1;
  doc.status = "draft";
  return doc;
}

async function tmpWorkspace() {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "wk-unified-plan-"));
  await mkdir(path.join(workspace, ".workspace-kit", "tasks"), { recursive: true });
  return workspace;
}

function ctx(workspace) {
  return { runtimeVersion: "0.1", workspacePath: workspace, effectiveConfig: SQLITE_CFG };
}

function policyApproval() {
  return { confirmed: true, rationale: "unified-idea-plan-planning-commands.test.mjs" };
}

async function writeIdeaPlanFixture(workspace, fixtureName) {
  const fixture = loadIdeaFixture(fixtureName);
  const paths = getPlanArtifactStoragePaths(workspace, fixture.planId);
  await mkdir(paths.planDirAbsolute, { recursive: true });
  await writeFile(paths.artifactFileAbsolute(fixture.version), `${JSON.stringify(fixture, null, 2)}\n`, "utf8");
  return fixture;
}

async function planningGeneration(workspace) {
  return (await ideasModule.onCommand({ name: "list-ideas", args: {} }, ctx(workspace))).data.planningGeneration;
}

async function createIdeaWithUnifiedPlan(workspace, fixtureName, title = "Unified plan idea") {
  const fixtureTemplate = loadIdeaFixture(fixtureName);
  const created = await ideasModule.onCommand(
    {
      name: "create-idea",
      args: {
        title,
        linkedPlanArtifact: fixtureTemplate.planRef,
        policyApproval: policyApproval()
      }
    },
    ctx(workspace)
  );
  assert.equal(created.ok, true);
  const fixture = { ...fixtureTemplate, ideaId: created.data.idea.id };
  const paths = getPlanArtifactStoragePaths(workspace, fixture.planId);
  await mkdir(paths.planDirAbsolute, { recursive: true });
  await writeFile(paths.artifactFileAbsolute(fixture.version), `${JSON.stringify(fixture, null, 2)}\n`, "utf8");
  return { idea: created.data.idea, fixture };
}

describe("unified IdeaPlan planning commands (T100785)", () => {
  it("start-idea-planning initializes plan section on unified planning-state document", async () => {
    const workspace = await tmpWorkspace();
    const { idea, fixture } = await createIdeaWithUnifiedPlan(workspace, "planning-state.fixture.json");

    const withoutPlan = structuredClone(fixture);
    delete withoutPlan.plan;
    withoutPlan.status = "brainstorming";
    const paths = getPlanArtifactStoragePaths(workspace, fixture.planId);
    await writeFile(paths.artifactFileAbsolute(fixture.version), `${JSON.stringify(withoutPlan, null, 2)}\n`, "utf8");

    const generation = await planningGeneration(workspace);
    const started = await ideasModule.onCommand(
      {
        name: "start-idea-planning",
        args: {
          ideaId: idea.id,
          expectedPlanningGeneration: generation,
          policyApproval: policyApproval()
        }
      },
      ctx(workspace)
    );
    assert.equal(started.ok, true);
    assert.equal(started.code, "idea-planning-started");

    const planningDoc = readIdeaPlanArtifact(workspace, fixture.planRef);
    assert.ok(planningDoc);
    assert.equal(planningDoc.status, "planning");
    assert.ok(planningDoc.plan?.title);
    assert.ok(planningDoc.plan?.summary);
    assert.equal(typeof planningDoc.plan?.wbsRowCount, "number");
    assert.equal(planningDoc.version, fixture.version + 1);
  });

  it("draft-plan-artifact writes plan section to unified document without new planId", async () => {
    const workspace = await tmpWorkspace();
    const { idea, fixture } = await createIdeaWithUnifiedPlan(workspace, "planning-state.fixture.json");

    const generation = await planningGeneration(workspace);
    const started = await ideasModule.onCommand(
      {
        name: "start-idea-planning",
        args: {
          ideaId: idea.id,
          expectedPlanningGeneration: generation,
          policyApproval: policyApproval()
        }
      },
      ctx(workspace)
    );
    assert.equal(started.ok, true);
    const sessionId = started.data.planningChatSession.sessionId;

    const artifact = freshDraftArtifact(loadFixture("plan-artifact-minimal.valid.v1.json"));
    artifact.provenance = {
      ...artifact.provenance,
      sourceIdeaId: idea.id,
      chatSessionRef: sessionId
    };

    const newPlanId = artifact.planId;
    const afterStartGen = await planningGeneration(workspace);
    const result = await planningModule.onCommand(
      {
        name: "draft-plan-artifact",
        args: {
          persist: true,
          artifact,
          expectedPlanningGeneration: afterStartGen,
          policyApproval: policyApproval()
        }
      },
      ctx(workspace)
    );

    assert.equal(result.ok, true);
    assert.equal(result.code, "plan-artifact-draft-persisted");
    assert.equal(result.data.planId, fixture.planId);
    assert.notEqual(result.data.planId, newPlanId);
    assert.equal(result.data.planRef, fixture.planRef);

    const storedRaw = JSON.parse(await readFile(path.join(workspace, result.data.storagePath), "utf8"));
    assert.equal(isIdeaPlanDocument(storedRaw), true);
    assert.equal(storedRaw.status, "planning");
    assert.equal(storedRaw.plan.title, artifact.identity.title);
    assert.equal(storedRaw.plan.wbsRowCount, artifact.wbs.length);
    assert.deepEqual(storedRaw.goals, artifact.goals);
    assert.equal(storedRaw.wbs.length, artifact.wbs.length);
  });

  it("preserves backward-compatible argv shapes for both commands", async () => {
    const workspace = await tmpWorkspace();
    const { idea, fixture } = await createIdeaWithUnifiedPlan(workspace, "planning-state.fixture.json");
    const generation = await planningGeneration(workspace);

    const startMinimal = await ideasModule.onCommand(
      {
        name: "start-idea-planning",
        args: { ideaId: idea.id, policyApproval: policyApproval() }
      },
      ctx(workspace)
    );
    assert.equal(startMinimal.ok, true);

    const startAlias = await ideasModule.onCommand(
      {
        name: "start-idea-planning",
        args: { id: idea.id, policyApproval: policyApproval() }
      },
      ctx(workspace)
    );
    assert.equal(startAlias.ok, true);

    const artifact = freshDraftArtifact(loadFixture("plan-artifact-minimal.valid.v1.json"));
    artifact.provenance = {
      ...artifact.provenance,
      sourceIdeaId: idea.id,
      chatSessionRef: startMinimal.data.planningChatSession.sessionId
    };

    const validateOnly = await planningModule.onCommand(
      {
        name: "draft-plan-artifact",
        args: { persist: false, artifact }
      },
      ctx(workspace)
    );
    assert.equal(validateOnly.ok, true);
    assert.equal(validateOnly.code, "plan-artifact-draft-validated");

    const persisted = await planningModule.onCommand(
      {
        name: "draft-plan-artifact",
        args: {
          persist: true,
          artifact,
          planId: fixture.planId,
          expectedPlanningGeneration: await planningGeneration(workspace),
          policyApproval: policyApproval()
        }
      },
      ctx(workspace)
    );
    assert.equal(persisted.ok, true);
    assert.equal(persisted.data.planId, fixture.planId);
  });

  it("standalone draft-plan-artifact still allocates a new planId when no unified link exists", async () => {
    const workspace = await tmpWorkspace();
    const created = await ideasModule.onCommand(
      {
        name: "create-idea",
        args: { title: "No unified link", policyApproval: policyApproval() }
      },
      ctx(workspace)
    );
    const idea = created.data.idea;
    const artifact = freshDraftArtifact(loadFixture("plan-artifact-minimal.valid.v1.json"));
    const requestedPlanId = artifact.planId;
    artifact.provenance = { ...artifact.provenance, sourceIdeaId: idea.id, chatSessionRef: "pcs-standalone" };

    const generation = await planningGeneration(workspace);
    const result = await planningModule.onCommand(
      {
        name: "draft-plan-artifact",
        args: {
          persist: true,
          artifact,
          expectedPlanningGeneration: generation,
          policyApproval: policyApproval()
        }
      },
      ctx(workspace)
    );
    assert.equal(result.ok, true);
    assert.equal(result.data.planId, requestedPlanId);
    const storedRaw = JSON.parse(await readFile(path.join(workspace, result.data.storagePath), "utf8"));
    assert.equal(isIdeaPlanDocument(storedRaw), false);
  });
});
