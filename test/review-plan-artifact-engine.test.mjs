/**
 * WP-4.2 / T100460 — reviewPlanArtifact engine (A-RUBRIC).
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import {
  resolvePlanArtifactReviewProfile,
  reviewPlanArtifact
} from "../dist/core/planning/review-plan-artifact.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixturesDir = path.join(root, "fixtures", "planning");

function loadFixture(name) {
  return JSON.parse(fs.readFileSync(path.join(fixturesDir, name), "utf8"));
}

describe("reviewPlanArtifact (T100460)", () => {
  it("resolves profile from planningType when omitted", () => {
    const minimal = loadFixture("plan-artifact-minimal.valid.v1.json");
    assert.equal(resolvePlanArtifactReviewProfile(minimal), "refactor");
    assert.equal(resolvePlanArtifactReviewProfile(minimal, "minimal"), "minimal");

    const full = loadFixture("plan-artifact-full-feature.valid.v1.json");
    assert.equal(resolvePlanArtifactReviewProfile(full), "full-feature");
  });

  it("passes minimal fixture under minimal profile", () => {
    const artifact = loadFixture("plan-artifact-minimal.valid.v1.json");
    const result = reviewPlanArtifact(artifact, { profile: "minimal" });
    assert.equal(result.passed, true);
    assert.equal(result.blockers.length, 0);
    assert.equal(result.profile, "minimal");
    assert.ok(result.coverageMap.goals.uncovered.length === 0);
  });

  it("passes full-feature fixture under full-feature profile", () => {
    const artifact = loadFixture("plan-artifact-full-feature.valid.v1.json");
    const result = reviewPlanArtifact(artifact, { profile: "full-feature" });
    assert.equal(result.passed, true, JSON.stringify(result.blockers, null, 2));
    assert.equal(result.coverageMap.slices.architecture, "covered");
    assert.equal(result.coverageMap.slices.uiUx, "covered");
    assert.equal(result.coverageMap.slices.testing, "covered");
    assert.ok(result.warnings.some((w) => w.code === "RUBRIC-OQ-UNRESOLVED"));
  });

  it("RUBRIC-COV-GOAL when goal has no WBS mapping", () => {
    const artifact = loadFixture("plan-artifact-minimal.valid.v1.json");
    artifact.wbs[0].goalMapping = ["Unrelated goal"];
    const result = reviewPlanArtifact(artifact, { profile: "minimal" });
    assert.equal(result.passed, false);
    assert.ok(result.blockers.some((b) => b.code === "RUBRIC-COV-GOAL"));
    assert.ok(result.coverageMap.goals.uncovered.length > 0);
  });

  it("RUBRIC-WBS-DUP-ID for duplicate wbsId", () => {
    const artifact = loadFixture("plan-artifact-minimal.valid.v1.json");
    const dup = structuredClone(artifact.wbs[0]);
    artifact.wbs.push(dup);
    const result = reviewPlanArtifact(artifact, { profile: "minimal" });
    assert.equal(result.passed, false);
    assert.ok(result.blockers.some((b) => b.code === "RUBRIC-WBS-DUP-ID"));
  });

  it("RUBRIC-WBS-VAGUE-AC warning on weak acceptance criteria", () => {
    const artifact = loadFixture("plan-artifact-minimal.valid.v1.json");
    artifact.wbs[0].acceptanceCriteria = ["done"];
    const result = reviewPlanArtifact(artifact, { profile: "minimal" });
    assert.ok(result.warnings.some((w) => w.code === "RUBRIC-WBS-VAGUE-AC"));
    assert.ok(result.sizingFindings.some((w) => w.code === "RUBRIC-WBS-VAGUE-AC"));
  });

  it("RUBRIC-PROFILE-ARCH blocker for refactor without architecture", () => {
    const artifact = loadFixture("plan-artifact-minimal.valid.v1.json");
    delete artifact.architecture;
    const result = reviewPlanArtifact(artifact, { profile: "refactor" });
    assert.equal(result.passed, false);
    assert.ok(result.blockers.some((b) => b.code === "RUBRIC-PROFILE-ARCH"));
  });

  it("waives RUBRIC-COV-ROLLOUT when waiver supplied", () => {
    const artifact = loadFixture("plan-artifact-full-feature.valid.v1.json");
    artifact.technicalImpact.systemsTouched = ["production-api"];
    for (const row of artifact.wbs) {
      row.title = "Kit only";
      row.technicalScope = ["src/core"];
      row.testingVerification = ["unit tests"];
    }
    const withoutWaiver = reviewPlanArtifact(artifact, { profile: "full-feature" });
    assert.ok(withoutWaiver.blockers.some((b) => b.code === "RUBRIC-COV-ROLLOUT"));

    const withWaiver = reviewPlanArtifact(artifact, {
      profile: "full-feature",
      waivers: [{ code: "RUBRIC-COV-ROLLOUT", rationale: "internal only" }]
    });
    assert.ok(!withWaiver.blockers.some((b) => b.code === "RUBRIC-COV-ROLLOUT"));
    assert.equal(withWaiver.coverageMap.slices.rolloutDocsMigration, "waived");
  });
});
