import { persistBuildPlanSession } from "../../core/planning/index.js";

export type PlanningOutputMode = "wishlist" | "tasks" | "response";

export function resolveOutputMode(args: Record<string, unknown>): {
  ok: true;
  mode: PlanningOutputMode;
} | {
  ok: false;
  message: string;
} {
  const raw = typeof args.outputMode === "string" ? args.outputMode.trim() : "";
  if (raw === "") {
    return { ok: true, mode: "wishlist" };
  }
  if (raw === "wishlist" || raw === "tasks" || raw === "response") {
    return { ok: true, mode: raw };
  }
  return {
    ok: false,
    message: "build-plan outputMode must be one of: wishlist, tasks, response"
  };
}

export function findMissingAnsweredQuestions(
  questions: { id: string }[],
  answers: Record<string, unknown>
): { id: string }[] {
  return questions.filter((q) => {
    const value = answers[q.id];
    return !(typeof value === "string" && value.trim().length > 0);
  });
}

function toNormalizedText(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function buildScoringHints(args: {
  planningType: string;
  answers: Record<string, unknown>;
  unresolvedCriticalCount: number;
  unresolvedAdaptiveCount: number;
}): Record<string, unknown> | null {
  const { planningType, answers, unresolvedCriticalCount, unresolvedAdaptiveCount } = args;
  const signals = [
    toNormalizedText(answers.complexity),
    toNormalizedText(answers.riskPriority),
    toNormalizedText(answers.timeline),
    toNormalizedText(answers.compatibilityRisk)
  ];
  const hasSignal = signals.some((s) => s.length > 0) || unresolvedCriticalCount > 0 || unresolvedAdaptiveCount > 0;
  if (!hasSignal) {
    return null;
  }

  let riskScore = Math.min(100, unresolvedCriticalCount * 20 + unresolvedAdaptiveCount * 10);
  if (signals.some((s) => s.includes("high") || s.includes("critical"))) {
    riskScore = Math.min(100, riskScore + 20);
  }
  const effortScore = Math.min(
    100,
    30 +
      unresolvedCriticalCount * 10 +
      unresolvedAdaptiveCount * 5 +
      (signals.some((s) => s.includes("high")) ? 15 : 0)
  );
  const orderingScore = Math.min(
    100,
    40 + unresolvedCriticalCount * 8 + (planningType === "task-ordering" ? 15 : 0) + (planningType === "sprint-phase" ? 10 : 0)
  );
  const classify = (score: number): "low" | "medium" | "high" => {
    if (score >= 70) return "high";
    if (score >= 40) return "medium";
    return "low";
  };
  return {
    schemaVersion: 1,
    effort: { score: effortScore, level: classify(effortScore) },
    risk: { score: riskScore, level: classify(riskScore) },
    ordering: {
      score: orderingScore,
      level: classify(orderingScore),
      recommendedStrategy:
        riskScore >= 70 ? "risk-first" : orderingScore >= 60 ? "dependency-first" : "balanced"
    }
  };
}

export function toCliGuidance(args: {
  planningType: string;
  answers: Record<string, unknown>;
  unresolvedCriticalCount: number;
  totalCriticalCount: number;
  finalize?: boolean;
  outputMode?: PlanningOutputMode;
}): Record<string, unknown> {
  const { planningType, answers, unresolvedCriticalCount, totalCriticalCount, finalize, outputMode } = args;
  const answeredCritical = Math.max(0, totalCriticalCount - unresolvedCriticalCount);
  const completionPct = totalCriticalCount > 0 ? Math.round((answeredCritical / totalCriticalCount) * 100) : 100;
  return {
    answeredCritical,
    totalCritical: totalCriticalCount,
    completionPct,
    suggestedNextCommand: `workspace-kit run build-plan '${JSON.stringify({
      planningType,
      answers,
      finalize: finalize === true,
      outputMode: outputMode ?? "wishlist"
    })}'`
  };
}

export async function persistInterviewSnapshot(
  workspacePath: string,
  args: {
    planningType: string;
    outputMode: PlanningOutputMode;
    status: string;
    answers: Record<string, unknown>;
    cliGuidance: Record<string, unknown>;
  }
): Promise<void> {
  const cg = args.cliGuidance;
  const completionPct = typeof cg.completionPct === "number" ? cg.completionPct : 0;
  const answeredCritical = typeof cg.answeredCritical === "number" ? cg.answeredCritical : 0;
  const totalCritical = typeof cg.totalCritical === "number" ? cg.totalCritical : 0;
  const resumeCli = typeof cg.suggestedNextCommand === "string" ? cg.suggestedNextCommand : "";
  await persistBuildPlanSession(workspacePath, {
    planningType: args.planningType,
    outputMode: args.outputMode,
    status: args.status,
    completionPct,
    answeredCritical,
    totalCritical,
    answers: args.answers,
    resumeCli
  });
}
