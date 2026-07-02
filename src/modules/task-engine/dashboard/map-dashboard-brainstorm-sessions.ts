import type { DashboardBrainstormSessionSummary } from "../../../contracts/dashboard-summary-run.js";
import type { BrainstormSession } from "../../ideas/idea-plan-types.js";

function mapSessionScores(
  scores: BrainstormSession["scores"] | undefined
): Partial<
  Pick<
    DashboardBrainstormSessionSummary,
    "valueScore" | "riskScore" | "effortScore" | "confidenceScore" | "priorityScore"
  >
> {
  if (!scores) {
    return {};
  }
  return {
    ...(scores.value !== undefined ? { valueScore: scores.value } : {}),
    ...(scores.risk !== undefined ? { riskScore: scores.risk } : {}),
    ...(scores.effort !== undefined ? { effortScore: scores.effort } : {}),
    ...(scores.confidence !== undefined ? { confidenceScore: scores.confidence } : {}),
    ...(scores.priority !== undefined ? { priorityScore: scores.priority } : {})
  };
}

/** Map persisted brainstorm session rows for dashboard detail panels. */
export function mapBrainstormSessionsForDashboard(
  sessions: readonly BrainstormSession[] | undefined
): DashboardBrainstormSessionSummary[] {
  if (!sessions || sessions.length === 0) {
    return [];
  }
  return sessions.map((session, sessionIndex) => ({
    sessionId: session.sessionId,
    sessionIndex,
    ...(session.startedAt ? { startedAt: session.startedAt } : {}),
    ...(session.completedAt ? { completedAt: session.completedAt } : {}),
    ...mapSessionScores(session.scores)
  }));
}
