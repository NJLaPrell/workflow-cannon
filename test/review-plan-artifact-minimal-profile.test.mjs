/**
 * T100755 — profile-aware minimal review rules (WBS-4.1).
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import {
  isCriticalOpenQuestion,
  resolvePlanArtifactReviewProfile,
  reviewPlanArtifact
} from "../dist/core/planning/review-plan-artifact.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixturesDir = path.join(root, "fixtures", "planning");

function loadFixture(name) {
  return JSON.parse(fs.readFileSync(path.join(fixturesDir, name), "utf8"));
}

function cloneFixture(name) {
  return structuredClone(loadFixture(name));
}

describe("reviewPlanArtifact minimal profile (T100755)", () => {
  it("defaults unspecified profile to minimal", () => {
    const artifact = loadFixture("plan-artifact-minimal.valid.v1.json");
    assert.equal(resolvePlanArtifactReviewProfile(artifact), "minimal");
    assert.equal(resolvePlanArtifactReviewProfile(artifact, "full-feature"), "full-feature");

    const result = reviewPlanArtifact(artifact);
    assert.equal(result.profile, "minimal");
    assert.equal(result.passed, true);
  });

  it("passes valid minimal fixture with only core completeness checks", () => {
    const artifact = cloneFixture("plan-artifact-minimal.valid.v1.json");
    delete artifact.architecture;
    delete artifact.valueAssessment.impact;
    const result = reviewPlanArtifact(artifact, { profile: "minimal" });
    assert.equal(result.passed, true, JSON.stringify(result.blockers, null, 2));
    assert.equal(result.blockers.length, 0);
    assert.equal(result.warnings.length, 0);
  });

  it("RUBRIC-MIN-GOALS when goals are missing", () => {
    const artifact = cloneFixture("plan-artifact-minimal.valid.v1.json");
    artifact.goals = [];
    const result = reviewPlanArtifact(artifact, { profile: "minimal" });
    assert.equal(result.passed, false);
    const finding = result.blockers.find((b) => b.code === "RUBRIC-MIN-GOALS");
    assert.ok(finding);
    assert.equal(finding.path, "goals");
    assert.equal(finding.severity, "blocker");
    assert.ok(!result.warnings.some((w) => w.code === "RUBRIC-MIN-GOALS"));
  });

  it("RUBRIC-MIN-WBS when wbs is empty", () => {
    const artifact = cloneFixture("plan-artifact-minimal.valid.v1.json");
    artifact.wbs = [];
    const result = reviewPlanArtifact(artifact, { profile: "minimal" });
    assert.equal(result.passed, false);
    const finding = result.blockers.find((b) => b.code === "RUBRIC-MIN-WBS");
    assert.ok(finding);
    assert.equal(finding.path, "wbs");
  });

  it("RUBRIC-MIN-WBS-AC when acceptance criteria missing", () => {
    const artifact = cloneFixture("plan-artifact-minimal.valid.v1.json");
    artifact.wbs[0].acceptanceCriteria = [];
    const result = reviewPlanArtifact(artifact, { profile: "minimal" });
    assert.equal(result.passed, false);
    const finding = result.blockers.find((b) => b.code === "RUBRIC-MIN-WBS-AC");
    assert.ok(finding);
    assert.equal(finding.path, "wbs[0].acceptanceCriteria");
    assert.equal(finding.wbsId, "WBS-1");
  });

  it("RUBRIC-MIN-WBS-VERIFY when testing verification missing", () => {
    const artifact = cloneFixture("plan-artifact-minimal.valid.v1.json");
    artifact.wbs[0].testingVerification = [];
    const result = reviewPlanArtifact(artifact, { profile: "minimal" });
    assert.equal(result.passed, false);
    const finding = result.blockers.find((b) => b.code === "RUBRIC-MIN-WBS-VERIFY");
    assert.ok(finding);
    assert.equal(finding.path, "wbs[0].testingVerification");
    assert.equal(finding.wbsId, "WBS-1");
  });

  it("RUBRIC-MIN-OQ-CRITICAL for unresolved critical open questions", () => {
    const artifact = cloneFixture("plan-artifact-minimal.valid.v1.json");
    artifact.openQuestions = [
      "Unresolved critical question: Q-ROLLBACK",
      "Optional polish deferral?"
    ];
    const result = reviewPlanArtifact(artifact, { profile: "minimal" });
    assert.equal(result.passed, false);
    const critical = result.blockers.find((b) => b.code === "RUBRIC-MIN-OQ-CRITICAL");
    assert.ok(critical);
    assert.equal(critical.path, "openQuestions[0]");
    assert.ok(result.warnings.some((w) => w.code === "RUBRIC-OQ-UNRESOLVED"));
    assert.ok(!result.blockers.some((b) => b.code === "RUBRIC-OQ-UNRESOLVED"));
  });

  it("keeps blockers and warnings distinct in response payload", () => {
    const artifact = cloneFixture("plan-artifact-minimal.valid.v1.json");
    artifact.goals = [];
    artifact.openQuestions = ["Defer dashboard polish?"];
    const result = reviewPlanArtifact(artifact, { profile: "minimal" });
    assert.ok(result.blockers.length > 0);
    assert.ok(result.warnings.length > 0);
    for (const b of result.blockers) {
      assert.equal(b.severity, "blocker");
      assert.ok(!result.warnings.includes(b));
    }
    for (const w of result.warnings) {
      assert.equal(w.severity, "warning");
      assert.ok(!result.blockers.includes(w));
    }
  });

  it("isCriticalOpenQuestion detects stable prefixes", () => {
    assert.equal(isCriticalOpenQuestion("Unresolved critical question: Q1"), true);
    assert.equal(isCriticalOpenQuestion("[critical] Must decide auth model"), true);
    assert.equal(isCriticalOpenQuestion("CRITICAL: rollout owner"), true);
    assert.equal(isCriticalOpenQuestion("Maybe defer polish?"), false);
  });
});
