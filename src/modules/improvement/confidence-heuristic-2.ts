/**
 * Heuristic v2 — alternate admission curve (mean-of-signals × bump) for improvement ingest.
 * Default remains heuristic_1 (max-of-signals) via config `improvement.recommendations.heuristicVersion`.
 */

import type { EvidenceKind, ConfidenceSignals, ConfidenceResult } from "./confidence.js";
import { computeHeuristicConfidence, shouldAdmitRecommendation } from "./confidence.js";

export const HEURISTIC_2_ADMISSION_THRESHOLD = 0.38;

function meanDefinedSignals(signals: ConfidenceSignals): number | undefined {
  const vals: number[] = [];
  if (signals.transcriptFriction !== undefined) vals.push(signals.transcriptFriction);
  if (signals.diffImpact !== undefined) vals.push(signals.diffImpact);
  if (signals.policyDenial !== undefined) vals.push(signals.policyDenial);
  if (signals.mutationRejection !== undefined) vals.push(signals.mutationRejection);
  if (signals.taskFriction !== undefined) vals.push(signals.taskFriction);
  if (vals.length === 0) return undefined;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

/** Mean-based score with a small bump; tier bands match v1 for metadata stability. */
export function computeHeuristic2Confidence(
  kind: EvidenceKind,
  signals: ConfidenceSignals
): ConfidenceResult {
  const m = meanDefinedSignals(signals);
  if (m === undefined) {
    return { score: 0, tier: "low", reasons: [`no-signals:${kind}`] };
  }
  const score = Math.min(1, m * 1.15);
  const reasons = [`heuristic2-mean=${m.toFixed(3)}`, `bumped=${score.toFixed(3)}`];
  let tier: ConfidenceResult["tier"] = "low";
  if (score >= 0.72) tier = "high";
  else if (score >= 0.5) tier = "medium";
  return { score, tier, reasons };
}

/** Resolve confidence + admission for persistence metadata when heuristic v2 is active. */
export function resolveConfidenceForHeuristicVersion(
  version: 1 | 2,
  kind: EvidenceKind,
  signals: ConfidenceSignals
): ConfidenceResult {
  if (version === 2) return computeHeuristic2Confidence(kind, signals);
  return computeHeuristicConfidence(kind, signals);
}

/** Admission check after computing `confidence` with `resolveConfidenceForHeuristicVersion`. */
export function shouldAdmitForHeuristicVersion(version: 1 | 2, confidence: ConfidenceResult): boolean {
  if (version === 1) return shouldAdmitRecommendation(confidence);
  return confidence.score >= HEURISTIC_2_ADMISSION_THRESHOLD;
}
