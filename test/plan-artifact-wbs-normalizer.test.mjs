import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const {
  isPlanArtifactWbsItem,
  normalizeWbsItemToTaskDraft,
  validatePlanArtifactWbsItemShape
} = await import(path.join(root, "dist/core/planning/normalize-wbs-to-task-draft.js"));

const minimalPlan = JSON.parse(
  fs.readFileSync(path.join(root, "fixtures/planning/plan-artifact-minimal.valid.v1.json"), "utf8")
);

const context = {
  planRef: minimalPlan.planRef,
  planId: minimalPlan.planId,
  planVersion: minimalPlan.version,
  planningType: minimalPlan.identity.planningType,
  defaultPhase: "Phase 110",
  defaultPhaseKey: "110",
  defaultStatus: "ready"
};

describe("plan-artifact WBS normalizer stub", () => {
  it("shape guard accepts minimal fixture WBS row", () => {
    const wbs = minimalPlan.wbs[0];
    assert.equal(isPlanArtifactWbsItem(wbs), true);
    const guarded = validatePlanArtifactWbsItemShape(wbs);
    assert.equal(guarded.ok, true);
  });

  it("normalizeWbsItemToTaskDraft returns persist-compatible draft", () => {
    const wbs = minimalPlan.wbs[0];
    const result = normalizeWbsItemToTaskDraft(wbs, context);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.draft.title, "Add plan-artifact.v1.schema.json");
    assert.ok(result.draft.phase?.includes("110"));
    assert.ok(result.draft.technicalScope.length > 0);
    assert.ok(result.draft.acceptanceCriteria.length > 0);
    assert.equal(result.planningProvenance.wbsId, "WBS-1");
    assert.equal(result.planningProvenance.planRef, minimalPlan.planRef);
  });

  it("rejects WBS row with empty technicalScope", () => {
    const bad = { ...minimalPlan.wbs[0], technicalScope: [] };
    const guarded = validatePlanArtifactWbsItemShape(bad);
    assert.equal(guarded.ok, false);
    if (guarded.ok) return;
    assert.ok(guarded.findings.some((f) => f.field === "technicalScope"));
  });

  it("normalize returns findings for invalid row", () => {
    const bad = { wbsId: "X" };
    const result = normalizeWbsItemToTaskDraft(bad, context);
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.code, "wbs-shape-invalid");
    assert.ok(result.findings.length > 0);
  });
});
