/**
 * WP-6.3 / T100471 — finalize-plan-to-phase dry-run preview handler.
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

function freshAcceptedCandidate() {
  const planId = crypto.randomUUID();
  const doc = structuredClone(loadFixture("plan-artifact-full-feature.valid.v1.json"));
  doc.planId = planId;
  doc.planRef = `plan-artifact:${planId}`;
  doc.version = 1;
  doc.status = "draft";
  doc.openQuestions = [];
  doc.wbs[0].generatedTaskPayload.acceptanceCriteria.push(
    "Unit tests verify schema output and rollback activation notes are preserved",
    "Empty first-run workspace preview returns no-data guidance without writes"
  );
  doc.wbs[1].generatedTaskPayload.acceptanceCriteria.push(
    "Extension tests cover activation fallback, rollback, and blank workspace state"
  );
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
  const workspace = await mkdtemp(path.join(os.tmpdir(), "wk-plan-finalize-"));
  await mkdir(path.join(workspace, ".workspace-kit", "tasks"), { recursive: true });
  return workspace;
}

async function draftAndAccept(workspace, artifact) {
  const draft = await planningModule.onCommand(
    {
      name: "draft-plan-artifact",
      args: {
        persist: true,
        artifact,
        expectedPlanningGeneration: 0,
        policyApproval: { confirmed: true, rationale: "finalize dry-run setup" }
      }
    },
    { runtimeVersion: "0.1", workspacePath: workspace, effectiveConfig: SQLITE_CFG }
  );
  assert.equal(draft.ok, true, draft.message);

  const accept = await planningModule.onCommand(
    {
      name: "accept-plan-artifact",
      args: {
        planId: artifact.planId,
        approvalRecord: approvalFor(artifact, 1),
        expectedPlanningGeneration: draft.data.planningGeneration ?? 0,
        policyApproval: { confirmed: true, rationale: "accept finalize dry-run fixture" }
      }
    },
    { runtimeVersion: "0.1", workspacePath: workspace, effectiveConfig: SQLITE_CFG }
  );
  assert.equal(accept.ok, true, accept.message);
  return accept;
}

describe("finalize-plan-to-phase dry-run (T100471)", () => {
  it("previews accepted PlanArtifact WBS as reviewed task drafts without persisting", async () => {
    const workspace = await tmpWorkspace();
    const artifact = freshAcceptedCandidate();
    const accepted = await draftAndAccept(workspace, artifact);

    const preview = await planningModule.onCommand(
      {
        name: "finalize-plan-to-phase",
        args: {
          planId: artifact.planId,
          dryRun: true,
          targetPhaseKey: "710",
          targetPhase: "Phase 710",
          desiredStatus: "ready"
        }
      },
      { runtimeVersion: "0.1", workspacePath: workspace, effectiveConfig: SQLITE_CFG }
    );

    assert.equal(preview.ok, true, preview.message);
    assert.equal(preview.code, "plan-artifact-finalize-preview");
    assert.equal(preview.data.planId, artifact.planId);
    assert.equal(preview.data.version, accepted.data.version);
    assert.equal(preview.data.phaseKey, "710");
    assert.equal(preview.data.persisted, false);
    assert.equal(preview.data.review.status, "pass");
    assert.equal(preview.data.taskPreview.length, 2);
    assert.match(preview.data.taskPreview[0].id, /^T\d+$/);
    assert.equal(preview.data.taskPreview[0].status, "ready");
    assert.equal(preview.data.taskPreview[0].phaseKey, "710");
    assert.equal(preview.data.taskPreview[0].metadata.planRef, artifact.planRef);
    assert.equal(preview.data.taskPreview[0].metadata.planningProvenance.wbsId, "WBS-1");
    assert.deepEqual(preview.data.taskPreview[1].dependsOn, [preview.data.taskPreview[0].id]);

    const latest = readLatestPlanArtifact(workspace, artifact.planId);
    assert.equal(latest?.status, "accepted");
  });

  it("blocks draft artifacts before preview", async () => {
    const workspace = await tmpWorkspace();
    const artifact = freshAcceptedCandidate();
    const draft = await planningModule.onCommand(
      {
        name: "draft-plan-artifact",
        args: {
          persist: true,
          artifact,
          expectedPlanningGeneration: 0,
          policyApproval: { confirmed: true, rationale: "finalize draft block setup" }
        }
      },
      { runtimeVersion: "0.1", workspacePath: workspace, effectiveConfig: SQLITE_CFG }
    );
    assert.equal(draft.ok, true, draft.message);

    const preview = await planningModule.onCommand(
      { name: "finalize-plan-to-phase", args: { planId: artifact.planId, dryRun: true } },
      { runtimeVersion: "0.1", workspacePath: workspace, effectiveConfig: SQLITE_CFG }
    );
    assert.equal(preview.ok, false);
    assert.equal(preview.code, "plan-artifact-not-accepted");
  });
});