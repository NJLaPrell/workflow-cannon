import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import { planningModule } from "../dist/index.js";
import {
  normalizePlanArtifactDraft,
  validatePlanArtifactDocument,
  validatePlanArtifactDraftInput
} from "../dist/core/planning/validate-plan-artifact.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixturesDir = path.join(root, "fixtures", "planning");

function loadFixture(name) {
  return JSON.parse(fs.readFileSync(path.join(fixturesDir, name), "utf8"));
}

describe("validate-plan-artifact (T100456)", () => {
  it("validates minimal fixture after normalize", () => {
    const raw = loadFixture("plan-artifact-minimal.valid.v1.json");
    const result = validatePlanArtifactDocument(raw, { workspaceRoot: root });
    assert.equal(result.ok, true);
    assert.equal(result.artifact.planId, raw.planId);
  });

  it("validates full-feature fixture", () => {
    const raw = loadFixture("plan-artifact-full-feature.valid.v1.json");
    const result = validatePlanArtifactDocument(raw, { workspaceRoot: root });
    assert.equal(result.ok, true);
  });

  it("rejects empty goals with path-level errors", () => {
    const raw = loadFixture("plan-artifact-minimal.valid.v1.json");
    raw.goals = [];
    const result = validatePlanArtifactDocument(raw, { workspaceRoot: root });
    assert.equal(result.ok, false);
    assert.equal(result.code, "plan-artifact-schema-invalid");
    assert.ok(result.errors.some((e) => e.path.includes("goals")));
  });

  it("rejects invalid WBS row with indexed path", () => {
    const raw = loadFixture("plan-artifact-minimal.valid.v1.json");
    raw.wbs = [{ wbsId: "WBS-bad", title: "" }];
    const result = validatePlanArtifactDocument(raw, { workspaceRoot: root });
    assert.equal(result.ok, false);
    assert.ok(
      result.errors.some((e) => e.path.startsWith("wbs[0]")),
      `expected wbs path in ${JSON.stringify(result.errors)}`
    );
  });

  it("rejects planRef mismatch with planId", () => {
    const raw = loadFixture("plan-artifact-minimal.valid.v1.json");
    raw.planRef = "plan-artifact:wrong-id";
    const result = validatePlanArtifactDocument(raw, { workspaceRoot: root });
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e) => e.path === "planRef"));
  });

  it("normalizePlanArtifactDraft allocates planId and planRef", () => {
    const normalized = normalizePlanArtifactDraft(
      {
        identity: {
          title: "Draft only",
          planningType: "change"
        },
        goals: ["Ship validation"],
        valueAssessment: { impact: "test", confidence: "high" },
        technicalImpact: { systemsTouched: ["src/core/planning"] },
        testingStrategy: { layers: ["unit"], criticalPaths: ["validate"] },
        implementationGuidance: ["Add validator module"],
        whatNotToDo: ["Skip schema"],
        phaseRecommendations: [
          { phaseKey: "110", label: "Phase 110", rationale: "Active phase", isPrimary: true }
        ]
      },
      { actor: "test-agent" }
    );
    assert.equal(normalized.schemaVersion, 1);
    assert.equal(typeof normalized.planId, "string");
    assert.equal(normalized.planRef, `plan-artifact:${normalized.planId}`);
    const validated = validatePlanArtifactDocument(normalized, { workspaceRoot: root });
    assert.equal(validated.ok, true);
  });
});

describe("planningModule draft-plan-artifact validate-only", () => {
  it("returns plan-artifact-draft-validated for persist:false", async () => {
    const artifact = loadFixture("plan-artifact-minimal.valid.v1.json");
    const result = await planningModule.onCommand(
      {
        name: "draft-plan-artifact",
        args: { persist: false, artifact }
      },
      { runtimeVersion: "0.1", workspacePath: root }
    );
    assert.equal(result.ok, true);
    assert.equal(result.code, "plan-artifact-draft-validated");
    assert.equal(result.data.planId, artifact.planId);
  });

  it("returns plan-artifact-schema-invalid for bad artifact", async () => {
    const artifact = loadFixture("plan-artifact-minimal.valid.v1.json");
    artifact.goals = [];
    const result = await planningModule.onCommand(
      {
        name: "draft-plan-artifact",
        args: { persist: false, artifact }
      },
      { runtimeVersion: "0.1", workspacePath: root }
    );
    assert.equal(result.ok, false);
    assert.equal(result.code, "plan-artifact-schema-invalid");
    assert.ok(Array.isArray(result.data.errors));
  });
});
