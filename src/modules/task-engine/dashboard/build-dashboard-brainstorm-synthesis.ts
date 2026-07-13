import type { DashboardBrainstormSynthesisSummary } from "../../../contracts/dashboard-summary-run.js";
import { computeBrainstormReadiness, type IdeaPlanBrainstormSection } from "./planning-barrel-imports.js";

/** Map `brainstorm.synthesis` + session count into dashboard-summary score fields. */
export function mapBrainstormSynthesisForDashboard(
  brainstorm: IdeaPlanBrainstormSection | undefined
): DashboardBrainstormSynthesisSummary | undefined {
  if (!brainstorm) {
    return undefined;
  }
  const sessionCount = brainstorm.sessions?.length ?? 0;
  const synthesis = brainstorm.synthesis;
  if (!synthesis && sessionCount === 0) {
    return undefined;
  }
  const readiness = computeBrainstormReadiness(brainstorm);
  return {
    ...(synthesis?.value !== undefined ? { valueScore: synthesis.value } : {}),
    ...(synthesis?.risk !== undefined ? { riskScore: synthesis.risk } : {}),
    ...(synthesis?.effort !== undefined ? { effortScore: synthesis.effort } : {}),
    ...(synthesis?.confidence !== undefined ? { confidenceScore: synthesis.confidence } : {}),
    ...(synthesis?.priority !== undefined ? { priorityScore: synthesis.priority } : {}),
    sessionCount,
    readinessPercent: readiness.completenessPercent,
    readyForPlanning: readiness.readyForPlanning
  };
}
