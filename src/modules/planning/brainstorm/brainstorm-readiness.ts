/**
 * Measures how "complete" a brainstorm session's guided inputs are, using the same field lists
 * that `validateBrainstormSectionForPlanning` (the actual complete-brainstorm gate) enforces. This
 * gives the dashboard a readiness percentage that can never drift from the real transition rule.
 */

import { BRAINSTORM_SCORING_SUB_INPUT_FIELDS } from "./brainstorm-scoring.js";
import type { BrainstormSessionInputs, IdeaPlanBrainstormSection } from "../idea-plan/idea-plan-types.js";
import { REQUIRED_CONTEXT_FIELDS, validateBrainstormSectionForPlanning } from "./validate-brainstorm-section.js";

const TOTAL_REQUIRED_FIELD_COUNT = REQUIRED_CONTEXT_FIELDS.length + BRAINSTORM_SCORING_SUB_INPUT_FIELDS.length;

export type BrainstormReadiness = {
  /** 0-100: share of the latest session's required fields (context + scoring inputs) that are filled in. */
  completenessPercent: number;
  /** True when validateBrainstormSectionForPlanning would allow complete-brainstorm to run right now. */
  readyForPlanning: boolean;
};

function countFilledFields(inputs: Partial<BrainstormSessionInputs> | undefined): number {
  if (!inputs) {
    return 0;
  }
  let filled = 0;
  for (const field of REQUIRED_CONTEXT_FIELDS) {
    const value = inputs[field];
    if (typeof value === "string" && value.trim().length > 0) {
      filled += 1;
    }
  }
  for (const field of BRAINSTORM_SCORING_SUB_INPUT_FIELDS) {
    const value = inputs[field as keyof BrainstormSessionInputs];
    if (field === "tShirtSize") {
      if (typeof value === "string" && value.length > 0) {
        filled += 1;
      }
      continue;
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      filled += 1;
    }
  }
  return filled;
}

export function computeBrainstormReadiness(
  section: IdeaPlanBrainstormSection | undefined
): BrainstormReadiness {
  const sessions = section?.sessions ?? [];
  const latest = sessions[sessions.length - 1];
  const filled = countFilledFields(latest?.inputs);
  const completenessPercent =
    TOTAL_REQUIRED_FIELD_COUNT === 0 ? 0 : Math.round((filled / TOTAL_REQUIRED_FIELD_COUNT) * 100);
  return {
    completenessPercent,
    readyForPlanning: validateBrainstormSectionForPlanning(section).ok
  };
}
