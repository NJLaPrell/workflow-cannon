import type { PlanningWorkflowType } from "./types.js";

export type PlanningWishlistArtifact = {
  schemaVersion: 1;
  planningType: PlanningWorkflowType;
  generatedAt: string;
  goals: string[];
  approach: string;
  majorTechnicalDecisions: string[];
  candidateFeaturesOrChanges: string[];
  assumptions: string[];
  openQuestions: string[];
  risksAndConstraints: string[];
  sourceAnswers: Record<string, string>;
};

function answer(answers: Record<string, unknown>, key: string, fallback: string): string {
  const value = answers[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    return fallback;
  }
  return value.trim();
}

function list(answers: Record<string, unknown>, key: string): string[] {
  const value = answers[key];
  if (Array.isArray(value)) {
    return value.filter((x): x is string => typeof x === "string" && x.trim().length > 0).map((x) => x.trim());
  }
  if (typeof value === "string" && value.trim().length > 0) {
    return [value.trim()];
  }
  return [];
}

export function composePlanningWishlistArtifact(args: {
  planningType: PlanningWorkflowType;
  answers: Record<string, unknown>;
  unresolvedCriticalQuestionIds: string[];
}): PlanningWishlistArtifact {
  const { planningType, answers, unresolvedCriticalQuestionIds } = args;
  const sourceAnswers: Record<string, string> = {};
  for (const [key, value] of Object.entries(answers)) {
    if (typeof value === "string" && value.trim().length > 0) {
      sourceAnswers[key] = value.trim();
    }
  }

  const goals = list(answers, "goals");
  if (goals.length === 0) {
    const inferredGoal =
      answer(answers, "goal", "") ||
      answer(answers, "featureGoal", "") ||
      answer(answers, "changeGoal", "");
    if (inferredGoal) goals.push(inferredGoal);
  }

  const candidate = list(answers, "candidateFeaturesOrChanges");
  if (candidate.length === 0) {
    const inferred = answer(answers, "scope", "");
    if (inferred) candidate.push(inferred);
  }

  const majorTechnicalDecisions = list(answers, "majorTechnicalDecisions");
  const decisionRationale = answer(answers, "decisionRationale", "");
  if (decisionRationale && majorTechnicalDecisions.length === 0) {
    majorTechnicalDecisions.push(decisionRationale);
  }

  const assumptions = list(answers, "assumptions");
  const openQuestions = [
    ...list(answers, "openQuestions"),
    ...unresolvedCriticalQuestionIds.map((id) => `Unresolved critical question: ${id}`)
  ];

  const risksAndConstraints = list(answers, "risksAndConstraints");
  const constraints = answer(answers, "constraints", "");
  if (constraints) {
    risksAndConstraints.push(`Constraint: ${constraints}`);
  }
  const riskPriority = answer(answers, "riskPriority", "");
  if (riskPriority) {
    risksAndConstraints.push(`Risk priority: ${riskPriority}`);
  }

  return {
    schemaVersion: 1,
    planningType,
    generatedAt: new Date().toISOString(),
    goals,
    approach: answer(answers, "approach", "Context-driven workflow guided by planning rules."),
    majorTechnicalDecisions,
    candidateFeaturesOrChanges: candidate,
    assumptions,
    openQuestions,
    risksAndConstraints,
    sourceAnswers
  };
}
