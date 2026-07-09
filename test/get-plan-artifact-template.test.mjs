/** T100817 — get-plan-artifact-template Tier C read command. */
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { planningModule } from "../dist/index.js";
import { PLAN_ARTIFACT_KERNEL_TEMPLATE_REL } from "../dist/modules/planning/get-plan-artifact-template-handler.js";
import { validatePlanArtifactDocument } from "../dist/core/planning/validate-plan-artifact.js";

async function tmpWorkspace() {
  return mkdtemp(path.join(os.tmpdir(), "get-plan-artifact-template-"));
}

describe("get-plan-artifact-template (T100817)", () => {
  it("returns schema-valid kernel template without argv", async () => {
    const workspace = await tmpWorkspace();
    const result = await planningModule.onCommand(
      { name: "get-plan-artifact-template", args: {} },
      { runtimeVersion: "0.1", workspacePath: workspace }
    );
    assert.equal(result.ok, true);
    assert.equal(result.code, "plan-artifact-template-retrieved");
    assert.equal(result.data.schemaVersion, 1);
    assert.equal(result.data.responseSchemaVersion, 1);
    assert.equal(result.data.templateSource, PLAN_ARTIFACT_KERNEL_TEMPLATE_REL);
    assert.ok(result.data.artifact);
    assert.equal(result.data.artifact.schemaVersion, 1);
    assert.equal(result.data.artifact.status, "draft");
    assert.equal(result.data.artifact.version, 1);
    assert.ok(Array.isArray(result.data.artifact.goals) && result.data.artifact.goals.length > 0);
    assert.ok(Array.isArray(result.data.artifact.wbs) && result.data.artifact.wbs.length > 0);

    const validation = validatePlanArtifactDocument(result.data.artifact, { workspaceRoot: workspace });
    assert.equal(validation.ok, true, validation.ok ? "" : JSON.stringify(validation.errors));
  });

  it("matches minimal fixture structural shape", async () => {
    const workspace = await tmpWorkspace();
    const result = await planningModule.onCommand(
      { name: "get-plan-artifact-template", args: {} },
      { runtimeVersion: "0.1", workspacePath: workspace }
    );
    const artifact = result.data.artifact;
    const requiredTopLevel = [
      "schemaVersion",
      "planId",
      "version",
      "planRef",
      "status",
      "identity",
      "goals",
      "nonGoals",
      "valueAssessment",
      "riskAssessment",
      "technicalImpact",
      "testingStrategy",
      "implementationGuidance",
      "whatNotToDo",
      "assumptions",
      "openQuestions",
      "wbs",
      "phaseRecommendations",
      "provenance"
    ];
    for (const key of requiredTopLevel) {
      assert.ok(key in artifact, `missing top-level field ${key}`);
    }
    assert.equal(artifact.planRef, `plan-artifact:${artifact.planId}`);
  });
});
