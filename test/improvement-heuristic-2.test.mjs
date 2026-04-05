import test from "node:test";
import assert from "node:assert/strict";
import {
  computeHeuristic2Confidence,
  HEURISTIC_2_ADMISSION_THRESHOLD,
  resolveConfidenceForHeuristicVersion,
  shouldAdmitForHeuristicVersion
} from "../dist/modules/improvement/confidence-heuristic-2.js";

test("computeHeuristic2Confidence: golden mean transcript signal", () => {
  const r = computeHeuristic2Confidence("transcript", { transcriptFriction: 0.5 });
  assert.ok(Math.abs(r.score - Math.min(1, 0.5 * 1.15)) < 1e-9);
  assert.equal(r.tier, "medium");
});

test("heuristic v2 can admit when v1 max would reject (mean path)", () => {
  const signals = { transcriptFriction: 0.34, policyDenial: 0.34 };
  const c1 = resolveConfidenceForHeuristicVersion(1, "transcript", signals);
  const c2 = resolveConfidenceForHeuristicVersion(2, "transcript", signals);
  assert.equal(c1.score, 0.34);
  assert.ok(c2.score >= HEURISTIC_2_ADMISSION_THRESHOLD);
  assert.equal(shouldAdmitForHeuristicVersion(1, c1), false);
  assert.equal(shouldAdmitForHeuristicVersion(2, c2), true);
});

test("shouldAdmitForHeuristicVersion v1 matches legacy threshold", () => {
  const c = resolveConfidenceForHeuristicVersion(1, "policy_deny", { policyDenial: 0.35 });
  assert.equal(shouldAdmitForHeuristicVersion(1, c), true);
});
