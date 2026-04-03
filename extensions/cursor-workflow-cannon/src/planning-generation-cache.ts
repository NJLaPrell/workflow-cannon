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

/** Args to merge onto mutating `workspace-kit run` JSON when policy is require. */
export function expectedPlanningGenerationArgs(): { expectedPlanningGeneration: number } | Record<string, never> {
  if (lastPolicy !== "require" || lastGeneration === undefined) {
    return {};
  }
  return { expectedPlanningGeneration: lastGeneration };
}
