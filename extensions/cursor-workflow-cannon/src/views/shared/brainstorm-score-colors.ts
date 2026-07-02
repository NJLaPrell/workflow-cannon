/**
 * Brainstorm score color semantics and rollup sort order for dashboard renderers (WBS-4C).
 *
 * Polarity:
 * - value, confidence, priority: higher is better (green-high / red-low)
 * - risk, effort: lower is better (green-low / red-high)
 *
 * Bands (0–100 scale): 0–33 red, 34–66 amber, 67–100 green
 */

export type BrainstormScoreKind = "value" | "confidence" | "priority" | "risk" | "effort";

export type BrainstormScorePolarity = "high-is-good" | "low-is-good";

/** Score kinds where a higher normalized value maps to greener bands. */
export const BRAINSTORM_SCORE_HIGH_IS_GOOD: readonly BrainstormScoreKind[] = [
  "value",
  "confidence",
  "priority"
] as const;

/** Score kinds where a lower normalized value maps to greener bands. */
export const BRAINSTORM_SCORE_LOW_IS_GOOD: readonly BrainstormScoreKind[] = ["risk", "effort"] as const;

export const BRAINSTORM_SCORE_POLARITY: Record<BrainstormScoreKind, BrainstormScorePolarity> = {
  value: "high-is-good",
  confidence: "high-is-good",
  priority: "high-is-good",
  risk: "low-is-good",
  effort: "low-is-good"
};

/** Inclusive upper bound for the red band on a 0–100 scale. */
export const BRAINSTORM_SCORE_BAND_RED_MAX = 33;

/** Inclusive upper bound for the amber band on a 0–100 scale. */
export const BRAINSTORM_SCORE_BAND_AMBER_MAX = 66;

/** Inclusive lower bound for the green band on a 0–100 scale. */
export const BRAINSTORM_SCORE_BAND_GREEN_MIN = 67;

export type BrainstormScoreBand = "red" | "amber" | "green";

export const BRAINSTORM_SCORE_BAND_CSS_CLASS: Record<BrainstormScoreBand, string> = {
  red: "wc-brainstorm-score-red",
  amber: "wc-brainstorm-score-amber",
  green: "wc-brainstorm-score-green"
};

/** Rollup sort field for brainstorming ideas queue (highest priority first). */
export const BRAINSTORM_ROLLUP_SORT_FIELD = "priorityScore" as const;

/** Rollup sort direction for brainstorming ideas queue. */
export const BRAINSTORM_ROLLUP_SORT_DIRECTION = "desc" as const;

export function isBrainstormScoreKind(value: string): value is BrainstormScoreKind {
  return value === "value" || value === "confidence" || value === "priority" || value === "risk" || value === "effort";
}

/** Map a 0–100 score to red / amber / green bands (higher on the scale = greener band). */
export function scoreBandForNormalizedScore(score0to100: number): BrainstormScoreBand {
  const clamped = Math.max(0, Math.min(100, Math.round(score0to100)));
  if (clamped <= BRAINSTORM_SCORE_BAND_RED_MAX) {
    return "red";
  }
  if (clamped <= BRAINSTORM_SCORE_BAND_AMBER_MAX) {
    return "amber";
  }
  return "green";
}

/** Convert a 1–10 aggregate score to 0–100 for band lookup. */
export function normalizeScore1to10ForBands(score1to10: number): number {
  const clamped = Math.max(1, Math.min(10, score1to10));
  return Math.round(((clamped - 1) / 9) * 100);
}

/**
 * Resolve the display band for a brainstorm score, accounting for per-kind polarity.
 * Priority uses 0–100 input; other kinds use 1–10 input.
 */
export function scoreBandForKind(score: number, kind: BrainstormScoreKind): BrainstormScoreBand {
  const normalized =
    kind === "priority" ? Math.max(0, Math.min(100, Math.round(score))) : normalizeScore1to10ForBands(score);
  const baseBand = scoreBandForNormalizedScore(normalized);
  if (BRAINSTORM_SCORE_POLARITY[kind] === "high-is-good") {
    return baseBand;
  }
  if (baseBand === "red") {
    return "green";
  }
  if (baseBand === "green") {
    return "red";
  }
  return "amber";
}

export function brainstormScoreBandCssClass(score: number, kind: BrainstormScoreKind): string {
  return BRAINSTORM_SCORE_BAND_CSS_CLASS[scoreBandForKind(score, kind)];
}
