/**
 * WP-4.3 / T100461 — WBS sizing rubric fixtures and review rule tests.
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

const SIZING_FIXTURES = [
  "wbs-oversized-row.v1.json",
  "wbs-medium-large-row.v1.json",
  "wbs-vague-ac.v1.json"
];

function loadFixture(name) {
  return JSON.parse(fs.readFileSync(path.join(fixturesDir, name), "utf8"));
}

describe("review-plan-artifact sizing (T100461)", () => {
  for (const name of SIZING_FIXTURES) {
    it(`schema-validates sizing fixture ${name}`, () => {
      const raw = loadFixture(name);
      const result = validatePlanArtifactDocument(raw, { workspaceRoot: root });
      assert.equal(result.ok, true, `${name}: ${result.code ?? result.message}`);
    });
  }

  it("RUBRIC-WBS-LOW-SIZING-OVERSIZE on wbs-oversized-row fixture", () => {
    const artifact = loadFixture("wbs-oversized-row.v1.json");
    const result = reviewPlanArtifact(artifact, { profile: "refactor" });
    assert.equal(result.passed, false);
    assert.ok(
      result.blockers.some((b) => b.code === "RUBRIC-WBS-LOW-SIZING-OVERSIZE"),
      JSON.stringify(result.blockers, null, 2)
    );
    assert.ok(result.sizingFindings.some((f) => f.code === "RUBRIC-WBS-LOW-SIZING-OVERSIZE"));
  });

  it("RUBRIC-WBS-MEDIUM-LARGE warning on wbs-medium-large-row fixture", () => {
    const artifact = loadFixture("wbs-medium-large-row.v1.json");
    const result = reviewPlanArtifact(artifact, { profile: "refactor" });
    assert.ok(
      result.warnings.some((w) => w.code === "RUBRIC-WBS-MEDIUM-LARGE"),
      JSON.stringify(result.warnings, null, 2)
    );
    assert.ok(result.sizingFindings.some((f) => f.code === "RUBRIC-WBS-MEDIUM-LARGE"));
  });

  it("RUBRIC-WBS-VAGUE-AC and RUBRIC-WBS-VAGUE-DONE on wbs-vague-ac fixture", () => {
    const artifact = loadFixture("wbs-vague-ac.v1.json");
    const result = reviewPlanArtifact(artifact, { profile: "refactor" });
    assert.ok(result.warnings.some((w) => w.code === "RUBRIC-WBS-VAGUE-AC"));
    assert.ok(result.warnings.some((w) => w.code === "RUBRIC-WBS-VAGUE-DONE"));
    assert.ok(result.sizingFindings.some((f) => f.code === "RUBRIC-WBS-VAGUE-AC"));
  });
});
