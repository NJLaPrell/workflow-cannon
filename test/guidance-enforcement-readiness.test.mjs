/**
 * Enforcement-readiness contract (T1005).
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  assertDraftRuleHasNoEnforcementFlags,
  computeGuidanceEnforcementReadiness
} from "../dist/core/cae/guidance-enforcement-readiness.js";
import { coerceDraftGuidanceRuleInput } from "../dist/core/cae/guidance-draft-impact-preview.js";

function minimalImpact(overrides = {}) {
  return {
    schemaVersion: 1,
    draftArtifactId: "cae.preview.draft.artifact",
    draftActivationId: "cae.preview.draft.activation",
    scopePreset: "workflow",
    scopePlainSummary: "Workflow-intent draft",
    overlayRegistryDigestSnippet: "sha256:abcdabcdabcdabcdabcdabcd",
    scopeWarnings: [],
    scopeErrors: [],
    broadScopeWarnings: [],
    primarySampleLabel: "Primary",
    samples: [],
    blastRadiusSummary: {
      schemaVersion: 1,
      draftScopeCategory: "workflow_intent",
      totalSamplesEvaluated: 1,
      samplesWhereDraftMatched: 0,
      representativeMatchedLabels: [],
      planningTasksIncluded: 0,
      tallyBySampleKindWhereDraftMatched: {}
    },
    activationReadiness: {
      schemaVersion: 1,
      level: "ok",
      reasons: [
        { code: "cae-readiness-clean", message: "clean", severity: "info" }
      ],
      primaryPreviewTraceId: "cae.trace.example",
      conflictEntryCount: 0,
      conflictsInvolvingDraft: 0,
      sameFamilyConflictSubset: [],
      usefulnessSignal: "absent",
      overlayPendingAckCount: 0,
      baselinePendingAckCount: 0,
      acknowledgementDelta: 0
    },
    ...overrides
  };
}

test("computeGuidanceEnforcementReadiness marks think family as not hard-stop capable", () => {
  const er = computeGuidanceEnforcementReadiness(minimalImpact(), "think", "2026-04-29T00:00:00.000Z", null);
  assert.equal(er.familyHardStopCapable, false);
  assert.equal(er.previewGatesSatisfied, false);
  assert.equal(er.governanceEvidenceComplete, false);
  assert.ok(er.blockingCodes.includes("cae-enforce-family-advisory-only"));
});

test("computeGuidanceEnforcementReadiness blocks stop_confirm activation level", () => {
  const imp = minimalImpact({
    activationReadiness: {
      schemaVersion: 1,
      level: "stop_confirm",
      reasons: [
        {
          code: "cae-readiness-always-policy",
          message: "always-on",
          severity: "block"
        }
      ],
      primaryPreviewTraceId: "t",
      conflictEntryCount: 0,
      conflictsInvolvingDraft: 0,
      sameFamilyConflictSubset: [],
      usefulnessSignal: "absent",
      overlayPendingAckCount: 0,
      baselinePendingAckCount: 0,
      acknowledgementDelta: 0
    }
  });
  const er = computeGuidanceEnforcementReadiness(imp, "policy", "2026-04-29T00:00:00.000Z", null);
  assert.equal(er.previewGatesSatisfied, false);
  assert.equal(er.conflictStatus, "blocking");
  assert.ok(er.blockingCodes.includes("cae-enforce-activation-stop-confirm"));
});

test("computeGuidanceEnforcementReadiness reaches governance complete with evidence + ok preview", () => {
  const imp = minimalImpact();
  const gov = {
    schemaVersion: 1,
    registryMutationAuditId: "audit-row-1",
    rollbackTargetVersionId: "cae.reg.prev",
    actor: "ops@example.com",
    rationale: "Published after green preview"
  };
  const er = computeGuidanceEnforcementReadiness(imp, "policy", "2026-04-29T00:00:00.000Z", gov);
  assert.equal(er.previewGatesSatisfied, true);
  assert.equal(er.governanceEvidenceComplete, true);
  assert.ok(!er.blockingCodes.includes("cae-enforce-governance-evidence-incomplete"));
});

test("assertDraftRuleHasNoEnforcementFlags rejects enforcement key", () => {
  const r = assertDraftRuleHasNoEnforcementFlags({ schemaVersion: 1, enforcement: true });
  assert.equal(r.ok, false);
  assert.equal(r.code, "cae-enforce-draft-flag-forbidden");
});

test("coerceDraftGuidanceRuleInput rejects enforcement sneaker fields", () => {
  const bad = coerceDraftGuidanceRuleInput({
    schemaVersion: 1,
    title: "n",
    family: "think",
    priority: 1,
    scopeDraft: { preset: "workflow", workflowName: "get-next-actions" },
    hardStop: true
  });
  assert.equal(bad.ok, false);
  assert.equal(bad.code, "cae-enforce-draft-flag-forbidden");
});
