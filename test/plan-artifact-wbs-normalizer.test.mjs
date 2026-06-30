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
const fullFeaturePlan = JSON.parse(
  fs.readFileSync(path.join(root, "fixtures/planning/plan-artifact-full-feature.valid.v1.json"), "utf8")
);

const context = {
  planRef: minimalPlan.planRef,
  planId: minimalPlan.planId,
  planVersion: minimalPlan.version,
  planningType: minimalPlan.identity.planningType,
  defaultPhase: "Phase 110",
  defaultPhaseKey: "110",
  defaultStatus: "ready",
  sourceIdeaId: "I100751"
};

describe("plan-artifact WBS normalizer stub", () => {
  it("shape guard accepts minimal fixture WBS row", () => {
    const wbs = minimalPlan.wbs[0];
    assert.equal(isPlanArtifactWbsItem(wbs), true);
    const guarded = validatePlanArtifactWbsItemShape(wbs);
    assert.equal(guarded.ok, true);
  });

  it("normalizeWbsItemToTaskDraft returns a rich draft for a basic WBS row", () => {
    const wbs = { ...minimalPlan.wbs[0], path: "1" };
    const result = normalizeWbsItemToTaskDraft(wbs, context);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.draft.title, "Add plan-artifact.v1.schema.json");
    assert.equal(result.draft.summary, "Author schema from PLANNER_SCHEMA.md");
    assert.ok(result.draft.phase?.includes("110"));
    assert.ok(result.draft.technicalScope.length > 0);
    assert.ok(result.draft.acceptanceCriteria.length > 0);
    assert.match(result.draft.description, /Plan WBS row: WBS-1 \(1\) — Add JSON Schema/);
    assert.match(result.draft.description, /Verification:\n- test\/plan-artifact-schema\.test\.mjs/);
    assert.match(result.draft.description, /Done means:\nSchema file committed and referenced in WP-1\.2/);
    assert.equal(result.draft.metadata.planRef, minimalPlan.planRef);
    assert.equal(result.draft.metadata.planningProvenance.wbsId, "WBS-1");
    assert.equal(result.draft.metadata.planningProvenance.wbsPath, "1");
    assert.equal(result.draft.metadata.planningProvenance.sourceIdeaId, "I100751");
    assert.equal(result.planningProvenance.wbsId, "WBS-1");
    assert.equal(result.planningProvenance.wbsPath, "1");
    assert.equal(result.planningProvenance.planRef, minimalPlan.planRef);
    assert.equal(result.planningProvenance.sourceIdeaId, "I100751");
  });

  it("preserves WBS dependencies and verification context on dependency rows", () => {
    const dependencyContext = {
      ...context,
      planRef: fullFeaturePlan.planRef,
      planId: fullFeaturePlan.planId,
      planVersion: fullFeaturePlan.version,
      planningType: fullFeaturePlan.identity.planningType
    };
    const result = normalizeWbsItemToTaskDraft(fullFeaturePlan.wbs[1], dependencyContext);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.deepEqual(result.draft.dependsOn, ["WBS-1"]);
    assert.match(result.draft.description, /Plan WBS row: WBS-2 \(2\) — Plan draft panel/);
    assert.match(result.draft.description, /Verification:\n- extension tests/);
    assert.match(result.draft.description, /Acceptance criteria:\n- Fixture render test/);
  });

  it("omits missing optional fields while keeping default phase/status", () => {
    const result = normalizeWbsItemToTaskDraft(minimalPlan.wbs[0], {
      ...context,
      sourceIdeaId: undefined
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.draft.phase, "Phase 110");
    assert.equal(result.draft.phaseKey, "110");
    assert.equal(result.draft.status, "ready");
    assert.equal(result.draft.metadata.planningProvenance.wbsPath, undefined);
    assert.equal(result.draft.metadata.planningProvenance.sourceIdeaId, undefined);
    assert.doesNotMatch(result.draft.description, /Risk notes:/);
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
