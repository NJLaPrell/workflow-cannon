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

describe("accept-plan-artifact command (T100466)", () => {
  it("accepts full-feature plan after draft persist", async () => {
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
          policyApproval: { confirmed: true, rationale: "accept full-feature plan" }
        }
      },
      { runtimeVersion: "0.1", workspacePath: workspace, effectiveConfig: SQLITE_CFG }
    );
    assert.equal(accept.ok, true);
    assert.equal(accept.code, "plan-artifact-accepted");
    assert.equal(accept.data.status, "accepted");
    assert.equal(accept.data.approvalRecord.approvedVersion, 1);
    assert.equal(accept.data.version, 2);

    const latest = readLatestPlanArtifact(workspace, draft.data.planId);
    assert.equal(latest?.status, "accepted");
    assert.equal(latest?.approvalRecord?.approvedVersion, 1);
  });

  it("plan-artifact-accept-blocked when strict and review has blockers", async () => {
    const workspace = await tmpWorkspace();
    const artifact = freshArtifact(loadFixture("plan-artifact-review-blockers.v1.json"));
    const draft = await draftPersist(workspace, artifact);

    const accept = await planningModule.onCommand(
      {
        name: "accept-plan-artifact",
        args: {
          planId: draft.data.planId,
          strict: true,
          approvalRecord: approvalFor(artifact, 1),
          expectedPlanningGeneration: draft.data.planningGeneration ?? 0,
          policyApproval: { confirmed: true, rationale: "should block" }
        }
      },
      { runtimeVersion: "0.1", workspacePath: workspace, effectiveConfig: SQLITE_CFG }
    );
    assert.equal(accept.ok, false);
    assert.equal(accept.code, "plan-artifact-accept-blocked");
    assert.ok(accept.data.blockers?.length > 0);
  });

  it("blocks accept when open questions lack openQuestionsAccepted", async () => {
    const workspace = await tmpWorkspace();
    const artifact = freshArtifact(loadFixture("plan-artifact-review-warnings.v1.json"));
    const draft = await draftPersist(workspace, artifact);

    const accept = await planningModule.onCommand(
      {
        name: "accept-plan-artifact",
        args: {
          planId: draft.data.planId,
          strict: false,
          approvalRecord: approvalFor(artifact, 1),
          expectedPlanningGeneration: draft.data.planningGeneration ?? 0,
          policyApproval: { confirmed: true, rationale: "missing OQ acceptance" }
        }
      },
      { runtimeVersion: "0.1", workspacePath: workspace, effectiveConfig: SQLITE_CFG }
    );
    assert.equal(accept.ok, false);
    assert.equal(accept.code, "plan-artifact-accept-blocked");
  });

  it("accepts with openQuestionsAccepted", async () => {
    const workspace = await tmpWorkspace();
    const artifact = freshArtifact(loadFixture("plan-artifact-review-warnings.v1.json"));
    const draft = await draftPersist(workspace, artifact);
    const record = approvalFor(artifact, 1);
    record.openQuestionsAccepted = ["Use strict accept on warnings?"];

    const accept = await planningModule.onCommand(
      {
        name: "accept-plan-artifact",
        args: {
          planId: draft.data.planId,
          strict: false,
          approvalRecord: record,
          expectedPlanningGeneration: draft.data.planningGeneration ?? 0,
          policyApproval: { confirmed: true, rationale: "accept with OQ deferral" }
        }
      },
      { runtimeVersion: "0.1", workspacePath: workspace, effectiveConfig: SQLITE_CFG }
    );
    assert.equal(accept.ok, true);
    assert.equal(accept.code, "plan-artifact-accepted");
    assert.ok(accept.data.approvalRecord.openQuestionsAccepted?.length > 0);
  });
});
