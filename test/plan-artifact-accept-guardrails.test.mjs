/**
 * WP-5.3 / T100467 — accept-plan-artifact guardrails (PLANNER_TEST_STRATEGY §5 B3, B8).
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

function approvalFor(artifact, version = 1, overrides = {}) {
  return {
    schemaVersion: 1,
    confirmed: true,
    approvedVersion: version,
    approvedAt: "2026-05-27T08:00:00.000Z",
    approvedBy: "operator@example.com",
    planRef: artifact.planRef,
    ...overrides
  };
}

async function tmpWorkspace() {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "wk-plan-accept-guard-"));
  await mkdir(path.join(workspace, ".workspace-kit", "tasks"), { recursive: true });
  return workspace;
}

async function draftPersist(workspace, artifact, extra = {}) {
  const result = await planningModule.onCommand(
    {
      name: "draft-plan-artifact",
      args: {
        persist: true,
        artifact,
        expectedPlanningGeneration: 0,
        policyApproval: { confirmed: true, rationale: "plan-artifact-accept-guardrails.test.mjs" },
        ...extra
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
        policyApproval: { confirmed: true, rationale: "plan-artifact-accept-guardrails.test.mjs review" },
        ...extra
      }
    },
    { runtimeVersion: "0.1", workspacePath: workspace, effectiveConfig: SQLITE_CFG }
  );
  assert.equal(result.ok, true, result.message);
  return result;
}

async function acceptPlan(workspace, args, planningGeneration = 0) {
  return planningModule.onCommand(
    {
      name: "accept-plan-artifact",
      args: {
        expectedPlanningGeneration: planningGeneration,
        policyApproval: { confirmed: true, rationale: "accept guardrails test" },
        ...args
      }
    },
    { runtimeVersion: "0.1", workspacePath: workspace, effectiveConfig: SQLITE_CFG }
  );
}

describe("accept-plan-artifact guardrails (T100467)", () => {
  it("B8: plan-artifact-version-mismatch when approvalRecord.approvedVersion ≠ loaded version", async () => {
    const workspace = await tmpWorkspace();
    const artifact = freshArtifact(loadFixture("plan-artifact-full-feature.valid.v1.json"));
    artifact.openQuestions = [];
    const draft = await draftPersist(workspace, artifact);

    const accept = await acceptPlan(workspace, {
      planId: draft.data.planId,
      approvalRecord: approvalFor(artifact, 99)
    }, draft.data.planningGeneration ?? 0);

    assert.equal(accept.ok, false);
    assert.equal(accept.code, "plan-artifact-version-mismatch");
    assert.equal(accept.data.approvedVersion, 99);
    assert.equal(accept.data.version, 1);
  });

  it("B8: plan-artifact-version-mismatch when requesting non-latest version", async () => {
    const workspace = await tmpWorkspace();
    const artifact = freshArtifact(loadFixture("plan-artifact-full-feature.valid.v1.json"));
    artifact.openQuestions = [];
    const first = await draftPersist(workspace, artifact);

    const secondBody = structuredClone(artifact);
    delete secondBody.version;
    secondBody.identity = { ...secondBody.identity, summary: "second draft bump" };
    const second = await draftPersist(workspace, secondBody, {
      expectedPlanningGeneration: first.data.planningGeneration
    });

    const accept = await acceptPlan(
      workspace,
      {
        planId: first.data.planId,
        version: 1,
        approvalRecord: approvalFor(artifact, 1)
      },
      second.data.planningGeneration ?? 0
    );

    assert.equal(accept.ok, false);
    assert.equal(accept.code, "plan-artifact-version-mismatch");
    assert.equal(accept.data.latestVersion, 2);
    assert.equal(accept.data.version, 1);
  });

  it("rejects approvalRecord.planRef mismatch", async () => {
    const workspace = await tmpWorkspace();
    const artifact = freshArtifact(loadFixture("plan-artifact-full-feature.valid.v1.json"));
    artifact.openQuestions = [];
    const draft = await draftPersist(workspace, artifact);
    const record = approvalFor(artifact, 1);
    record.planRef = "plan-artifact:00000000-0000-0000-0000-000000000000";

    const accept = await acceptPlan(
      workspace,
      { planId: draft.data.planId, approvalRecord: record },
      draft.data.planningGeneration ?? 0
    );

    assert.equal(accept.ok, false);
    assert.equal(accept.code, "plan-artifact-schema-invalid");
    assert.ok(accept.data.missingFields?.includes("approvalRecord.planRef"));
  });

  it("clientMutationId replay returns plan-artifact-accept-idempotent-replay", async () => {
    const workspace = await tmpWorkspace();
    const artifact = freshArtifact(loadFixture("plan-artifact-full-feature.valid.v1.json"));
    artifact.openQuestions = [];
    const draft = await draftPersist(workspace, artifact);
    const review = await recordReview(workspace, draft.data.planId, draft.data.planningGeneration ?? 0);
    const record = approvalFor(artifact, review.data.version);
    const clientMutationId = `accept-${crypto.randomUUID()}`;
    let gen = review.data.planningGeneration ?? 0;

    const first = await acceptPlan(
      workspace,
      { planId: draft.data.planId, approvalRecord: record, clientMutationId },
      gen
    );
    assert.equal(first.ok, true);
    assert.equal(first.code, "plan-artifact-accepted");
    gen = first.data.planningGeneration ?? gen + 1;

    const second = await acceptPlan(
      workspace,
      { planId: draft.data.planId, approvalRecord: record, clientMutationId },
      gen
    );
    assert.equal(second.ok, true);
    assert.equal(second.code, "plan-artifact-accept-idempotent-replay");
    assert.equal(second.data.replayed, true);
    assert.equal(second.data.version, first.data.version);
  });

  it("idempotency-key-conflict when clientMutationId reused with different payload", async () => {
    const workspace = await tmpWorkspace();
    const artifact = freshArtifact(loadFixture("plan-artifact-full-feature.valid.v1.json"));
    artifact.openQuestions = [];
    const draft = await draftPersist(workspace, artifact);
    const review = await recordReview(workspace, draft.data.planId, draft.data.planningGeneration ?? 0);
    const clientMutationId = `accept-conflict-${crypto.randomUUID()}`;
    let gen = review.data.planningGeneration ?? 0;

    const first = await acceptPlan(
      workspace,
      {
        planId: draft.data.planId,
        approvalRecord: approvalFor(artifact, review.data.version),
        clientMutationId
      },
      gen
    );
    assert.equal(first.ok, true);
    gen = first.data.planningGeneration ?? gen + 1;

    const conflict = await acceptPlan(
      workspace,
      {
        planId: draft.data.planId,
        approvalRecord: approvalFor(artifact, review.data.version, { approvedBy: "someone-else@example.com" }),
        clientMutationId
      },
      gen
    );
    assert.equal(conflict.ok, false);
    assert.equal(conflict.code, "idempotency-key-conflict");
  });

  it("re-accept same approval on already-accepted latest is idempotent replay", async () => {
    const workspace = await tmpWorkspace();
    const artifact = freshArtifact(loadFixture("plan-artifact-full-feature.valid.v1.json"));
    artifact.openQuestions = [];
    const draft = await draftPersist(workspace, artifact);
    const review = await recordReview(workspace, draft.data.planId, draft.data.planningGeneration ?? 0);
    const record = approvalFor(artifact, review.data.version);
    let gen = review.data.planningGeneration ?? 0;

    const first = await acceptPlan(
      workspace,
      { planId: draft.data.planId, approvalRecord: record },
      gen
    );
    assert.equal(first.code, "plan-artifact-accepted");
    assert.equal(first.data.version, review.data.version + 1);
    gen = first.data.planningGeneration ?? gen + 1;

    const latest = readLatestPlanArtifact(workspace, draft.data.planId);
    assert.ok(latest?.approvalRecord);
    const replay = await acceptPlan(
      workspace,
      {
        planId: draft.data.planId,
        approvalRecord: approvalFor(artifact, latest.approvalRecord.approvedVersion, {
          approvedAt: latest.approvalRecord.approvedAt,
          approvedBy: latest.approvalRecord.approvedBy,
          ...(latest.approvalRecord.reviewSummary
            ? { reviewSummary: latest.approvalRecord.reviewSummary }
            : {}),
          ...(latest.approvalRecord.openQuestionsAccepted
            ? { openQuestionsAccepted: latest.approvalRecord.openQuestionsAccepted }
            : {})
        })
      },
      gen
    );
    assert.equal(replay.ok, true);
    assert.equal(replay.code, "plan-artifact-accept-idempotent-replay");
    assert.equal(replay.data.version, first.data.version);

    const stillLatest = readLatestPlanArtifact(workspace, draft.data.planId);
    assert.equal(stillLatest?.version, first.data.version);
  });

  it("B3: warning-only reviewed plans can be accepted", async () => {
    const workspace = await tmpWorkspace();
    const artifact = freshArtifact(loadFixture("plan-artifact-review-warnings.v1.json"));
    const draft = await draftPersist(workspace, artifact);
    const review = await recordReview(workspace, draft.data.planId, draft.data.planningGeneration ?? 0, {
      profile: "minimal"
    });
    const record = approvalFor(artifact, review.data.version);
    record.openQuestionsAccepted = structuredClone(artifact.openQuestions);

    const accept = await acceptPlan(
      workspace,
      {
        planId: draft.data.planId,
        approvalRecord: record
      },
      review.data.planningGeneration ?? 0
    );

    assert.equal(accept.ok, true);
    assert.equal(accept.code, "plan-artifact-accepted");
  });
});
