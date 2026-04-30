import {
  getPlanningGenerationPolicy,
  mergePlanningGenerationPolicyWarnings
} from "./planning-config.js";

/** Standard `data.planningGeneration` + policy fields on task-engine run responses. */
export function attachPolicyMeta(
  data: Record<string, unknown>,
  ctx: { effectiveConfig?: Record<string, unknown> },
  planningGen: number,
  warnings?: string[]
): void {
  data.planningGeneration = planningGen;
  data.planningGenerationPolicy = getPlanningGenerationPolicy({
    effectiveConfig: ctx.effectiveConfig as Record<string, unknown> | undefined
  });
  mergePlanningGenerationPolicyWarnings(data, warnings);
}
