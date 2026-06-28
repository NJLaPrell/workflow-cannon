/**
 * WP-6.2 / T100469 — resolvePlanArtifactPhaseProposal unit tests.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  countDescriptionWords,
  PLAN_ARTIFACT_PHASE_DESCRIPTION_MAX_WORDS,
  resolveNextEmptyNumericPhaseKey,
  resolvePlanArtifactPhaseProposal
} from "../dist/core/planning/resolve-plan-artifact-phase-proposal.js";

const RECOMMENDATIONS = [
  { phaseKey: "110", label: "Phase 110", rationale: "Primary tranche", isPrimary: true },
  { phaseKey: "111", label: "Phase 111", rationale: "Follow-on", isPrimary: false }
];

describe("resolvePlanArtifactPhaseProposal (T100469)", () => {
  it("uses explicit targetPhaseKey and targetPhase label", () => {
    const result = resolvePlanArtifactPhaseProposal({
      targetPhaseKey: "112",
      targetPhase: "Phase 112 Custom",
      phaseRecommendations: RECOMMENDATIONS,
      activePhaseKeys: ["110"]
    });
    assert.equal(result.ok, true);
    assert.equal(result.source, "explicit");
    assert.deepEqual(result.proposal, {
      phaseKey: "112",
      label: "Phase 112 Custom",
      description: ""
    });
    assert.equal(result.findings.length, 0);
  });

  it("auto-selects next empty phase key when no override", () => {
    const result = resolvePlanArtifactPhaseProposal({
      phaseRecommendations: [],
      occupiedPhaseKeys: ["108", "110", "112"]
    });
    assert.equal(result.ok, true);
    assert.equal(result.source, "auto-empty");
    assert.equal(result.proposal.phaseKey, "113");
    assert.equal(result.proposal.label, "Phase 113");
  });

  it("resolveNextEmptyNumericPhaseKey skips occupied ordinals", () => {
    assert.equal(resolveNextEmptyNumericPhaseKey(["137", "139"], ["134"]), "140");
  });

  it("prefers workspace nextKitPhase over plan recommendations", () => {
    const result = resolvePlanArtifactPhaseProposal({
      phaseRecommendations: RECOMMENDATIONS,
      workspaceNextPhaseKey: "139",
      occupiedPhaseKeys: ["137", "139"],
      activePhaseKeys: ["139"]
    });
    assert.equal(result.ok, true);
    assert.equal(result.source, "workspace-next");
    assert.equal(result.proposal.phaseKey, "139");
    assert.equal(result.proposal.label, "Phase 139");
  });

  it("uses auto-empty when workspace next is omitted", () => {
    const result = resolvePlanArtifactPhaseProposal({
      phaseRecommendations: RECOMMENDATIONS,
      occupiedPhaseKeys: ["110", "111"]
    });
    assert.equal(result.ok, true);
    assert.equal(result.source, "auto-empty");
    assert.equal(result.proposal.phaseKey, "112");
  });

  it("blocks phase key collision unless allowPhaseKeyCollision", () => {
    const blocked = resolvePlanArtifactPhaseProposal({
      targetPhaseKey: "110",
      phaseRecommendations: RECOMMENDATIONS,
      activePhaseKeys: ["110"]
    });
    assert.equal(blocked.ok, false);
    assert.equal(blocked.code, "plan-artifact-phase-proposal-blocked");
    assert.ok(blocked.findings.some((f) => f.code === "PLAN-PHASE-KEY-COLLISION"));

    const allowed = resolvePlanArtifactPhaseProposal({
      targetPhaseKey: "110",
      phaseRecommendations: RECOMMENDATIONS,
      activePhaseKeys: ["110"],
      allowPhaseKeyCollision: true
    });
    assert.equal(allowed.ok, true);
    assert.equal(allowed.proposal.phaseKey, "110");
  });

  it("warns on long description in non-strict mode", () => {
    const long = "one two three four five six";
    const result = resolvePlanArtifactPhaseProposal({
      targetPhaseKey: "112",
      phaseShortDescription: long,
      phaseRecommendations: RECOMMENDATIONS,
      strict: false
    });
    assert.equal(result.ok, true);
    assert.equal(result.findings.length, 1);
    assert.equal(result.findings[0].code, "PLAN-PHASE-DESCRIPTION-LONG");
    assert.equal(result.findings[0].severity, "warning");
  });

  it("blocks long description in strict mode", () => {
    const result = resolvePlanArtifactPhaseProposal({
      targetPhaseKey: "112",
      phaseShortDescription: "one two three four five six",
      phaseRecommendations: RECOMMENDATIONS,
      strict: true
    });
    assert.equal(result.ok, false);
    assert.ok(result.findings.some((f) => f.code === "PLAN-PHASE-DESCRIPTION-LONG" && f.severity === "blocker"));
  });

  it("is deterministic for identical input", () => {
    const input = {
      preferredPhaseKey: "115",
      targetPhase: "Phase 115",
      phaseShortDescription: "Planner finalize slice",
      phaseRecommendations: RECOMMENDATIONS,
      activePhaseKeys: ["110", "114"]
    };
    const a = resolvePlanArtifactPhaseProposal(input);
    const b = resolvePlanArtifactPhaseProposal(input);
    assert.deepEqual(a, b);
  });

  it("countDescriptionWords respects five-word target", () => {
    assert.equal(countDescriptionWords(""), 0);
    assert.equal(countDescriptionWords("  one   two  "), 2);
    assert.equal(countDescriptionWords("alpha beta gamma delta epsilon"), PLAN_ARTIFACT_PHASE_DESCRIPTION_MAX_WORDS);
  });
});
