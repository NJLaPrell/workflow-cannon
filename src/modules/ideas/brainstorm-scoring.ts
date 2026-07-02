/**
 * Canonical brainstorm session scoring formulas.
 * Weights and priority normalization are authored in
 * `schemas/ideas/states/brainstorming.schema.json` agentDirective.computeSteps.
 */

import type { AgentDirective } from "./idea-plan-types.js";
import type { BrainstormScoreInputs, BrainstormSession, BrainstormTShirtSize } from "./idea-plan-types.js";
import { loadIdeaPlanStateSchema, resolveIdeaPlanStateSchemaRoot } from "./idea-plan-state-schema-loader.js";

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

export type BrainstormScoringWeightTerm = {
  field: string;
  weight: number;
};

export type BrainstormPriorityWeightTerm = {
  score: string;
  weight: number;
  sign: "+" | "-";
};

export type BrainstormScoringWeights = {
  value: BrainstormScoringWeightTerm[];
  risk: BrainstormScoringWeightTerm[];
  effort: BrainstormScoringWeightTerm[];
  confidence: BrainstormScoringWeightTerm[];
  priority: BrainstormPriorityWeightTerm[];
  priorityNormalization: {
    offset: number;
    divisor: number;
  };
};

export type BrainstormScoringEngine = {
  weights: BrainstormScoringWeights;
  computeValueScore: (
    inputs: Pick<BrainstormScoringInputs, "valueImpact" | "valueReach" | "valueUrgency" | "valueStrategicFit">
  ) => number;
  computeRiskScore: (
    inputs: Pick<
      BrainstormScoringInputs,
      "riskTechnical" | "riskOperational" | "riskUnknowns" | "riskReversibility"
    >
  ) => number;
  computeEffortScore: (inputs: Pick<BrainstormScoringInputs, "tShirtSize" | "complexity">) => number;
  computeConfidenceScore: (
    inputs: Pick<BrainstormScoringInputs, "confidenceEvidence" | "confidenceExpertise" | "confidenceClarity">
  ) => number;
  computePriorityScore: (scores: {
    valueScore: number;
    riskScore: number;
    effortScore: number;
    confidenceScore: number;
  }) => number;
  computeBrainstormSessionScores: (
    inputs: BrainstormScoringInputs
  ) => Required<Pick<BrainstormScoreInputs, "value" | "risk" | "effort" | "confidence">> & {
    priority: number;
    tShirtSize: BrainstormTShirtSize;
    complexity: number;
  };
};

const WEIGHTED_TERM_PATTERN = /\(([a-zA-Z][a-zA-Z0-9]*) [×x] ([0-9.]+)\)/g;
const PRIORITY_NORMALIZATION_PATTERN = /rawPriority \+ ([0-9.]+)\) \/ ([0-9.]+)/;

function parseWeightedTerms(formula: string): BrainstormScoringWeightTerm[] {
  const terms: BrainstormScoringWeightTerm[] = [];
  for (const match of formula.matchAll(WEIGHTED_TERM_PATTERN)) {
    const field = match[1]!;
    const weight = Number(match[2]);
    if (!Number.isFinite(weight)) {
      continue;
    }
    terms.push({ field, weight });
  }
  return terms;
}

function parsePriorityTerms(formula: string): BrainstormPriorityWeightTerm[] {
  const rawSection = (formula.split(";")[0] ?? formula).replace(/×\s*10.*$/, "");
  const terms: BrainstormPriorityWeightTerm[] = [];
  for (const match of rawSection.matchAll(/\(([a-zA-Z][a-zA-Z0-9]*) [×x] ([0-9.]+)\)/g)) {
    const index = match.index ?? 0;
    const prefix = rawSection.slice(0, index).trimEnd();
    const sign: "+" | "-" =
      prefix.endsWith("−") || prefix.endsWith("-") || /[−-]\s*$/.test(prefix) ? "-" : "+";
    terms.push({
      score: match[1]!,
      weight: Number(match[2]),
      sign
    });
  }
  return terms;
}

function parsePriorityNormalization(formula: string): { offset: number; divisor: number } {
  const match = formula.match(PRIORITY_NORMALIZATION_PATTERN);
  if (!match) {
    throw new Error("priorityScore computeStep is missing rawPriority normalization constants");
  }
  return {
    offset: Number(match[1]),
    divisor: Number(match[2])
  };
}

function resolveComputeStepFormula(directive: AgentDirective, stepId: string): string {
  const step = directive.computeSteps?.find((entry) => entry.id === stepId);
  if (!step?.formula) {
    throw new Error(`Missing agentDirective.computeSteps entry '${stepId}'`);
  }
  return step.formula;
}

export function loadBrainstormScoringWeights(
  workspacePath?: string,
  directive?: AgentDirective
): BrainstormScoringWeights {
  const agentDirective = directive ?? loadIdeaPlanStateSchema("brainstorming", workspacePath).agentDirective;
  const priorityFormula = resolveComputeStepFormula(agentDirective, "priorityScore");
  return {
    value: parseWeightedTerms(resolveComputeStepFormula(agentDirective, "valueScore")),
    risk: parseWeightedTerms(resolveComputeStepFormula(agentDirective, "riskScore")),
    effort: parseWeightedTerms(resolveComputeStepFormula(agentDirective, "effortScore")),
    confidence: parseWeightedTerms(resolveComputeStepFormula(agentDirective, "confidenceScore")),
    priority: parsePriorityTerms(priorityFormula),
    priorityNormalization: parsePriorityNormalization(priorityFormula)
  };
}

function weightedSum(
  terms: BrainstormScoringWeightTerm[],
  values: Record<string, number>
): number {
  return terms.reduce((sum, term) => sum + (values[term.field] ?? 0) * term.weight, 0);
}

function buildScoringEngine(weights: BrainstormScoringWeights): BrainstormScoringEngine {
  const computeValueScore: BrainstormScoringEngine["computeValueScore"] = (inputs) =>
    weightedSum(weights.value, inputs);

  const computeRiskScore: BrainstormScoringEngine["computeRiskScore"] = (inputs) =>
    weightedSum(weights.risk, inputs);

  const computeEffortScore: BrainstormScoringEngine["computeEffortScore"] = (inputs) => {
    const values: Record<string, number> = {
      tShirtSizeScore: BRAINSTORM_T_SHIRT_SIZE_SCORES[inputs.tShirtSize],
      complexity: inputs.complexity
    };
    return weightedSum(weights.effort, values);
  };

  const computeConfidenceScore: BrainstormScoringEngine["computeConfidenceScore"] = (inputs) =>
    weightedSum(weights.confidence, inputs);

  const computePriorityScore: BrainstormScoringEngine["computePriorityScore"] = (scores) => {
    const values = {
      valueScore: scores.valueScore,
      riskScore: scores.riskScore,
      effortScore: scores.effortScore,
      confidenceScore: scores.confidenceScore
    };
    let rawPriority = 0;
    for (const term of weights.priority) {
      const contribution = (values[term.score as keyof typeof values] ?? 0) * term.weight;
      rawPriority += term.sign === "-" ? -contribution : contribution;
    }
    if (weights.priorityNormalization.divisor === 0) {
      throw new Error("priorityScore normalization divisor must be non-zero");
    }
    rawPriority *= 10;
    return Math.round(
      ((rawPriority + weights.priorityNormalization.offset) / weights.priorityNormalization.divisor) * 100
    );
  };

  const computeBrainstormSessionScores: BrainstormScoringEngine["computeBrainstormSessionScores"] = (inputs) => {
    const valueScore = computeValueScore(inputs);
    const riskScore = computeRiskScore(inputs);
    const effortScore = computeEffortScore(inputs);
    const confidenceScore = computeConfidenceScore(inputs);
    const priority = computePriorityScore({ valueScore, riskScore, effortScore, confidenceScore });
    return {
      value: roundScore(valueScore),
      risk: roundScore(riskScore),
      effort: roundScore(effortScore),
      confidence: roundScore(confidenceScore),
      priority,
      tShirtSize: inputs.tShirtSize,
      complexity: roundScore(inputs.complexity)
    };
  };

  return {
    weights,
    computeValueScore,
    computeRiskScore,
    computeEffortScore,
    computeConfidenceScore,
    computePriorityScore,
    computeBrainstormSessionScores
  };
}

export function createBrainstormScoringEngine(
  workspacePath?: string,
  directive?: AgentDirective
): BrainstormScoringEngine {
  const weights = loadBrainstormScoringWeights(workspacePath, directive);
  return buildScoringEngine(weights);
}

let defaultEngine: BrainstormScoringEngine | undefined;

function getDefaultEngine(): BrainstormScoringEngine {
  if (!defaultEngine) {
    defaultEngine = createBrainstormScoringEngine(resolveIdeaPlanStateSchemaRoot());
  }
  return defaultEngine;
}

/** valueScore = weighted average of value sub-inputs (weights from brainstorming schema). */
export function computeValueScore(
  inputs: Pick<BrainstormScoringInputs, "valueImpact" | "valueReach" | "valueUrgency" | "valueStrategicFit">
): number {
  return getDefaultEngine().computeValueScore(inputs);
}

/** riskScore = weighted average of risk sub-inputs (weights from brainstorming schema). */
export function computeRiskScore(
  inputs: Pick<
    BrainstormScoringInputs,
    "riskTechnical" | "riskOperational" | "riskUnknowns" | "riskReversibility"
  >
): number {
  return getDefaultEngine().computeRiskScore(inputs);
}

/** effortScore = blend of T-shirt size score and complexity (weights from brainstorming schema). */
export function computeEffortScore(inputs: Pick<BrainstormScoringInputs, "tShirtSize" | "complexity">): number {
  return getDefaultEngine().computeEffortScore(inputs);
}

/** confidenceScore = weighted average of confidence sub-inputs (weights from brainstorming schema). */
export function computeConfidenceScore(
  inputs: Pick<BrainstormScoringInputs, "confidenceEvidence" | "confidenceExpertise" | "confidenceClarity">
): number {
  return getDefaultEngine().computeConfidenceScore(inputs);
}

/** priorityScore = schema-weighted blend normalized to 0–100. */
export function computePriorityScore(scores: {
  valueScore: number;
  riskScore: number;
  effortScore: number;
  confidenceScore: number;
}): number {
  return getDefaultEngine().computePriorityScore(scores);
}

export function computeBrainstormSessionScores(inputs: BrainstormScoringInputs): ReturnType<
  BrainstormScoringEngine["computeBrainstormSessionScores"]
> {
  return getDefaultEngine().computeBrainstormSessionScores(inputs);
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
