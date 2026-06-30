/**
 * WP-4.4 / T100462 — coverage map and waiver depth (Gap 5 / PLANNER_REVIEW_RUBRIC §5).
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import { reviewPlanArtifact } from "../dist/core/planning/review-plan-artifact.js";
import { validatePlanArtifactDocument } from "../dist/core/planning/validate-plan-artifact.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixturesDir = path.join(root, "fixtures", "planning");

function loadFixture(name) {
  return JSON.parse(fs.readFileSync(path.join(fixturesDir, name), "utf8"));
}

describe("review-plan-artifact coverage map (T100462)", () => {
  it("schema-validates plan-artifact-review-blockers fixture", () => {
    const raw = loadFixture("plan-artifact-review-blockers.v1.json");
    const result = validatePlanArtifactDocument(raw, { workspaceRoot: root });
    assert.equal(result.ok, true);
  });

  it("uncovered objectives produce RUBRIC-COV-GOAL blockers and coverageMap entries", () => {
    const artifact = loadFixture("plan-artifact-review-blockers.v1.json");
    const result = reviewPlanArtifact(artifact, { profile: "refactor" });

    assert.equal(result.passed, false);
    assert.ok(result.blockers.some((b) => b.code === "RUBRIC-COV-GOAL"));
    assert.ok(result.blockers.some((b) => b.code === "RUBRIC-COV-TEST"));
    assert.equal(result.coverageMap.goals.covered.length, 1);
    assert.equal(result.coverageMap.goals.uncovered.length, 1);
    assert.ok(
      result.coverageMap.goals.uncovered.some((g) => g.includes("Goal beta")),
      result.coverageMap.goals.uncovered
    );
    assert.equal(result.coverageMap.slices.testing, "missing");
  });

  it("returns full coverageMap shape with slice statuses", () => {
    const artifact = loadFixture("plan-artifact-minimal.valid.v1.json");
    const result = reviewPlanArtifact(artifact, { profile: "refactor" });

    assert.equal(typeof result.coverageMap, "object");
    assert.ok(Array.isArray(result.coverageMap.goals.covered));
    assert.ok(Array.isArray(result.coverageMap.goals.uncovered));
    assert.ok(Array.isArray(result.coverageMap.userStories.covered));
    assert.ok(Array.isArray(result.coverageMap.userStories.uncovered));
    for (const key of ["architecture", "uiUx", "testing", "rolloutDocsMigration"]) {
      assert.ok(
        ["covered", "missing", "waived", "not-applicable"].includes(result.coverageMap.slices[key]),
        key
      );
    }
  });

  it("waives RUBRIC-COV-ARCH and marks architecture slice waived", () => {
    const artifact = loadFixture("plan-artifact-full-feature.valid.v1.json");
    artifact.architecture = { overview: "", decisions: [] };

    const without = reviewPlanArtifact(artifact, { profile: "full-feature" });
    assert.ok(without.blockers.some((b) => b.code === "RUBRIC-COV-ARCH"));
    assert.equal(without.coverageMap.slices.architecture, "missing");

    const withWaiver = reviewPlanArtifact(artifact, {
      profile: "full-feature",
      waivers: [{ code: "RUBRIC-COV-ARCH", rationale: "architecture doc tracked externally" }]
    });
    assert.ok(!withWaiver.blockers.some((b) => b.code === "RUBRIC-COV-ARCH"));
    assert.equal(withWaiver.coverageMap.slices.architecture, "waived");
  });

  it("waives RUBRIC-COV-UI when UI is in scope but summary missing", () => {
    const artifact = loadFixture("plan-artifact-full-feature.valid.v1.json");
    artifact.uiUxDirection = { hasUiChanges: true, summary: "" };

    const without = reviewPlanArtifact(artifact, { profile: "full-feature" });
    assert.ok(without.blockers.some((b) => b.code === "RUBRIC-COV-UI"));
    assert.equal(without.coverageMap.slices.uiUx, "missing");

    const withWaiver = reviewPlanArtifact(artifact, {
      profile: "full-feature",
      waivers: [{ code: "RUBRIC-COV-UI", rationale: "UI spec in external mockups" }]
    });
    assert.ok(!withWaiver.blockers.some((b) => b.code === "RUBRIC-COV-UI"));
    assert.equal(withWaiver.coverageMap.slices.uiUx, "waived");
  });

  it("waives RUBRIC-COV-TEST and marks testing slice waived", () => {
    const artifact = loadFixture("plan-artifact-full-feature.valid.v1.json");
    artifact.testingStrategy.layers = ["performance"];
    for (const row of artifact.wbs) {
      row.testingVerification = ["Manual schema review only"];
    }

    const without = reviewPlanArtifact(artifact, { profile: "full-feature" });
    assert.ok(without.blockers.some((b) => b.code === "RUBRIC-COV-TEST"));
    assert.equal(without.coverageMap.slices.testing, "missing");

    const withWaiver = reviewPlanArtifact(artifact, {
      profile: "full-feature",
      waivers: [{ code: "RUBRIC-COV-TEST", rationale: "test plan in separate QA doc" }]
    });
    assert.ok(!withWaiver.blockers.some((b) => b.code === "RUBRIC-COV-TEST"));
    assert.equal(withWaiver.coverageMap.slices.testing, "waived");
  });

  it("waives RUBRIC-COV-ROLLOUT without affecting covered goals", () => {
    const artifact = loadFixture("plan-artifact-full-feature.valid.v1.json");
    artifact.technicalImpact.systemsTouched = ["production-api"];
    for (const row of artifact.wbs) {
      row.title = "Kit only";
      row.technicalScope = ["src/core"];
      row.testingVerification = ["unit tests"];
    }

    const withWaiver = reviewPlanArtifact(artifact, {
      profile: "full-feature",
      waivers: [{ code: "RUBRIC-COV-ROLLOUT", rationale: "internal only" }]
    });
    assert.equal(withWaiver.coverageMap.slices.rolloutDocsMigration, "waived");
    assert.equal(withWaiver.coverageMap.goals.uncovered.length, 0);
    assert.ok(!withWaiver.blockers.some((b) => b.code === "RUBRIC-COV-ROLLOUT"));
  });

  it("does not waive RUBRIC-COV-GOAL — uncovered goals remain blockers", () => {
    const artifact = loadFixture("plan-artifact-review-blockers.v1.json");
    const result = reviewPlanArtifact(artifact, {
      profile: "refactor",
      waivers: [{ code: "RUBRIC-COV-GOAL", rationale: "should not apply to goals" }]
    });
    assert.ok(result.blockers.some((b) => b.code === "RUBRIC-COV-GOAL"));
    assert.equal(result.coverageMap.goals.uncovered.length, 1);
  });
});
