import test from "node:test";
import assert from "node:assert/strict";

import {
  buildDraftGuidanceRulePayload,
  draftStrengthToFamily,
  withAcknowledgement
} from "../dist/views/guidance/guidance-wizard-draft.js";

test("draftStrengthToFamily maps presets", () => {
  assert.equal(draftStrengthToFamily("required"), "policy");
  assert.equal(draftStrengthToFamily("advisory"), "think");
  assert.equal(draftStrengthToFamily("verify"), "review");
  assert.equal(draftStrengthToFamily("step"), "do");
});

test("buildDraftGuidanceRulePayload workflow scopeDraft", () => {
  const d = buildDraftGuidanceRulePayload({
    title: "Test title",
    strengthRaw: "advisory",
    priority: 500,
    scopePreset: "workflow",
    workflowName: "cae-guidance-preview"
  });
  assert.equal(d.schemaVersion, 1);
  assert.equal(d.family, "think");
  assert.deepEqual(d.scopeDraft, { preset: "workflow", workflowName: "cae-guidance-preview" });
});

test("buildDraftGuidanceRulePayload phase preset", () => {
  const d = buildDraftGuidanceRulePayload({
    title: "P",
    strengthRaw: "required",
    priority: 1,
    scopePreset: "phase",
    phaseKey: "phase-99"
  });
  assert.equal(d.family, "policy");
  assert.deepEqual(d.scopeDraft, { preset: "phase", phaseKey: "phase-99" });
});

test("withAcknowledgement adds acknowledgement when tier set", () => {
  const base = buildDraftGuidanceRulePayload({
    title: "A",
    strengthRaw: "advisory",
    priority: 750,
    scopePreset: "always"
  });
  const w = withAcknowledgement(base, "surface", "trace-xyz");
  assert.ok(w.acknowledgement && typeof w.acknowledgement === "object");
  assert.equal(w.acknowledgement.strength, "surface");
  assert.ok(String(w.acknowledgement.token || "").length >= 8);
});

test("withAcknowledgement skips when none / empty", () => {
  const base = buildDraftGuidanceRulePayload({
    title: "A",
    strengthRaw: "advisory",
    priority: 750,
    scopePreset: "workflow",
    workflowName: "x"
  });
  assert.equal(withAcknowledgement(base, "none"), base);
});
