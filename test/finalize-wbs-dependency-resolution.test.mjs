/**
 * T100765 — two-pass WBS dependency resolution for finalize.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const {
  assignDeterministicDraftIdentities,
  prepareFinalizeDraftsWithWbsDependencies,
  resolveWbsDependsOnToDraftIds
} = await import(path.join(root, "dist/core/planning/wbs-dependency-resolution.js"));
const { extractWbsDependencyReferences, normalizeWbsItemToTaskDraft } = await import(
  path.join(root, "dist/core/planning/normalize-wbs-to-task-draft.js")
);
const { allocateNextTaskNumericId } = await import(path.join(root, "dist/modules/task-engine/id-allocation.js"));

const fullFeaturePlan = JSON.parse(
  fs.readFileSync(path.join(root, "fixtures/planning/plan-artifact-full-feature.valid.v1.json"), "utf8")
);

const normContext = {
  planRef: fullFeaturePlan.planRef,
  planId: fullFeaturePlan.planId,
  planVersion: fullFeaturePlan.version,
  planningType: fullFeaturePlan.identity.planningType,
  defaultPhase: "Phase 139",
  defaultPhaseKey: "139",
  defaultStatus: "ready"
};

function normalizeAllWbsRows() {
  return fullFeaturePlan.wbs.map((row) => {
    const result = normalizeWbsItemToTaskDraft(row, normContext);
    assert.equal(result.ok, true, result.ok ? "" : result.findings?.[0]?.message);
    return result.draft;
  });
}

describe("finalize WBS dependency resolution (T100765)", () => {
  it("extractWbsDependencyReferences prefers WBS dependsOn over payload", () => {
    const wbs = fullFeaturePlan.wbs[1];
    const refs = extractWbsDependencyReferences(wbs, wbs.generatedTaskPayload);
    assert.deepEqual(refs, ["WBS-1"]);
  });

  it("pass 1 assigns deterministic draft ids indexed by selected WBS rows", () => {
    const drafts = normalizeAllWbsRows().slice(0, 2);
    const selected = fullFeaturePlan.wbs.slice(0, 2);
    const pass1 = assignDeterministicDraftIdentities(drafts, selected, [], allocateNextTaskNumericId);
    assert.match(pass1.drafts[0].id, /^T\d+$/);
    assert.match(pass1.drafts[1].id, /^T\d+$/);
    assert.notEqual(pass1.drafts[0].id, pass1.drafts[1].id);
    assert.equal(pass1.wbsIdToDraftId.get("WBS-1"), pass1.drafts[0].id);
    assert.equal(pass1.wbsIdToDraftId.get("WBS-2"), pass1.drafts[1].id);
  });

  it("pass 2 resolves selected WBS row dependencies to task draft ids", () => {
    const drafts = normalizeAllWbsRows();
    const selected = fullFeaturePlan.wbs;
    const existing = [{ id: "T100764", title: "prior", type: "workspace-kit", status: "completed", createdAt: "", updatedAt: "" }];
    const prepared = prepareFinalizeDraftsWithWbsDependencies({
      drafts,
      selectedWbsRows: selected,
      allWbsRows: fullFeaturePlan.wbs,
      existingTasks: existing,
      allocateTaskId: allocateNextTaskNumericId
    });
    assert.equal(prepared.ok, true);
    if (!prepared.ok) return;
    assert.deepEqual(prepared.drafts[1].dependsOn, [prepared.drafts[0].id]);
    assert.ok(prepared.drafts[0].id.startsWith("T1007"));
  });

  it("blocks when a selected row depends on an unselected WBS row (v1)", () => {
    const drafts = normalizeAllWbsRows().slice(1, 2);
    const selected = fullFeaturePlan.wbs.slice(1, 2);
    const prepared = prepareFinalizeDraftsWithWbsDependencies({
      drafts,
      selectedWbsRows: selected,
      allWbsRows: fullFeaturePlan.wbs,
      existingTasks: [],
      allocateTaskId: allocateNextTaskNumericId
    });
    assert.equal(prepared.ok, false);
    if (prepared.ok) return;
    assert.equal(prepared.message, "Finalize blocked: dependency resolution failed");
    assert.deepEqual(prepared.findings, [
      {
        code: "wbs-dependency-unselected",
        severity: "error",
        wbsId: "WBS-2",
        dependency: "WBS-1",
        field: "dependsOn",
        message: "Selected WBS row 'WBS-2' depends on unselected WBS row 'WBS-1'"
      }
    ]);
  });

  it("returns a clear error for invalid dependency tokens", () => {
    const drafts = normalizeAllWbsRows().slice(0, 2);
    drafts[1] = { ...drafts[1], dependsOn: ["NOT-A-TASK"] };
    const pass1 = assignDeterministicDraftIdentities(
      drafts,
      fullFeaturePlan.wbs.slice(0, 2),
      [],
      allocateNextTaskNumericId
    );
    const pass2 = resolveWbsDependsOnToDraftIds({
      drafts: pass1.drafts,
      selectedWbsRows: fullFeaturePlan.wbs.slice(0, 2),
      wbsIdToDraftId: pass1.wbsIdToDraftId,
      draftIds: pass1.draftIds,
      allWbsIds: new Set(fullFeaturePlan.wbs.map((row) => row.wbsId)),
      existingTaskIds: new Set()
    });
    assert.equal(pass2.ok, false);
    if (pass2.ok) return;
    assert.deepEqual(pass2.findings, [
      {
        code: "wbs-dependency-invalid",
        severity: "error",
        wbsId: "WBS-2",
        dependency: "NOT-A-TASK",
        field: "dependsOn",
        message:
          "Selected WBS row 'WBS-2' has invalid dependency 'NOT-A-TASK' (expected selected WBS row or existing task id)"
      }
    ]);
  });

  it("allows dependencies on existing persisted task ids", () => {
    const drafts = [{ ...normalizeAllWbsRows()[0], dependsOn: ["T42"] }];
    const prepared = prepareFinalizeDraftsWithWbsDependencies({
      drafts,
      selectedWbsRows: [fullFeaturePlan.wbs[0]],
      allWbsRows: fullFeaturePlan.wbs,
      existingTasks: [
        { id: "T42", title: "existing", type: "workspace-kit", status: "ready", createdAt: "", updatedAt: "" }
      ],
      allocateTaskId: allocateNextTaskNumericId
    });
    assert.equal(prepared.ok, true);
    if (!prepared.ok) return;
    assert.deepEqual(prepared.drafts[0].dependsOn, ["T42"]);
  });
});
