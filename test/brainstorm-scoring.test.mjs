import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import path from "node:path";
import test from "node:test";

import {
  computeBrainstormSessionScores,
  computePriorityScore,
  computeValueScore,
  createBrainstormScoringEngine,
  loadBrainstormScoringWeights
} from "../dist/modules/planning/brainstorm/brainstorm-scoring.js";
import { loadIdeaPlanStateSchema } from "../dist/modules/planning/idea-plan/idea-plan-state-schema-loader.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const KNOWN_INPUTS = {
  valueImpact: 8,
  valueReach: 7,
  valueUrgency: 6,
  valueStrategicFit: 9,
  riskTechnical: 5,
  riskOperational: 4,
  riskUnknowns: 6,
  riskReversibility: 3,
  tShirtSize: "M",
  complexity: 9,
  confidenceEvidence: 7,
  confidenceExpertise: 8,
  confidenceClarity: 6
};

function round3(value) {
  return Math.round(value * 1000) / 1000;
}

test("scoring engine produces correct aggregate scores for known inputs", () => {
  const engine = createBrainstormScoringEngine(root);
  assert.equal(round3(engine.computeValueScore(KNOWN_INPUTS)), 7.6);
  assert.equal(round3(engine.computeRiskScore(KNOWN_INPUTS)), 4.7);
  assert.equal(round3(engine.computeEffortScore(KNOWN_INPUTS)), 7.8);
  assert.equal(round3(engine.computeConfidenceScore(KNOWN_INPUTS)), 6.95);
  assert.equal(
    engine.computePriorityScore({
      valueScore: 7.6,
      riskScore: 4.7,
      effortScore: 7.8,
      confidenceScore: 6.95
    }),
    61
  );

  const computed = computeBrainstormSessionScores(KNOWN_INPUTS);
  assert.equal(computed.value, 7.6);
  assert.equal(computed.risk, 4.7);
  assert.equal(computed.effort, 7.8);
  assert.equal(computed.confidence, 6.95);
  assert.equal(computed.priority, 61);
});

test("priorityScore normalization yields 0 at minimum and 100 at maximum aggregate scores", () => {
  const engine = createBrainstormScoringEngine(root);
  assert.equal(
    engine.computePriorityScore({ valueScore: 1, riskScore: 10, effortScore: 10, confidenceScore: 1 }),
    0
  );
  assert.equal(
    engine.computePriorityScore({ valueScore: 10, riskScore: 1, effortScore: 1, confidenceScore: 10 }),
    100
  );
  assert.equal(
    engine.computePriorityScore({ valueScore: 5.5, riskScore: 5.5, effortScore: 5.5, confidenceScore: 5.5 }),
    50
  );
});

test("scoring engine reads weights from brainstorming schema and reacts to directive mutation", () => {
  const directive = structuredClone(loadIdeaPlanStateSchema("brainstorming", root).agentDirective);
  const baseline = createBrainstormScoringEngine(root, directive);
  const baselineValue = baseline.computeValueScore({
    valueImpact: 10,
    valueReach: 1,
    valueUrgency: 1,
    valueStrategicFit: 1
  });

  const valueStep = directive.computeSteps?.find((step) => step.id === "valueScore");
  assert.ok(valueStep);
  valueStep.formula = valueStep.formula.replace("0.30", "0.90");
  const mutated = createBrainstormScoringEngine(root, directive);
  const mutatedValue = mutated.computeValueScore({
    valueImpact: 10,
    valueReach: 1,
    valueUrgency: 1,
    valueStrategicFit: 1
  });

  assert.ok(mutatedValue > baselineValue);
  const baselineWeights = loadBrainstormScoringWeights(root);
  const mutatedWeights = loadBrainstormScoringWeights(root, directive);
  assert.ok(mutatedWeights.value[0].weight > baselineWeights.value[0].weight);
});

test("computePriorityScore uses schema normalization constants", () => {
  const weights = loadBrainstormScoringWeights(root);
  assert.equal(weights.priorityNormalization.offset, 34);
  assert.equal(weights.priorityNormalization.divisor, 90);
  assert.equal(round3(computeValueScore(KNOWN_INPUTS)), 7.6);
  assert.equal(
    computePriorityScore({
      valueScore: round3(computeValueScore(KNOWN_INPUTS)),
      riskScore: 4.7,
      effortScore: 7.8,
      confidenceScore: 6.95
    }),
    61
  );
});
