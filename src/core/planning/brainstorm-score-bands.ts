/**
 * Brainstorm score color semantics for plan-document markdown (WBS-7A).
 * Bands on 0–100 scale: 0–33 red, 34–66 amber, 67–100 green.
 */

export type BrainstormScoreKind = "value" | "confidence" | "priority" | "risk" | "effort";

export type BrainstormScoreBand = "red" | "amber" | "green";

export const BRAINSTORM_SCORE_BAND_RED_MAX = 33;
export const BRAINSTORM_SCORE_BAND_AMBER_MAX = 66;

const HIGH_IS_GOOD: readonly BrainstormScoreKind[] = ["value", "confidence", "priority"];
const LOW_IS_GOOD: readonly BrainstormScoreKind[] = ["risk", "effort"];

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

export function normalizeScore1to10ForBands(score1to10: number): number {
  const clamped = Math.max(1, Math.min(10, score1to10));
  return Math.round(((clamped - 1) / 9) * 100);
}

export function scoreBandForKind(score: number, kind: BrainstormScoreKind): BrainstormScoreBand {
  const normalized =
    kind === "priority" ? Math.max(0, Math.min(100, Math.round(score))) : normalizeScore1to10ForBands(score);
  const baseBand = scoreBandForNormalizedScore(normalized);
  if (HIGH_IS_GOOD.includes(kind)) {
    return baseBand;
  }
  if (LOW_IS_GOOD.includes(kind)) {
    if (baseBand === "red") {
      return "green";
    }
    if (baseBand === "green") {
      return "red";
    }
    return "amber";
  }
  return baseBand;
}

export function formatScoreWithBand(score: number, kind: BrainstormScoreKind): string {
  return `${score} (**${scoreBandForKind(score, kind)}**)`;
}

/** Inclusive lower bound for the green band on a 0–100 scale. */
export const BRAINSTORM_SCORE_BAND_GREEN_MIN = 67;

export const BRAINSTORM_SCORE_BAND_CSS_CLASS: Record<BrainstormScoreBand, string> = {
  red: "wc-brainstorm-score-red",
  amber: "wc-brainstorm-score-amber",
  green: "wc-brainstorm-score-green"
};

/** Rollup sort field for brainstorming ideas queue (highest priority first). */
export const BRAINSTORM_ROLLUP_SORT_FIELD = "priorityScore" as const;

/** Rollup sort direction for brainstorming ideas queue. */
export const BRAINSTORM_ROLLUP_SORT_DIRECTION = "desc" as const;

export function brainstormScoreBandCssClass(score: number, kind: BrainstormScoreKind): string {
  return BRAINSTORM_SCORE_BAND_CSS_CLASS[scoreBandForKind(score, kind)];
}
