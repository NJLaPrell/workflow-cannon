/**
 * T100786 — unified IdeaPlan document integration for review-plan-artifact and accept-plan-artifact.
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
import { reviewPlanArtifact } from "../dist/core/planning/review-plan-artifact.js";
import { getPlanArtifactStoragePaths } from "../dist/core/planning/plan-artifact-storage.js";
import {
  isIdeaPlanDocument,
  readIdeaPlanArtifact
} from "../dist/modules/ideas/idea-plan-artifact-storage.js";
import { synthesizePlanArtifactFromStoredDocument } from "../dist/modules/ideas/idea-plan-planning-init.js";

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
  const workspace = await mkdtemp(path.join(os.tmpdir(), "wk-unified-review-accept-"));
  await mkdir(path.join(workspace, ".workspace-kit", "tasks"), { recursive: true });
  return workspace;
}

function ctx(workspace) {
  return { runtimeVersion: "0.1", workspacePath: workspace, effectiveConfig: SQLITE_CFG };
}

function policyApproval() {
  return { confirmed: true, rationale: "unified-idea-plan-review-accept.test.mjs" };
}

async function writeIdeaPlanFixture(workspace, fixtureName, ideaId) {
  const fixtureTemplate = loadIdeaFixture(fixtureName);
  const fixture = { ...fixtureTemplate, ideaId };
  const paths = getPlanArtifactStoragePaths(workspace, fixture.planId);
  await mkdir(paths.planDirAbsolute, { recursive: true });
  await writeFile(paths.artifactFileAbsolute(fixture.version), `${JSON.stringify(fixture, null, 2)}\n`, "utf8");
  return fixture;
}

async function planningGeneration(workspace) {
  return (await ideasModule.onCommand({ name: "list-ideas", args: {} }, ctx(workspace))).data.planningGeneration;
}

async function createIdeaWithUnifiedPlan(workspace, fixtureName) {
  const created = await ideasModule.onCommand(
    {
      name: "create-idea",
      args: { title: "Unified review accept idea", policyApproval: policyApproval() }
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

async function draftUnifiedPlan(workspace, idea, fixture, sessionId) {
  const artifact = freshDraftArtifact(loadFixture("plan-artifact-minimal.valid.v1.json"));
  artifact.provenance = {
    ...artifact.provenance,
    sourceIdeaId: idea.id,
    chatSessionRef: sessionId
  };
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
  assert.equal(result.ok, true, result.message);
  return { artifact, result };
}

function approvalFor(planRef, version, approvedBy = "operator@example.com") {
  return {
    schemaVersion: 1,
    confirmed: true,
    approvedVersion: version,
    approvedAt: "2026-07-02T14:00:00.000Z",
    approvedBy,
    planRef
  };
}

describe("unified IdeaPlan review/accept commands (T100786)", () => {
  it("review-plan-artifact transitions planning→reviewed on unified document", async () => {
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
    const { result: draft } = await draftUnifiedPlan(
      workspace,
      idea,
      fixture,
      started.data.planningChatSession.sessionId
    );

    const generation = await planningGeneration(workspace);
    const review = await planningModule.onCommand(
      {
        name: "review-plan-artifact",
        args: {
          planId: fixture.planId,
          recordReview: true,
          expectedPlanningGeneration: generation,
          policyApproval: policyApproval()
        }
      },
      ctx(workspace)
    );
    assert.equal(review.ok, true, review.message);
    assert.equal(review.code, "plan-artifact-review-complete");

    const stored = readIdeaPlanArtifact(workspace, fixture.planRef);
    assert.ok(stored);
    assert.equal(stored.status, "reviewed");
    assert.equal(stored.review?.passed, true);
    assert.ok(stored.review?.reviewedAt);
    assert.equal(stored.version, draft.data.version + 1);
  });

  it("review-plan-artifact rejects recordReview when unified document status is not planning", async () => {
    const workspace = await tmpWorkspace();
    const { idea, fixture } = await createIdeaWithUnifiedPlan(workspace, "planning-state.fixture.json");
    const started = await ideasModule.onCommand(
      {
        name: "start-idea-planning",
        args: { ideaId: idea.id, policyApproval: policyApproval() }
      },
      ctx(workspace)
    );
    await draftUnifiedPlan(workspace, idea, fixture, started.data.planningChatSession.sessionId);

    const generation = await planningGeneration(workspace);
    const firstReview = await planningModule.onCommand(
      {
        name: "review-plan-artifact",
        args: {
          planId: fixture.planId,
          recordReview: true,
          expectedPlanningGeneration: generation,
          policyApproval: policyApproval()
        }
      },
      ctx(workspace)
    );
    assert.equal(firstReview.ok, true);

    const blocked = await planningModule.onCommand(
      {
        name: "review-plan-artifact",
        args: {
          planId: fixture.planId,
          recordReview: true,
          expectedPlanningGeneration: await planningGeneration(workspace),
          policyApproval: policyApproval()
        }
      },
      ctx(workspace)
    );
    assert.equal(blocked.ok, false);
    assert.equal(blocked.code, "idea-plan-status-invalid");
  });

  it("accept-plan-artifact transitions reviewed→accepted on unified document", async () => {
    const workspace = await tmpWorkspace();
    const { idea, fixture } = await createIdeaWithUnifiedPlan(workspace, "planning-state.fixture.json");
    const started = await ideasModule.onCommand(
      {
        name: "start-idea-planning",
        args: { ideaId: idea.id, policyApproval: policyApproval() }
      },
      ctx(workspace)
    );
    await draftUnifiedPlan(workspace, idea, fixture, started.data.planningChatSession.sessionId);

    let generation = await planningGeneration(workspace);
    const review = await planningModule.onCommand(
      {
        name: "review-plan-artifact",
        args: {
          planId: fixture.planId,
          recordReview: true,
          expectedPlanningGeneration: generation,
          policyApproval: policyApproval()
        }
      },
      ctx(workspace)
    );
    assert.equal(review.ok, true);

    generation = await planningGeneration(workspace);
    const accept = await planningModule.onCommand(
      {
        name: "accept-plan-artifact",
        args: {
          planId: fixture.planId,
          approvalRecord: approvalFor(fixture.planRef, review.data.version),
          expectedPlanningGeneration: generation,
          policyApproval: policyApproval()
        }
      },
      ctx(workspace)
    );
    assert.equal(accept.ok, true, accept.message);
    assert.equal(accept.code, "plan-artifact-accepted");

    const stored = readIdeaPlanArtifact(workspace, fixture.planRef);
    assert.ok(stored);
    assert.equal(stored.status, "accepted");
    assert.equal(stored.acceptance?.acceptedVersion, review.data.version);
    assert.equal(stored.acceptance?.acceptedBy, "operator@example.com");
  });

  it("rubric identifies missing goal coverage from unified document goals array", async () => {
    const workspace = await tmpWorkspace();
    const { fixture } = await createIdeaWithUnifiedPlan(workspace, "planning-state.fixture.json");
    const artifact = freshDraftArtifact(loadFixture("plan-artifact-minimal.valid.v1.json"));
    artifact.goals = ["Ship unified review", "Preserve argv shapes"];
    artifact.wbs = artifact.wbs.map((row, index) =>
      index === 0 ? { ...row, goalMapping: ["Ship unified review"] } : row
    );

    const paths = getPlanArtifactStoragePaths(workspace, fixture.planId);
    const unified = {
      ...loadIdeaFixture("planning-state.fixture.json"),
      planId: fixture.planId,
      planRef: fixture.planRef,
      ideaId: fixture.ideaId,
      ...artifact,
      status: "planning",
      plan: {
        title: artifact.identity.title,
        summary: artifact.identity.summary ?? "summary",
        planningType: artifact.identity.planningType,
        wbsRowCount: artifact.wbs.length
      }
    };
    await writeFile(paths.artifactFileAbsolute(fixture.version), `${JSON.stringify(unified, null, 2)}\n`, "utf8");

    const synthesized = synthesizePlanArtifactFromStoredDocument(
      workspace,
      fixture.planId,
      fixture.version,
      artifact
    );
    const review = reviewPlanArtifact(synthesized, { profile: "refactor" });
    assert.equal(review.passed, false);
    assert.ok(review.blockers.some((finding) => finding.code === "RUBRIC-COV-GOAL"));
    assert.ok(review.coverageMap.goals.uncovered.includes("Preserve argv shapes"));
  });

  it("preserves backward-compatible argv shapes for review and accept", async () => {
    const workspace = await tmpWorkspace();
    const { idea, fixture } = await createIdeaWithUnifiedPlan(workspace, "planning-state.fixture.json");
    const started = await ideasModule.onCommand(
      {
        name: "start-idea-planning",
        args: { ideaId: idea.id, policyApproval: policyApproval() }
      },
      ctx(workspace)
    );
    const { artifact } = await draftUnifiedPlan(workspace, idea, fixture, started.data.planningChatSession.sessionId);

    const validateOnly = await planningModule.onCommand(
      {
        name: "review-plan-artifact",
        args: { planId: fixture.planId, profile: "minimal" }
      },
      ctx(workspace)
    );
    assert.equal(validateOnly.ok, true);
    assert.equal(validateOnly.data.recordReview, false);

    const inlineReview = await planningModule.onCommand(
      {
        name: "review-plan-artifact",
        args: { artifact, profile: "minimal" }
      },
      ctx(workspace)
    );
    assert.equal(inlineReview.ok, true);

    let generation = await planningGeneration(workspace);
    const review = await planningModule.onCommand(
      {
        name: "review-plan-artifact",
        args: {
          planId: fixture.planId,
          recordReview: true,
          expectedPlanningGeneration: generation,
          policyApproval: policyApproval()
        }
      },
      ctx(workspace)
    );
    assert.equal(review.ok, true);

    generation = await planningGeneration(workspace);
    const accept = await planningModule.onCommand(
      {
        name: "accept-plan-artifact",
        args: {
          planId: fixture.planId,
          approvalRecord: approvalFor(fixture.planRef, review.data.version),
          expectedPlanningGeneration: generation,
          policyApproval: policyApproval()
        }
      },
      ctx(workspace)
    );
    assert.equal(accept.ok, true);

    const storedRaw = JSON.parse(
      await readFile(path.join(workspace, accept.data.storagePath), "utf8")
    );
    assert.equal(isIdeaPlanDocument(storedRaw), true);
  });
});
