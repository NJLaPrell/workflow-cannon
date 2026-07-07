import { BRAINSTORM_SCORING_SUB_INPUT_FIELDS, hasCompleteBrainstormScoringInputs } from "./brainstorm-scoring.js";
import type { BrainstormSession, IdeaPlanBrainstormSection } from "./idea-plan-types.js";

export const REQUIRED_CONTEXT_FIELDS = ["contextProblem", "contextAudience"] as const;

export type BrainstormSectionValidationResult =
  | { ok: true }
  | { ok: false; code: string; message: string; field?: string; sessionIndex?: number };

function sessionHasRequiredInputs(session: BrainstormSession, sessionIndex: number): BrainstormSectionValidationResult {
  if (!session.inputs) {
    return {
      ok: false,
      code: "brainstorm-session-incomplete",
      message: `Session ${sessionIndex} is missing inputs`,
      sessionIndex
    };
  }
  for (const field of REQUIRED_CONTEXT_FIELDS) {
    const value = session.inputs[field];
    if (typeof value !== "string" || !value.trim()) {
      return {
        ok: false,
        code: "brainstorm-session-incomplete",
        message: `Session ${sessionIndex} is missing required field ${field}`,
        field,
        sessionIndex
      };
    }
  }
  if (!hasCompleteBrainstormScoringInputs(session.inputs)) {
    const missing = BRAINSTORM_SCORING_SUB_INPUT_FIELDS.find((field) => {
      const value = session.inputs?.[field as keyof typeof session.inputs];
      if (field === "tShirtSize") {
        return typeof value !== "string";
      }
      return typeof value !== "number" || !Number.isFinite(value);
    });
    return {
      ok: false,
      code: "brainstorm-session-incomplete",
      message: `Session ${sessionIndex} is missing required scoring input ${missing ?? "unknown"}`,
      field: missing,
      sessionIndex
    };
  }
  if (!session.scores) {
    return {
      ok: false,
      code: "brainstorm-session-incomplete",
      message: `Session ${sessionIndex} is missing computed scores`,
      sessionIndex
    };
  }
  return { ok: true };
}

export function validateBrainstormSectionForPlanning(
  section: IdeaPlanBrainstormSection | undefined
): BrainstormSectionValidationResult {
  const sessions = section?.sessions ?? [];
  if (sessions.length === 0) {
    return {
      ok: false,
      code: "brainstorm-section-empty",
      message: "Brainstorm section must contain at least one session before transitioning to planning"
    };
  }
  for (let index = 0; index < sessions.length; index += 1) {
    const result = sessionHasRequiredInputs(sessions[index]!, index);
    if (!result.ok) {
      return result;
    }
  }
  return { ok: true };
}
