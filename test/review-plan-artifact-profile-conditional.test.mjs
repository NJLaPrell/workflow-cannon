/**
 * T100756 — refactor/full-feature conditional review blockers and warnings.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import { reviewPlanArtifact } from "../dist/core/planning/review-plan-artifact.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixturesDir = path.join(root, "fixtures", "planning");

function loadFixture(name) {
  return JSON.parse(fs.readFileSync(path.join(fixturesDir, name), "utf8"));
}

describe("reviewPlanArtifact profile conditionals (T100756)", () => {
  it("refactor profile requires affected systems", () => {
    const artifact = loadFixture("plan-artifact-minimal.valid.v1.json");
    artifact.technicalImpact.systemsTouched = [];
    const result = reviewPlanArtifact(artifact, { profile: "refactor" });
    assert.equal(result.passed, false);
    assert.ok(result.blockers.some((b) => b.code === "RUBRIC-PROFILE-SYSTEMS"));
  });

  it("refactor profile requires migration notes when behavior changes", () => {
    const artifact = loadFixture("plan-artifact-minimal.valid.v1.json");
    artifact.identity.planningType = "change";
    delete artifact.technicalImpact.migrationImpact;
    delete artifact.technicalImpact.compatibilityNotes;
    const result = reviewPlanArtifact(artifact, { profile: "refactor" });
    assert.ok(result.blockers.some((b) => b.code === "RUBRIC-PROFILE-MIGRATION"));
  });

  it("refactor profile accepts compatibilityNotes for behavior changes", () => {
    const artifact = loadFixture("plan-artifact-minimal.valid.v1.json");
    artifact.identity.planningType = "change";
    artifact.technicalImpact.compatibilityNotes = "Additive fields only";
    delete artifact.technicalImpact.migrationImpact;
    const result = reviewPlanArtifact(artifact, { profile: "refactor" });
    assert.ok(!result.blockers.some((b) => b.code === "RUBRIC-PROFILE-MIGRATION"));
  });

  it("refactor profile requires test strategy coverage in WBS verification", () => {
    const artifact = loadFixture("plan-artifact-minimal.valid.v1.json");
    for (const row of artifact.wbs) {
      row.testingVerification = ["Manual review only"];
    }
    const result = reviewPlanArtifact(artifact, { profile: "refactor" });
    assert.ok(
      result.blockers.some(
        (b) => b.code === "RUBRIC-PROFILE-TEST" || b.code === "RUBRIC-COV-TEST"
      )
    );
  });

  it("full-feature profile requires rollout/rollback when persistence changes", () => {
    const artifact = loadFixture("plan-artifact-full-feature.valid.v1.json");
    artifact.technicalImpact.systemsTouched = ["task-engine/persistence"];
    delete artifact.technicalImpact.migrationImpact;
    delete artifact.technicalImpact.compatibilityNotes;
    artifact.implementationGuidance = ["Extend dashboard-summary before webview panels"];
    for (const row of artifact.wbs) {
      row.title = "Kit only";
      row.technicalScope = ["src/core"];
      row.testingVerification = ["unit tests"];
    }
    const result = reviewPlanArtifact(artifact, { profile: "full-feature" });
    assert.ok(result.blockers.some((b) => b.code === "RUBRIC-PROFILE-ROLLOUT"));
  });

  it("full-feature profile accepts rollout notes in implementationGuidance", () => {
    const artifact = loadFixture("plan-artifact-full-feature.valid.v1.json");
    artifact.technicalImpact.systemsTouched = ["task-engine/persistence"];
    delete artifact.technicalImpact.migrationImpact;
    delete artifact.technicalImpact.compatibilityNotes;
    artifact.implementationGuidance = ["Document rollout and rollback in operator runbook"];
    for (const row of artifact.wbs) {
      row.title = "Kit only";
      row.technicalScope = ["src/core"];
      row.testingVerification = ["unit tests"];
    }
    const result = reviewPlanArtifact(artifact, { profile: "full-feature" });
    assert.ok(!result.blockers.some((b) => b.code === "RUBRIC-PROFILE-ROLLOUT"));
  });

  it("RUBRIC-WBS-PAYLOAD-INVALID when generatedTaskPayload is insufficient", () => {
    const artifact = loadFixture("plan-artifact-minimal.valid.v1.json");
    artifact.wbs[0].generatedTaskPayload = {
      title: "Incomplete",
      approach: "Missing scope",
      technicalScope: [],
      acceptanceCriteria: []
    };
    const result = reviewPlanArtifact(artifact, { profile: "refactor" });
    assert.ok(result.blockers.some((b) => b.code === "RUBRIC-WBS-PAYLOAD-INVALID"));
  });
});
