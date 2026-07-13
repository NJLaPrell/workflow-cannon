/**
 * WP-5.2 / T100466 — accept-plan-artifact command wiring.
 */
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import { mkdir, mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import { planningModule } from "../dist/index.js";
import { readLatestPlanArtifact } from "../dist/core/planning/plan-artifact-storage.js";
import { readActiveDraftPlanArtifact } from "../dist/modules/planning/idea-plan/idea-planning-metadata.js";
import { getPlanningChatSession } from "../dist/modules/planning/idea-plan/planning-chat-session.js";
import { SqliteDualPlanningStore } from "../dist/modules/task-engine/persistence/sqlite-dual-planning.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixturesDir = path.join(repoRoot, "fixtures", "planning");
const SQLITE_CFG = { tasks: { persistenceBackend: "sqlite" } };

function loadFixture(name) {
  return JSON.parse(fs.readFileSync(path.join(fixturesDir, name), "utf8"));
}

function freshArtifact(base) {
  const planId = crypto.randomUUID();
  const doc = structuredClone(base);
  doc.planId = planId;
  doc.planRef = `plan-artifact:${planId}`;
  doc.version = 1;
  doc.status = "draft";
  return doc;
}

function approvalFor(artifact, version = 1) {
  return {
    schemaVersion: 1,
    confirmed: true,
    approvedVersion: version,
    approvedAt: "2026-05-27T08:00:00.000Z",
    approvedBy: "operator@example.com",
    planRef: artifact.planRef
  };
}

async function tmpWorkspace() {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "wk-plan-accept-"));
  await mkdir(path.join(workspace, ".workspace-kit", "tasks"), { recursive: true });
  return workspace;
}

function planningDb(workspace) {
  const dual = new SqliteDualPlanningStore(workspace, ".workspace-kit/tasks/workspace-kit.db");
  dual.loadFromDisk();
  return dual.getDatabase();
}

async function createIdea(workspace, args = {}) {
  const created = await planningModule.onCommand(
    {
      name: "create-idea",
      args: { title: "Accept test idea", policyApproval: { confirmed: true, rationale: "plan accept test create idea" }, ...args }
    },
    { runtimeVersion: "0.1", workspacePath: workspace, effectiveConfig: SQLITE_CFG }
  );
  assert.equal(created.ok, true, created.message);
  return created.data.idea;
}

async function startPlanning(workspace, ideaId) {
  const started = await planningModule.onCommand(
    {
      name: "start-idea-planning",
      args: { ideaId, policyApproval: { confirmed: true, rationale: "plan accept test start idea planning" } }
    },
    { runtimeVersion: "0.1", workspacePath: workspace, effectiveConfig: SQLITE_CFG }
  );
  assert.equal(started.ok, true, started.message);
  return started.data;
}

async function getIdea(workspace, ideaId) {
  const result = await planningModule.onCommand(
    { name: "get-idea", args: { ideaId } },
    { runtimeVersion: "0.1", workspacePath: workspace, effectiveConfig: SQLITE_CFG }
  );
  assert.equal(result.ok, true, result.message);
  return result.data.idea;
}

async function draftPersist(workspace, artifact) {
  const result = await planningModule.onCommand(
    {
      name: "draft-plan-artifact",
      args: {
        persist: true,
        artifact,
        expectedPlanningGeneration: 0,
        policyApproval: { confirmed: true, rationale: "plan-artifact-accept.test.mjs setup" }
      }
    },
    { runtimeVersion: "0.1", workspacePath: workspace, effectiveConfig: SQLITE_CFG }
  );
  assert.equal(result.ok, true, result.message);
  return result;
}

async function recordReview(workspace, planId, planningGeneration, extra = {}) {
  const result = await planningModule.onCommand(
    {
      name: "review-plan-artifact",
      args: {
        planId,
        recordReview: true,
        expectedPlanningGeneration: planningGeneration,
        policyApproval: { confirmed: true, rationale: "plan-artifact-accept.test.mjs review setup" },
        ...extra
      }
    },
    { runtimeVersion: "0.1", workspacePath: workspace, effectiveConfig: SQLITE_CFG }
  );
  assert.equal(result.ok, true, result.message);
  return result;
}

describe("accept-plan-artifact command (T100466)", () => {
  it("accepts latest reviewed plan after review is recorded", async () => {
    const workspace = await tmpWorkspace();
    const artifact = freshArtifact(loadFixture("plan-artifact-full-feature.valid.v1.json"));
    artifact.openQuestions = [];
    const draft = await draftPersist(workspace, artifact);
    const review = await recordReview(workspace, draft.data.planId, draft.data.planningGeneration ?? 0);

    const accept = await planningModule.onCommand(
      {
        name: "accept-plan-artifact",
        args: {
          planId: draft.data.planId,
          approvalRecord: approvalFor(artifact, review.data.version),
          expectedPlanningGeneration: review.data.planningGeneration ?? 0,
          policyApproval: { confirmed: true, rationale: "accept full-feature plan" }
        }
      },
      { runtimeVersion: "0.1", workspacePath: workspace, effectiveConfig: SQLITE_CFG }
    );
    assert.equal(accept.ok, true);
    assert.equal(accept.code, "plan-artifact-accepted");
    assert.equal(accept.data.status, "accepted");
    assert.equal(accept.data.approvalRecord.approvedVersion, review.data.version);
    assert.equal(accept.data.version, review.data.version + 1);

    const latest = readLatestPlanArtifact(workspace, draft.data.planId);
    assert.equal(latest?.status, "accepted");
    assert.equal(latest?.approvalRecord?.approvedVersion, review.data.version);
  });

  it("blocks accept when the latest version was never reviewed", async () => {
    const workspace = await tmpWorkspace();
    const artifact = freshArtifact(loadFixture("plan-artifact-full-feature.valid.v1.json"));
    artifact.openQuestions = [];
    const draft = await draftPersist(workspace, artifact);

    const accept = await planningModule.onCommand(
      {
        name: "accept-plan-artifact",
        args: {
          planId: draft.data.planId,
          approvalRecord: approvalFor(artifact, 1),
          expectedPlanningGeneration: draft.data.planningGeneration ?? 0,
          policyApproval: { confirmed: true, rationale: "should require review" }
        }
      },
      { runtimeVersion: "0.1", workspacePath: workspace, effectiveConfig: SQLITE_CFG }
    );
    assert.equal(accept.ok, false);
    assert.equal(accept.code, "plan-artifact-accept-blocked");
    assert.match(accept.message, /must be reviewed/i);
  });

  it("plan-artifact-accept-blocked when the reviewed version has blockers", async () => {
    const workspace = await tmpWorkspace();
    const artifact = freshArtifact(loadFixture("plan-artifact-review-blockers.v1.json"));
    const draft = await draftPersist(workspace, artifact);
    const review = await recordReview(workspace, draft.data.planId, draft.data.planningGeneration ?? 0, {
      profile: "full-feature"
    });
    assert.equal(review.code, "plan-artifact-review-blocked");

    const accept = await planningModule.onCommand(
      {
        name: "accept-plan-artifact",
        args: {
          planId: draft.data.planId,
          strict: false,
          approvalRecord: approvalFor(artifact, review.data.version),
          expectedPlanningGeneration: review.data.planningGeneration ?? 0,
          policyApproval: { confirmed: true, rationale: "should block" }
        }
      },
      { runtimeVersion: "0.1", workspacePath: workspace, effectiveConfig: SQLITE_CFG }
    );
    assert.equal(accept.ok, false);
    assert.equal(accept.code, "plan-artifact-accept-blocked");
    assert.ok((accept.data.blockerCount ?? 0) > 0);
  });

  it("blocks accept when open questions lack openQuestionsAccepted", async () => {
    const workspace = await tmpWorkspace();
    const artifact = freshArtifact(loadFixture("plan-artifact-review-warnings.v1.json"));
    const draft = await draftPersist(workspace, artifact);
    const review = await recordReview(workspace, draft.data.planId, draft.data.planningGeneration ?? 0, {
      profile: "minimal"
    });

    const accept = await planningModule.onCommand(
      {
        name: "accept-plan-artifact",
        args: {
          planId: draft.data.planId,
          approvalRecord: approvalFor(artifact, review.data.version),
          expectedPlanningGeneration: review.data.planningGeneration ?? 0,
          policyApproval: { confirmed: true, rationale: "missing OQ acceptance" }
        }
      },
      { runtimeVersion: "0.1", workspacePath: workspace, effectiveConfig: SQLITE_CFG }
    );
    assert.equal(accept.ok, false);
    assert.equal(accept.code, "plan-artifact-accept-blocked");
  });

  it("blocks accept when not all reviewed open questions are deferred", async () => {
    const workspace = await tmpWorkspace();
    const artifact = freshArtifact(loadFixture("plan-artifact-review-warnings.v1.json"));
    const draft = await draftPersist(workspace, artifact);
    const review = await recordReview(workspace, draft.data.planId, draft.data.planningGeneration ?? 0, {
      profile: "minimal"
    });
    const record = approvalFor(artifact, review.data.version);
    record.openQuestionsAccepted = ["Use strict accept on warnings?"];

    const accept = await planningModule.onCommand(
      {
        name: "accept-plan-artifact",
        args: {
          planId: draft.data.planId,
          approvalRecord: record,
          expectedPlanningGeneration: review.data.planningGeneration ?? 0,
          policyApproval: { confirmed: true, rationale: "partial OQ deferral should block" }
        }
      },
      { runtimeVersion: "0.1", workspacePath: workspace, effectiveConfig: SQLITE_CFG }
    );
    assert.equal(accept.ok, false);
    assert.equal(accept.code, "plan-artifact-accept-blocked");
    assert.deepEqual(accept.data.missingOpenQuestionsAccepted, ["Defer dashboard polish to phase 111?"]);
  });

  it("accepts warning-only reviewed plans with openQuestionsAccepted", async () => {
    const workspace = await tmpWorkspace();
    const artifact = freshArtifact(loadFixture("plan-artifact-review-warnings.v1.json"));
    const draft = await draftPersist(workspace, artifact);
    const review = await recordReview(workspace, draft.data.planId, draft.data.planningGeneration ?? 0, {
      profile: "minimal"
    });
    const record = approvalFor(artifact, review.data.version);
    record.openQuestionsAccepted = structuredClone(artifact.openQuestions);

    const accept = await planningModule.onCommand(
      {
        name: "accept-plan-artifact",
        args: {
          planId: draft.data.planId,
          approvalRecord: record,
          expectedPlanningGeneration: review.data.planningGeneration ?? 0,
          policyApproval: { confirmed: true, rationale: "accept with OQ deferral" }
        }
      },
      { runtimeVersion: "0.1", workspacePath: workspace, effectiveConfig: SQLITE_CFG }
    );
    assert.equal(accept.ok, true);
    assert.equal(accept.code, "plan-artifact-accepted");
    assert.ok(accept.data.approvalRecord.openQuestionsAccepted?.length > 0);
  });

  it("promotes accepted draft to linked plan, clears active draft, and completes session (T100759)", async () => {
    const workspace = await tmpWorkspace();
    const idea = await createIdea(workspace, { title: "Acceptance lifecycle idea", status: "planning" });
    const planning = await startPlanning(workspace, idea.id);
    const sessionId = planning.planningChatSession.sessionId;
    const artifact = freshArtifact(loadFixture("plan-artifact-full-feature.valid.v1.json"));
    artifact.openQuestions = [];
    artifact.provenance = {
      ...artifact.provenance,
      sourceIdeaId: idea.id,
      chatSessionRef: sessionId
    };
    const draft = await draftPersist(workspace, artifact);
    const review = await recordReview(workspace, draft.data.planId, draft.data.planningGeneration ?? 0);

    const accept = await planningModule.onCommand(
      {
        name: "accept-plan-artifact",
        args: {
          planId: draft.data.planId,
          approvalRecord: approvalFor(
            { ...artifact, planId: draft.data.planId, planRef: draft.data.planRef },
            review.data.version
          ),
          expectedPlanningGeneration: review.data.planningGeneration ?? 0,
          policyApproval: { confirmed: true, rationale: "accept lifecycle test plan" }
        }
      },
      { runtimeVersion: "0.1", workspacePath: workspace, effectiveConfig: SQLITE_CFG }
    );

    assert.equal(accept.ok, true, accept.message);
    assert.equal(accept.data.idea.status, "planned");
    assert.equal(accept.data.idea.linkedPlanArtifact, draft.data.planRef);
    assert.deepEqual(accept.data.idea.previousPlanArtifacts, []);
    assert.equal(accept.data.planningChatSession.status, "completed");
    assert.equal(accept.data.planningChatSession.currentPlanRef, draft.data.planRef);
    assert.equal(accept.data.planningChatSession.currentPlanVersion, accept.data.version);
    assert.ok(typeof accept.data.planningChatSession.completedAt === "string");

    const storedIdea = await getIdea(workspace, idea.id);
    assert.equal(storedIdea.status, "planned");
    assert.equal(storedIdea.linkedPlanArtifact, draft.data.planRef);
    assert.deepEqual(storedIdea.previousPlanArtifacts, []);
    assert.equal(readActiveDraftPlanArtifact(planningDb(workspace), idea.id), undefined);
    const storedSession = getPlanningChatSession(planningDb(workspace), idea.id);
    assert.equal(storedSession?.status, "completed");
    assert.equal(storedSession?.currentPlanRef, draft.data.planRef);
    assert.equal(storedSession?.currentPlanVersion, accept.data.version);
    assert.ok(typeof storedSession?.completedAt === "string");
  });

  it("preserves prior refs when a replanned draft becomes the linked plan (T100759)", async () => {
    const workspace = await tmpWorkspace();
    const idea = await createIdea(workspace, {
      title: "Replan acceptance idea",
      status: "planning",
      linkedPlanArtifact: "plan-artifact:accepted-plan",
      previousPlanArtifacts: ["plan-artifact:older-plan"]
    });
    const planning = await startPlanning(workspace, idea.id);
    const sessionId = planning.planningChatSession.sessionId;
    const artifact = freshArtifact(loadFixture("plan-artifact-full-feature.valid.v1.json"));
    artifact.openQuestions = [];
    artifact.provenance = {
      ...artifact.provenance,
      sourceIdeaId: idea.id,
      chatSessionRef: sessionId
    };
    const draft = await draftPersist(workspace, artifact);
    const review = await recordReview(workspace, draft.data.planId, draft.data.planningGeneration ?? 0);

    const accept = await planningModule.onCommand(
      {
        name: "accept-plan-artifact",
        args: {
          planId: draft.data.planId,
          approvalRecord: approvalFor(artifact, review.data.version),
          expectedPlanningGeneration: review.data.planningGeneration ?? 0,
          policyApproval: { confirmed: true, rationale: "accept replanned lifecycle test plan" }
        }
      },
      { runtimeVersion: "0.1", workspacePath: workspace, effectiveConfig: SQLITE_CFG }
    );

    assert.equal(accept.ok, true, accept.message);
    assert.equal(accept.data.idea.linkedPlanArtifact, draft.data.planRef);
    assert.deepEqual(accept.data.idea.previousPlanArtifacts, [
      "plan-artifact:older-plan",
      "plan-artifact:accepted-plan"
    ]);

    const storedIdea = await getIdea(workspace, idea.id);
    assert.equal(storedIdea.linkedPlanArtifact, draft.data.planRef);
    assert.deepEqual(storedIdea.previousPlanArtifacts, [
      "plan-artifact:older-plan",
      "plan-artifact:accepted-plan"
    ]);
    assert.equal(readActiveDraftPlanArtifact(planningDb(workspace), idea.id), undefined);
    assert.equal(getPlanningChatSession(planningDb(workspace), idea.id)?.status, "completed");
  });
});
