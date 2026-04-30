import type { ModuleCommandResult } from "../../contracts/module-contract.js";
import { CLI_REMEDIATION_DOCS } from "../../core/cli-remediation.js";
import { enforcePlanningGenerationPolicy, getPlanningGenerationPolicy } from "./planning-config.js";

/** Shared optimistic-concurrency gate for `wk run` mutations that touch planning generation. */
export function planningGenPolicyGate(
  ctx: { effectiveConfig?: Record<string, unknown> },
  args: Record<string, unknown>,
  instructionPath: string,
  planningGenSnapshot?: number
): { block: ModuleCommandResult | null; warnings?: string[] } {
  const policy = getPlanningGenerationPolicy({
    effectiveConfig: ctx.effectiveConfig as Record<string, unknown> | undefined
  });
  const gate = enforcePlanningGenerationPolicy(policy, args);
  if (!gate.ok) {
    const block: ModuleCommandResult = {
      ok: false,
      code: gate.code,
      message: gate.message,
      remediation: {
        instructionPath,
        docPath: CLI_REMEDIATION_DOCS.planningGenerationAdr
      }
    };
    if (planningGenSnapshot !== undefined && gate.code === "planning-generation-required") {
      block.data = {
        currentPlanningGeneration: planningGenSnapshot,
        retryAfterRead: true,
        readCommandSuggestion: {
          command: "list-tasks",
          args: {}
        }
      };
    }
    return { block };
  }
  return { block: null, warnings: gate.warnings };
}
