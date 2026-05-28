/** Last seen planning concurrency metadata from kit reads (list-tasks / dashboard-summary). */
let lastGeneration: number | undefined;
let lastPolicy: "off" | "warn" | "require" = "off";

export function ingestPlanningMetaFromData(data: Record<string, unknown> | undefined): void {
  if (!data) {
    return;
  }
  const g = data.planningGeneration;
  if (typeof g === "number" && Number.isInteger(g) && g >= 0) {
    lastGeneration = g;
  }
  const pol = data.planningGenerationPolicy;
  if (pol === "off" || pol === "warn" || pol === "require") {
    lastPolicy = pol;
  }
}

/**
 * Refresh the cached planning_generation from a `planning-generation-mismatch` error payload.
 * Returns true when the cache was updated (and a single retry is therefore worth attempting).
 */
export function ingestPlanningGenerationFromMismatch(data: unknown): boolean {
  if (!data || typeof data !== "object") {
    return false;
  }
  const current = (data as Record<string, unknown>).currentPlanningGeneration;
  if (typeof current === "number" && Number.isInteger(current) && current >= 0) {
    lastGeneration = current;
    return true;
  }
  return false;
}

/** Args to merge onto mutating `workspace-kit run` JSON when policy is require. */
export function expectedPlanningGenerationArgs(): { expectedPlanningGeneration: number } | Record<string, never> {
  if (lastPolicy !== "require" || lastGeneration === undefined) {
    return {};
  }
  return { expectedPlanningGeneration: lastGeneration };
}
