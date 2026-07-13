/** Plan artifact ref prefix shared by IdeaPlan kernel storage (matches task-engine policy). */
export const PLAN_ARTIFACT_REF_PREFIX = "plan-artifact:" as const;

export function parsePlanIdFromPlanArtifactRef(planRef: string): string | null {
  if (!planRef.startsWith(PLAN_ARTIFACT_REF_PREFIX)) {
    return null;
  }
  const planId = planRef.slice(PLAN_ARTIFACT_REF_PREFIX.length).trim();
  return planId.length > 0 ? planId : null;
}
