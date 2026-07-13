/**
 * T100864 — merge contract gate: standalone PlanArtifact CLI path without Ideas row (dual-shim T100863).
 * Re-run mandatory after WBS-7 (T100822 list-ideas MCP) and WBS-10 (T100825 finalize-preview-packet MCP).
 */
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import { mkdir, mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import { runCli } from "../dist/cli.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixturesDir = path.join(repoRoot, "fixtures", "planning");
const ideasFixturesDir = path.join(repoRoot, "fixtures", "ideas");
const firstRunFixture = JSON.parse(
  fs.readFileSync(path.join(ideasFixturesDir, "empty-inventory-first-run.fixture.json"), "utf8")
);

/** Frozen standalone PlanArtifact CLI success/error codes. */
const FROZEN_STANDALONE_CODES = {
  "draft-plan-artifact": "plan-artifact-draft-persisted",
  "review-plan-artifact": "plan-artifact-review-complete",
  "accept-plan-artifact": "plan-artifact-accepted",
  "finalize-plan-to-phase-preview": "plan-artifact-finalize-preview",
  "finalize-plan-to-phase-persisted": "plan-artifact-finalize-persisted",
  "finalize-plan-to-phase-blocked": "plan-artifact-not-accepted",
  "list-ideas": "ideas-listed"
};

function createCapture() {
  const lines = [];
  const errors = [];
  return {
    lines,
    errors,
    writeLine(message) {
      lines.push(message);
    },
    writeError(message) {
      errors.push(message);
    }
  };
}

function loadFixture(name) {
  return JSON.parse(fs.readFileSync(path.join(fixturesDir, name), "utf8"));
}

function freshArtifact(base) {
  const planId = crypto.randomUUID();
  const artifact = structuredClone(base);
  artifact.planId = planId;
  artifact.planRef = `plan-artifact:${planId}`;
  artifact.version = 1;
  artifact.status = "draft";
  return artifact;
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
  const workspace = await mkdtemp(path.join(os.tmpdir(), "wk-plan-e2e-cli-"));
  await mkdir(path.join(workspace, ".workspace-kit", "tasks"), { recursive: true });
  return workspace;
}

async function runWk(workspace, command, args, expectedExitCode = 0) {
  const capture = createCapture();
  const exitCode = await runCli(["run", command, JSON.stringify(args)], { cwd: workspace, ...capture });
  assert.equal(
    exitCode,
    expectedExitCode,
    [...capture.errors, ...capture.lines].join("\n")
  );
  assert.ok(capture.lines.length > 0, `expected ${command} to emit JSON`);
  return JSON.parse(capture.lines.at(-1));
}

describe("PlanArtifact CLI E2E merge contract gate (T100864)", () => {
  it("standalone draft persists without Ideas row and leaves inventory empty", async () => {
    const workspace = await tmpWorkspace();
    const artifact = freshArtifact(loadFixture("plan-artifact-minimal.valid.v1.json"));
    assert.equal(artifact.ideaId, undefined, "fixture must not carry ideaId for standalone contract");

    const listedBefore = await runWk(workspace, "list-ideas", {});
    assert.equal(listedBefore.code, FROZEN_STANDALONE_CODES["list-ideas"]);
    assert.equal(listedBefore.data.count, firstRunFixture.listIdeas.emptyInventory.count);

    const draft = await runWk(workspace, "draft-plan-artifact", {
      persist: true,
      artifact,
      expectedPlanningGeneration: 0,
      policyApproval: { confirmed: true, rationale: "standalone PlanArtifact contract draft" }
    });
    assert.equal(draft.ok, true, draft.message);
    assert.equal(draft.code, FROZEN_STANDALONE_CODES["draft-plan-artifact"]);

    const listedAfter = await runWk(workspace, "list-ideas", {});
    assert.equal(listedAfter.code, FROZEN_STANDALONE_CODES["list-ideas"]);
    assert.equal(listedAfter.data.count, firstRunFixture.listIdeas.emptyInventory.count);
    assert.deepEqual(listedAfter.data.ideas, firstRunFixture.listIdeas.emptyInventory.ideas);
  });

  it("drafts, reviews, accepts, finalizes, and lists ready tasks", async () => {
    const workspace = await tmpWorkspace();
    const artifact = freshArtifact(loadFixture("plan-artifact-full-feature.valid.v1.json"));
    artifact.openQuestions = [];
    enrichWbsForBatchReview(artifact);
    assert.equal(artifact.ideaId, undefined, "standalone golden path must not require Ideas row");

    const draft = await runWk(workspace, "draft-plan-artifact", {
      persist: true,
      artifact,
      expectedPlanningGeneration: 0,
      policyApproval: { confirmed: true, rationale: "PlanArtifact CLI E2E draft" }
    });
    assert.equal(draft.ok, true, draft.message);
    assert.equal(draft.code, FROZEN_STANDALONE_CODES["draft-plan-artifact"]);

    const review = await runWk(workspace, "review-plan-artifact", {
      planId: draft.data.planId,
      profile: "minimal",
      recordReview: true,
      expectedPlanningGeneration: draft.data.planningGeneration,
      policyApproval: { confirmed: true, rationale: "PlanArtifact CLI E2E review" }
    });
    assert.equal(review.ok, true, review.message);
    assert.equal(review.code, FROZEN_STANDALONE_CODES["review-plan-artifact"]);
    assert.equal(review.data.passed, true);
    assert.equal(review.data.status, "reviewed");

    const accepted = await runWk(workspace, "accept-plan-artifact", {
      planId: draft.data.planId,
      approvalRecord: approvalFor(artifact, review.data.version),
      expectedPlanningGeneration: review.data.planningGeneration,
      policyApproval: { confirmed: true, rationale: "PlanArtifact CLI E2E accept" }
    });
    assert.equal(accepted.ok, true, accepted.message);
    assert.equal(accepted.code, FROZEN_STANDALONE_CODES["accept-plan-artifact"]);

    const preview = await runWk(workspace, "finalize-plan-to-phase", {
      planId: draft.data.planId,
      dryRun: true,
      targetPhaseKey: "110",
      targetPhase: "Phase 110",
      desiredStatus: "ready"
    });
    assert.equal(preview.ok, true, preview.message);
    assert.equal(preview.code, FROZEN_STANDALONE_CODES["finalize-plan-to-phase-preview"]);
    assert.equal(preview.data.review.passed, true);
    assert.equal(preview.data.taskPreview.length, artifact.wbs.length);

    const persisted = await runWk(workspace, "finalize-plan-to-phase", {
      planId: draft.data.planId,
      dryRun: false,
      targetPhaseKey: "110",
      targetPhase: "Phase 110",
      desiredStatus: "ready",
      expectedPlanningGeneration: accepted.data.planningGeneration,
      clientMutationId: `e2e-finalize-${artifact.planId}`,
      policyApproval: { confirmed: true, rationale: "PlanArtifact CLI E2E persist" }
    });
    assert.equal(persisted.ok, true, persisted.message);
    assert.equal(persisted.code, FROZEN_STANDALONE_CODES["finalize-plan-to-phase-persisted"]);
    assert.equal(persisted.data.status, "finalized");
    assert.equal(persisted.data.count, artifact.wbs.length);

    const listed = await runWk(workspace, "list-tasks", { status: "ready", phaseKey: "110", limit: 20 });
    assert.equal(listed.ok, true, listed.message);
    const matching = listed.data.tasks.filter((task) => task.metadata?.planRef === artifact.planRef);
    assert.equal(matching.length, artifact.wbs.length);
  });

  it("blocks finalize before accept", async () => {
    const workspace = await tmpWorkspace();
    const artifact = freshArtifact(loadFixture("plan-artifact-minimal.valid.v1.json"));
    const draft = await runWk(workspace, "draft-plan-artifact", {
      persist: true,
      artifact,
      expectedPlanningGeneration: 0,
      policyApproval: { confirmed: true, rationale: "PlanArtifact CLI E2E blocked draft" }
    });

    const blocked = await runWk(
      workspace,
      "finalize-plan-to-phase",
      { planId: draft.data.planId, dryRun: true },
      1
    );
    assert.equal(blocked.ok, false);
    assert.equal(blocked.code, FROZEN_STANDALONE_CODES["finalize-plan-to-phase-blocked"]);
  });
});
