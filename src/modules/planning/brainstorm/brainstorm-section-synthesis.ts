import { synthesizeBrainstormScores } from "./brainstorm-scoring.js";
import type { IdeaPlanBrainstormSection } from "../idea-plan/idea-plan-types.js";

/** Recompute `brainstorm.synthesis` from scored sessions (60/40 recency when N≥2). */
export function applyBrainstormSectionSynthesis(section: IdeaPlanBrainstormSection): IdeaPlanBrainstormSection {
  const synthesis = synthesizeBrainstormScores(section.sessions);
  if (!synthesis) {
    const { synthesis: _removed, ...rest } = section;
    return rest;
  }
  return {
    ...section,
    synthesis
  };
}
