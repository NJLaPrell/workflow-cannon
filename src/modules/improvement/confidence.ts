/**
 * T202: Deterministic heuristic confidence (heuristic_1) — no ML.
 * Callable from ingestion without coupling to file parsers.
 */

export type EvidenceKind =
  | "transcript"
  | "git_diff"
  | "policy_deny"
  | "config_mutation"
  | "task_transition";

/** Normalized numeric signals in [0,1]; undefined means not applicable. */
export type ConfidenceSignals = {
  transcriptFriction?: number;
  diffImpact?: number;
  policyDenial?: number;
  mutationRejection?: number;
  taskFriction?: number;
};

export type ConfidenceResult = {
  score: number;
  tier: "high" | "medium" | "low";
  reasons: string[];
};

/** Admission threshold on score; inclusive. */
export const HEURISTIC_1_ADMISSION_THRESHOLD = 0.35;

export function computeHeuristicConfidence(
  kind: EvidenceKind,
  signals: ConfidenceSignals
): ConfidenceResult {
  const reasons: string[] = [];
  const candidates: number[] = [];

  if (signals.transcriptFriction !== undefined) {
    candidates.push(signals.transcriptFriction);
    reasons.push(`transcriptFriction=${signals.transcriptFriction.toFixed(3)}`);
  }
  if (signals.diffImpact !== undefined) {
    candidates.push(signals.diffImpact);
    reasons.push(`diffImpact=${signals.diffImpact.toFixed(3)}`);
  }
  if (signals.policyDenial !== undefined) {
    candidates.push(signals.policyDenial);
    reasons.push(`policyDenial=${signals.policyDenial.toFixed(3)}`);
  }
  if (signals.mutationRejection !== undefined) {
    candidates.push(signals.mutationRejection);
    reasons.push(`mutationRejection=${signals.mutationRejection.toFixed(3)}`);
  }
  if (signals.taskFriction !== undefined) {
    candidates.push(signals.taskFriction);
    reasons.push(`taskFriction=${signals.taskFriction.toFixed(3)}`);
  }

  if (candidates.length === 0) {
    return { score: 0, tier: "low", reasons: [`no-signals:${kind}`] };
  }

  const score = Math.max(...candidates);
  let tier: ConfidenceResult["tier"] = "low";
  if (score >= 0.72) tier = "high";
  else if (score >= 0.5) tier = "medium";

  return { score, tier, reasons };
}

export function shouldAdmitRecommendation(result: ConfidenceResult): boolean {
  return result.score >= HEURISTIC_1_ADMISSION_THRESHOLD;
}

export function priorityForTier(tier: ConfidenceResult["tier"]): "P1" | "P2" | "P3" {
  if (tier === "high") return "P1";
  if (tier === "medium") return "P2";
  return "P3";
}
