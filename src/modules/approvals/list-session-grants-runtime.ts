import type { ModuleLifecycleContext } from "../../contracts/module-contract.js";
import { listSessionGrantRows } from "../../core/state/kit-session-grants-sqlite.js";
import { resolveSessionId } from "../../core/session-policy.js";
import { getPlanningGenerationPolicy } from "../task-engine/planning-config.js";
import { openPlanningStores } from "../../core/planning/index.js";

export async function runListSessionGrants(ctx: ModuleLifecycleContext): Promise<{
  ok: true;
  code: string;
  message: string;
  data: Record<string, unknown>;
}> {
  const sessionId = resolveSessionId(process.env);
  const effectiveConfig = ctx.effectiveConfig as Record<string, unknown> | undefined;
  const grants = listSessionGrantRows(ctx.workspacePath, effectiveConfig, sessionId);
  const planning = await openPlanningStores(ctx);
  return {
    ok: true,
    code: "session-grants-listed",
    message: `Listed ${grants.length} session grant(s) for session '${sessionId}'`,
    data: {
      schemaVersion: 1,
      sessionId,
      grants,
      planningGeneration: planning.sqliteDual.getPlanningGeneration(),
      planningGenerationPolicy: getPlanningGenerationPolicy({ effectiveConfig })
    }
  };
}
