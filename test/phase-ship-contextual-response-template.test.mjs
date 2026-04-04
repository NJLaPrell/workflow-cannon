import assert from "node:assert/strict";
import test from "node:test";
import { resolveContextualResponseTemplateId } from "../dist/core/index.js";

test("resolveContextualResponseTemplateId: run-transition complete -> phase_ship", () => {
  assert.equal(
    resolveContextualResponseTemplateId("run-transition", { action: "complete" }),
    "phase_ship"
  );
  assert.equal(resolveContextualResponseTemplateId("run-transition", { action: "start" }), undefined);
});

test("resolveContextualResponseTemplateId: update-workspace-phase-snapshot", () => {
  assert.equal(
    resolveContextualResponseTemplateId("update-workspace-phase-snapshot", { currentKitPhase: "58" }),
    "phase_ship"
  );
  assert.equal(
    resolveContextualResponseTemplateId("update-workspace-phase-snapshot", {
      currentKitPhase: "58",
      dryRun: true
    }),
    undefined
  );
});

test("resolveContextualResponseTemplateId: generate-document ROADMAP / FEATURE-TAXONOMY", () => {
  assert.equal(
    resolveContextualResponseTemplateId("generate-document", {
      documentType: "ROADMAP.md",
      options: {}
    }),
    "phase_ship"
  );
  assert.equal(
    resolveContextualResponseTemplateId("generate-document", {
      documentType: "ROADMAP.md",
      options: { dryRun: true }
    }),
    undefined
  );
  assert.equal(
    resolveContextualResponseTemplateId("generate-document", {
      documentType: "FEATURE-TAXONOMY.md",
      options: {}
    }),
    "phase_ship"
  );
  assert.equal(
    resolveContextualResponseTemplateId("generate-document", { documentType: "TERMS.md", options: {} }),
    undefined
  );
});
