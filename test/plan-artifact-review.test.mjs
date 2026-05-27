/**
 * WP-4.5 / T100463 — review-plan-artifact command wiring.
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

async function tmpWorkspace() {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "wk-plan-review-"));
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
        policyApproval: { confirmed: true, rationale: "plan-artifact-review.test.mjs setup" }
      }
    },
    { runtimeVersion: "0.1", workspacePath: workspace, effectiveConfig: SQLITE_CFG }
  );
  assert.equal(result.ok, true, result.message);
  return result;
}

describe("review-plan-artifact command (T100463)", () => {
  it("requires planId or artifact", async () => {
    const workspace = await tmpWorkspace();
    const result = await planningModule.onCommand(
      { name: "review-plan-artifact", args: {} },
      { runtimeVersion: "0.1", workspacePath: workspace, effectiveConfig: SQLITE_CFG }
    );
    assert.equal(result.ok, false);
    assert.equal(result.code, "invalid-run-args");
  });

  it("returns plan-artifact-not-found for unknown planId", async () => {
    const workspace = await tmpWorkspace();
    const result = await planningModule.onCommand(
      {
        name: "review-plan-artifact",
        args: { planId: "550e8400-e29b-41d4-a716-446655440000", profile: "minimal" }
      },
      { runtimeVersion: "0.1", workspacePath: workspace, effectiveConfig: SQLITE_CFG }
    );
    assert.equal(result.ok, false);
    assert.equal(result.code, "plan-artifact-not-found");
  });

  it("reviews inline minimal fixture — complete", async () => {
    const workspace = await tmpWorkspace();
    const artifact = freshArtifact(loadFixture("plan-artifact-minimal.valid.v1.json"));
    const result = await planningModule.onCommand(
      {
        name: "review-plan-artifact",
        args: { artifact, profile: "minimal" }
      },
      { runtimeVersion: "0.1", workspacePath: workspace, effectiveConfig: SQLITE_CFG }
    );
    assert.equal(result.ok, true);
    assert.equal(result.code, "plan-artifact-review-complete");
    assert.equal(result.data.passed, true);
    assert.equal(result.data.profile, "minimal");
    assert.ok(Array.isArray(result.data.blockers));
    assert.ok(result.data.coverageMap?.goals);
    assert.ok(typeof result.data.reviewSummary === "string");
  });

  it("reviews inline blockers fixture — blocked with findings", async () => {
    const workspace = await tmpWorkspace();
    const artifact = freshArtifact(loadFixture("plan-artifact-review-blockers.v1.json"));
    const result = await planningModule.onCommand(
      {
        name: "review-plan-artifact",
        args: { artifact, profile: "minimal" }
      },
      { runtimeVersion: "0.1", workspacePath: workspace, effectiveConfig: SQLITE_CFG }
    );
    assert.equal(result.ok, true);
    assert.equal(result.code, "plan-artifact-review-blocked");
    assert.equal(result.data.passed, false);
    assert.ok(result.data.blockers.some((b) => b.code === "RUBRIC-COV-GOAL"));
    assert.equal(result.data.coverageMap.goals.uncovered.length, 1);
  });

  it("loads stored plan by planId after draft persist", async () => {
    const workspace = await tmpWorkspace();
    const artifact = freshArtifact(loadFixture("plan-artifact-minimal.valid.v1.json"));
    const draft = await draftPersist(workspace, artifact);
    const result = await planningModule.onCommand(
      {
        name: "review-plan-artifact",
        args: { planId: draft.data.planId, profile: "minimal" }
      },
      { runtimeVersion: "0.1", workspacePath: workspace, effectiveConfig: SQLITE_CFG }
    );
    assert.equal(result.ok, true);
    assert.equal(result.code, "plan-artifact-review-complete");
    assert.equal(result.data.planId, draft.data.planId);
    assert.equal(result.data.version, 1);
  });

  it("recordReview persists reviewed status as next version", async () => {
    const workspace = await tmpWorkspace();
    const artifact = freshArtifact(loadFixture("plan-artifact-minimal.valid.v1.json"));
    const draft = await draftPersist(workspace, artifact);
    const result = await planningModule.onCommand(
      {
        name: "review-plan-artifact",
        args: {
          planId: draft.data.planId,
          profile: "minimal",
          recordReview: true,
          expectedPlanningGeneration: draft.data.planningGeneration ?? 0,
          policyApproval: { confirmed: true, rationale: "record review in test" }
        }
      },
      { runtimeVersion: "0.1", workspacePath: workspace, effectiveConfig: SQLITE_CFG }
    );
    assert.equal(result.ok, true);
    assert.equal(result.data.recordReview, true);
    assert.equal(result.data.version, 2);
    assert.equal(result.data.status, "reviewed");
    const latest = readLatestPlanArtifact(workspace, draft.data.planId);
    assert.equal(latest?.version, 2);
    assert.equal(latest?.status, "reviewed");
  });
});
