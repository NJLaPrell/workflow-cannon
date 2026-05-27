/**
 * WP-6.4 / T100471 — finalize-plan-to-phase dry-run preview.
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

/** Satisfy ux-cae-pre-persist batch gap heuristics for preview tests. */
function enrichWbsForBatchReview(artifact) {
  const tail =
    "rollback activation toggle empty first-run unit test verification coverage";
  for (const row of artifact.wbs) {
    row.generatedTaskPayload.technicalScope.push(tail);
    row.generatedTaskPayload.acceptanceCriteria.push(
      "Observable verification with rollback and empty first-run behavior"
    );
  }
}

async function tmpWorkspace() {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "wk-plan-finalize-"));
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
        policyApproval: { confirmed: true, rationale: "finalize preview test setup" }
      }
    },
    { runtimeVersion: "0.1", workspacePath: workspace, effectiveConfig: SQLITE_CFG }
  );
  assert.equal(result.ok, true, result.message);
  return result;
}

async function acceptPlan(workspace, planId, artifact, planningGeneration) {
  const result = await planningModule.onCommand(
    {
      name: "accept-plan-artifact",
      args: {
        planId,
        approvalRecord: approvalFor(artifact, 1),
        expectedPlanningGeneration: planningGeneration,
        policyApproval: { confirmed: true, rationale: "accept for finalize preview test" }
      }
    },
    { runtimeVersion: "0.1", workspacePath: workspace, effectiveConfig: SQLITE_CFG }
  );
  assert.equal(result.ok, true, result.message);
  return result;
}

describe("finalize-plan-to-phase dry-run (T100471)", () => {
  it("B4: plan-artifact-not-accepted when plan is still draft", async () => {
    const workspace = await tmpWorkspace();
    const artifact = freshArtifact(loadFixture("plan-artifact-full-feature.valid.v1.json"));
    const draft = await draftPersist(workspace, artifact);

    const preview = await planningModule.onCommand(
      {
        name: "finalize-plan-to-phase",
        args: { planId: draft.data.planId, dryRun: true }
      },
      { runtimeVersion: "0.1", workspacePath: workspace, effectiveConfig: SQLITE_CFG }
    );
    assert.equal(preview.ok, false);
    assert.equal(preview.code, "plan-artifact-not-accepted");
  });

  it("returns plan-artifact-finalize-preview for accepted full-feature plan", async () => {
    const workspace = await tmpWorkspace();
    const artifact = freshArtifact(loadFixture("plan-artifact-full-feature.valid.v1.json"));
    artifact.openQuestions = [];
    enrichWbsForBatchReview(artifact);
    const draft = await draftPersist(workspace, artifact);
    const accepted = await acceptPlan(
      workspace,
      draft.data.planId,
      artifact,
      draft.data.planningGeneration ?? 0
    );

    const preview = await planningModule.onCommand(
      {
        name: "finalize-plan-to-phase",
        args: {
          planId: draft.data.planId,
          dryRun: true,
          targetPhaseKey: "110",
          targetPhase: "Phase 110",
          desiredStatus: "ready"
        }
      },
      { runtimeVersion: "0.1", workspacePath: workspace, effectiveConfig: SQLITE_CFG }
    );
    assert.equal(preview.ok, true, preview.message);
    assert.equal(preview.code, "plan-artifact-finalize-preview");
    assert.equal(preview.data.phaseKey, "110");
    assert.ok(Array.isArray(preview.data.taskPreview));
    assert.equal(preview.data.taskPreview.length, artifact.wbs.length);
    assert.equal(preview.data.review.passed, true);
    assert.equal(accepted.data.version, 2);
  });
});
