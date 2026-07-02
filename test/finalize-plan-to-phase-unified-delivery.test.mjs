/**
 * T100787 — finalize-plan-to-phase writes delivery.taskRefs on unified IdeaPlan document.
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
import { readIdeaPlanArtifact } from "../dist/modules/ideas/idea-plan-artifact-storage.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixturesDir = path.join(repoRoot, "fixtures", "planning");
const ideasFixturesDir = path.join(repoRoot, "fixtures", "ideas");
const SQLITE_CFG = { tasks: { persistenceBackend: "sqlite" } };

function loadFixture(name) {
  return JSON.parse(fs.readFileSync(path.join(fixturesDir, name), "utf8"));
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

function approvalFor(artifact, version) {
  return {
    schemaVersion: 1,
    confirmed: true,
    approvedVersion: version,
    approvedAt: "2026-05-27T08:00:00.000Z",
    approvedBy: "operator@example.com",
    planRef: artifact.planRef
  };
}

function enrichWbsForBatchReview(artifact) {
  const tail = "rollback activation toggle empty first-run unit test verification coverage";
  for (const row of artifact.wbs) {
    row.generatedTaskPayload.technicalScope.push(tail);
    row.generatedTaskPayload.acceptanceCriteria.push(
      "Observable verification with rollback and empty first-run behavior"
    );
  }
}

async function tmpWorkspace() {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "wk-finalize-unified-delivery-"));
  await mkdir(path.join(workspace, ".workspace-kit", "tasks"), { recursive: true });
  return workspace;
}

function ctx(workspace) {
  return { runtimeVersion: "0.1", workspacePath: workspace, effectiveConfig: SQLITE_CFG };
}

function policyApproval() {
  return { confirmed: true, rationale: "finalize-plan-to-phase-unified-delivery.test.mjs" };
}

async function planningGeneration(workspace) {
  return (await ideasModule.onCommand({ name: "list-ideas", args: {} }, ctx(workspace))).data.planningGeneration;
}

function loadIdeaFixture(name) {
  return JSON.parse(fs.readFileSync(path.join(ideasFixturesDir, name), "utf8"));
}

async function writeIdeaPlanFixture(workspace, fixtureName, ideaId) {
  const fixtureTemplate = loadIdeaFixture(fixtureName);
  const fixture = { ...fixtureTemplate, ideaId };
  const paths = getPlanArtifactStoragePaths(workspace, fixture.planId);
  await mkdir(paths.planDirAbsolute, { recursive: true });
  await writeFile(paths.artifactFileAbsolute(fixture.version), `${JSON.stringify(fixture, null, 2)}\n`, "utf8");
  return fixture;
}

async function createIdeaWithUnifiedPlan(workspace, fixtureName) {
  const created = await ideasModule.onCommand(
    {
      name: "create-idea",
      args: { title: "Finalize unified delivery idea", policyApproval: policyApproval() }
    },
    ctx(workspace)
  );
  assert.equal(created.ok, true);
  const fixture = await writeIdeaPlanFixture(workspace, fixtureName, created.data.idea.id);
  const linked = await ideasModule.onCommand(
    {
      name: "update-idea",
      args: {
        ideaId: created.data.idea.id,
        linkedPlanArtifact: fixture.planRef,
        expectedPlanningGeneration: await planningGeneration(workspace),
        policyApproval: policyApproval()
      }
    },
    ctx(workspace)
  );
  assert.equal(linked.ok, true);
  return { idea: linked.data.idea, fixture };
}

async function prepareAcceptedUnifiedPlan(workspace) {
  const { idea, fixture } = await createIdeaWithUnifiedPlan(workspace, "planning-state.fixture.json");
  const started = await ideasModule.onCommand(
    {
      name: "start-idea-planning",
      args: { ideaId: idea.id, policyApproval: policyApproval() }
    },
    ctx(workspace)
  );
  assert.equal(started.ok, true);

  const artifact = freshDraftArtifact(loadFixture("plan-artifact-full-feature.valid.v1.json"));
  artifact.openQuestions = [];
  artifact.provenance = {
    ...artifact.provenance,
    sourceIdeaId: idea.id,
    chatSessionRef: started.data.planningChatSession.sessionId
  };
  enrichWbsForBatchReview(artifact);

  let generation = await planningGeneration(workspace);
  const draft = await planningModule.onCommand(
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
  assert.equal(draft.ok, true, draft.message);

  generation = await planningGeneration(workspace);
  const review = await planningModule.onCommand(
    {
      name: "review-plan-artifact",
      args: {
        planId: fixture.planId,
        profile: "minimal",
        recordReview: true,
        expectedPlanningGeneration: generation,
        policyApproval: policyApproval()
      }
    },
    ctx(workspace)
  );
  assert.equal(review.ok, true, review.message);

  generation = await planningGeneration(workspace);
  const accepted = await planningModule.onCommand(
    {
      name: "accept-plan-artifact",
      args: {
        planId: fixture.planId,
        approvalRecord: approvalFor({ planRef: fixture.planRef }, review.data.version),
        expectedPlanningGeneration: generation,
        policyApproval: policyApproval()
      }
    },
    ctx(workspace)
  );
  assert.equal(accepted.ok, true, accepted.message);

  return { artifact, fixture, draft, review, accepted };
}

describe("finalize-plan-to-phase unified delivery (T100787)", () => {
  it("writes task refs to unified document delivery section and keeps status accepted", async () => {
    const workspace = await tmpWorkspace();
    const { fixture, accepted } = await prepareAcceptedUnifiedPlan(workspace);

    const preview = await planningModule.onCommand(
      {
        name: "finalize-plan-to-phase",
        args: {
          planId: fixture.planId,
          dryRun: true,
          targetPhaseKey: "140",
          targetPhase: "Phase 140",
          desiredStatus: "ready"
        }
      },
      ctx(workspace)
    );
    assert.equal(preview.ok, true, preview.message);
    assert.equal(preview.code, "plan-artifact-finalize-preview");

    const persisted = await planningModule.onCommand(
      {
        name: "finalize-plan-to-phase",
        args: {
          planId: fixture.planId,
          dryRun: false,
          targetPhaseKey: "140",
          targetPhase: "Phase 140",
          desiredStatus: "ready",
          expectedPlanningGeneration: accepted.data.planningGeneration,
          clientMutationId: `finalize-unified-${fixture.planId}`,
          policyApproval: policyApproval()
        }
      },
      ctx(workspace)
    );
    assert.equal(persisted.ok, true, persisted.message);
    assert.equal(persisted.code, "plan-artifact-finalize-persisted");
    assert.equal(persisted.data.status, "accepted");
    assert.equal(persisted.data.ideaPlanStatus, "accepted");

    const stored = readIdeaPlanArtifact(workspace, fixture.planRef);
    assert.ok(stored);
    assert.equal(stored.status, "accepted");
    assert.equal(stored.delivery?.phaseKey, "140");
    assert.ok((stored.delivery?.taskCount ?? 0) >= 1);
    assert.ok((stored.delivery?.taskRefs?.length ?? 0) >= 1);
    assert.ok(stored.delivery?.taskRefs?.every((taskId) => /^T[0-9]+$/.test(taskId)));

    const raw = JSON.parse(await readFile(path.join(workspace, persisted.data.storagePath), "utf8"));
    assert.equal(raw.status, "accepted");
    assert.ok(Array.isArray(raw.delivery?.taskRefs));
  });

  it("rejects finalize when unified document is not accepted", async () => {
    const workspace = await tmpWorkspace();
    const { idea, fixture } = await createIdeaWithUnifiedPlan(workspace, "planning-state.fixture.json");
    const started = await ideasModule.onCommand(
      {
        name: "start-idea-planning",
        args: { ideaId: idea.id, policyApproval: policyApproval() }
      },
      ctx(workspace)
    );
    assert.equal(started.ok, true);

    const artifact = freshDraftArtifact(loadFixture("plan-artifact-minimal.valid.v1.json"));
    artifact.provenance = {
      ...artifact.provenance,
      sourceIdeaId: idea.id,
      chatSessionRef: started.data.planningChatSession.sessionId
    };
    const generation = await planningGeneration(workspace);
    const draft = await planningModule.onCommand(
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
    assert.equal(draft.ok, true);

    const blocked = await planningModule.onCommand(
      {
        name: "finalize-plan-to-phase",
        args: { planId: fixture.planId, dryRun: true }
      },
      ctx(workspace)
    );
    assert.equal(blocked.ok, false);
    assert.equal(blocked.code, "idea-plan-status-invalid");
  });

  it("preserves backward-compatible argv shape for finalize-plan-to-phase", async () => {
    const workspace = await tmpWorkspace();
    const { fixture, accepted } = await prepareAcceptedUnifiedPlan(workspace);

    const preview = await planningModule.onCommand(
      {
        name: "finalize-plan-to-phase",
        args: {
          planId: fixture.planId,
          dryRun: true,
          targetPhaseKey: "140",
          desiredStatus: "ready"
        }
      },
      ctx(workspace)
    );
    assert.equal(preview.ok, true);
    assert.equal(preview.data.dryRun, true);
    assert.ok(Array.isArray(preview.data.taskPreview));

    const persisted = await planningModule.onCommand(
      {
        name: "finalize-plan-to-phase",
        args: {
          planId: fixture.planId,
          dryRun: false,
          targetPhaseKey: "140",
          desiredStatus: "ready",
          expectedPlanningGeneration: accepted.data.planningGeneration,
          policyApproval: policyApproval()
        }
      },
      ctx(workspace)
    );
    assert.equal(persisted.ok, true);
    assert.equal(persisted.data.dryRun, false);
    assert.ok(persisted.data.createdTasks);
  });
});
