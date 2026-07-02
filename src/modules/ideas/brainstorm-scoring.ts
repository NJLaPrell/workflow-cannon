/**
 * Canonical brainstorm session scoring formulas.
 * Verbatim formulas are authored in `schemas/ideas/states/brainstorming.schema.json` agentDirective.computeSteps.
 */

import type { BrainstormScoreInputs, BrainstormSession, BrainstormTShirtSize } from "./idea-plan-types.js";

export const BRAINSTORM_SCORING_SUB_INPUT_FIELDS = [
  "valueImpact",
  "valueReach",
  "valueUrgency",
  "valueStrategicFit",
  "riskTechnical",
  "riskOperational",
  "riskUnknowns",
  "riskReversibility",
  "tShirtSize",
  "complexity",
  "confidenceEvidence",
  "confidenceExpertise",
  "confidenceClarity"
] as const;

export type BrainstormScoringSubInputField = (typeof BRAINSTORM_SCORING_SUB_INPUT_FIELDS)[number];

export type BrainstormScoringInputs = {
  valueImpact: number;
  valueReach: number;
  valueUrgency: number;
  valueStrategicFit: number;
  riskTechnical: number;
  riskOperational: number;
  riskUnknowns: number;
  riskReversibility: number;
  tShirtSize: BrainstormTShirtSize;
  complexity: number;
  confidenceEvidence: number;
  confidenceExpertise: number;
  confidenceClarity: number;
};

export const BRAINSTORM_T_SHIRT_SIZE_SCORES: Record<BrainstormTShirtSize, number> = {
  XS: 2,
  S: 4,
  M: 6,
  L: 8,
  XL: 10
};

/** valueScore = (valueImpact × 0.30) + (valueReach × 0.25) + (valueUrgency × 0.20) + (valueStrategicFit × 0.25) */
export function computeValueScore(
  inputs: Pick<BrainstormScoringInputs, "valueImpact" | "valueReach" | "valueUrgency" | "valueStrategicFit">
): number {
  return (
    inputs.valueImpact * 0.3 +
    inputs.valueReach * 0.25 +
    inputs.valueUrgency * 0.2 +
    inputs.valueStrategicFit * 0.25
  );
}

/** riskScore = (riskTechnical × 0.35) + (riskOperational × 0.25) + (riskUnknowns × 0.25) + (riskReversibility × 0.15) */
export function computeRiskScore(
  inputs: Pick<
    BrainstormScoringInputs,
    "riskTechnical" | "riskOperational" | "riskUnknowns" | "riskReversibility"
  >
): number {
  return (
    inputs.riskTechnical * 0.35 +
    inputs.riskOperational * 0.25 +
    inputs.riskUnknowns * 0.25 +
    inputs.riskReversibility * 0.15
  );
}

/**
 * effortScore = (tShirtSizeScore × 0.40) + (complexity × 0.60)
 * tShirtSizeScore map: XS=2, S=4, M=6, L=8, XL=10
 */
export function computeEffortScore(inputs: Pick<BrainstormScoringInputs, "tShirtSize" | "complexity">): number {
  const tShirtSizeScore = BRAINSTORM_T_SHIRT_SIZE_SCORES[inputs.tShirtSize];
  return tShirtSizeScore * 0.4 + inputs.complexity * 0.6;
}

/** confidenceScore = (confidenceEvidence × 0.35) + (confidenceExpertise × 0.30) + (confidenceClarity × 0.35) */
export function computeConfidenceScore(
  inputs: Pick<BrainstormScoringInputs, "confidenceEvidence" | "confidenceExpertise" | "confidenceClarity">
): number {
  return inputs.confidenceEvidence * 0.35 + inputs.confidenceExpertise * 0.3 + inputs.confidenceClarity * 0.35;
}

/**
 * priorityScore = (valueScore × 0.35) + ((10 − riskScore) × 0.20) + ((10 − effortScore) × 0.25) + (confidenceScore × 0.20)
 */
export function computePriorityScore(scores: {
  valueScore: number;
  riskScore: number;
  effortScore: number;
  confidenceScore: number;
}): number {
  return (
    scores.valueScore * 0.35 +
    (10 - scores.riskScore) * 0.2 +
    (10 - scores.effortScore) * 0.25 +
    scores.confidenceScore * 0.2
  );
}

export function computeBrainstormSessionScores(inputs: BrainstormScoringInputs): Required<
  Pick<BrainstormScoreInputs, "value" | "risk" | "effort" | "confidence">
> & { priority: number } {
  const valueScore = computeValueScore(inputs);
  const riskScore = computeRiskScore(inputs);
  const effortScore = computeEffortScore(inputs);
  const confidenceScore = computeConfidenceScore(inputs);
  const priorityScore = computePriorityScore({ valueScore, riskScore, effortScore, confidenceScore });
  return {
    value: roundScore(valueScore),
    risk: roundScore(riskScore),
    effort: roundScore(effortScore),
    confidence: roundScore(confidenceScore),
    priority: roundScore(priorityScore)
  };
}

export type BrainstormScoreKey = "value" | "risk" | "effort" | "confidence";

export function hasCompleteBrainstormScoringInputs(
  inputs: Record<string, unknown> | undefined
): inputs is BrainstormScoringInputs {
  if (!inputs) {
    return false;
  }
  for (const field of BRAINSTORM_SCORING_SUB_INPUT_FIELDS) {
    const value = inputs[field];
    if (field === "tShirtSize") {
      if (typeof value !== "string" || !(value in BRAINSTORM_T_SHIRT_SIZE_SCORES)) {
        return false;
      }
      continue;
    }
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return false;
    }
  }
  return true;
}

function roundScore(score: number): number {
  return Math.round(score * 1000) / 1000;
}

function mean(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/**
 * When sessions.length===1, synthesized=session scores; else synthesized=latest×0.60+mean(prior)×0.40
 */
export function synthesizeBrainstormScores(sessions: BrainstormSession[]): BrainstormScoreInputs | undefined {
  const completed = sessions.filter((session) => session.scores);
  if (completed.length === 0) {
    return undefined;
  }
  if (completed.length === 1) {
    return { ...completed[0]!.scores };
  }
  const latest = completed[completed.length - 1]!.scores!;
  const prior = completed.slice(0, -1).map((session) => session.scores!);
  const keys: BrainstormScoreKey[] = ["value", "risk", "effort", "confidence"];
  const synthesized: BrainstormScoreInputs = {};
  for (const key of keys) {
    const latestValue = latest[key];
    if (typeof latestValue !== "number") {
      continue;
    }
    const priorValues = prior.map((scores) => scores[key]).filter((value): value is number => typeof value === "number");
    synthesized[key] = roundScore(latestValue * 0.6 + mean(priorValues) * 0.4);
  }
  return synthesized;
}
