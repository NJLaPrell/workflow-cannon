import type { ModuleLifecycleContext } from "../../contracts/module-contract.js";
import { runGeneratePlanDocument } from "./generate-plan-document-handler.js";

/**
 * Best-effort plan document regeneration after lifecycle mutations (T100794).
 * Failures are logged but never propagate to the primary command.
 */
export async function bestEffortGeneratePlanDocument(
  ctx: ModuleLifecycleContext,
  planId: string
): Promise<string | undefined> {
  if (!planId.trim()) {
    return undefined;
  }
  try {
    const result = await runGeneratePlanDocument({ planId: planId.trim() }, ctx);
    if (!result.ok) {
      if (process.env.WORKSPACE_KIT_DEBUG_PLAN_DOC_HOOK === "1") {
        console.error(
          `[plan-doc-hook] generate-plan-document failed for ${planId}: ${result.code} ${result.message}`
        );
      }
      return undefined;
    }
    const outputPath = (result.data as Record<string, unknown> | undefined)?.outputPath;
    return typeof outputPath === "string" && outputPath.length > 0 ? outputPath : undefined;
  } catch (err) {
    if (process.env.WORKSPACE_KIT_DEBUG_PLAN_DOC_HOOK === "1") {
      console.error(`[plan-doc-hook] generate-plan-document threw for ${planId}:`, err);
    }
    return undefined;
  }
}

export function attachGeneratedPlanDocPath(
  data: Record<string, unknown> | undefined,
  generatedPlanDocPath: string | undefined
): void {
  if (!data || !generatedPlanDocPath) {
    return;
  }
  data.generatedPlanDocPath = generatedPlanDocPath;
}
