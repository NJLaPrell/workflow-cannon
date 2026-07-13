import type { AgentDirective } from "./idea-plan-types.js";
import type { IdeaPlanStateSchemaLoadResult } from "./idea-plan-state-schema-loader.js";
import { isDegradedAgentDirective } from "./idea-plan-types.js";

export type IdeaPlanStateSchemaGuardFailure = {
  ok: false;
  code: "idea-plan-state-schema-degraded";
  message: string;
  data: {
    status: string;
    schemaPath: string;
    degradedReason: string;
  };
};

export function guardIdeaPlanStateSchemaLoad(
  loaded: IdeaPlanStateSchemaLoadResult
): { ok: true; agentDirective: AgentDirective } | IdeaPlanStateSchemaGuardFailure {
  if (loaded.degraded || isDegradedAgentDirective(loaded.agentDirective)) {
    const reason =
      loaded.degradedReason ??
      (isDegradedAgentDirective(loaded.agentDirective) ? loaded.agentDirective.reason : "unknown schema load failure");
    return {
      ok: false,
      code: "idea-plan-state-schema-degraded",
      message: `IdeaPlan state schema is degraded for ${loaded.status}: ${reason}`,
      data: {
        status: loaded.status,
        schemaPath: loaded.schemaPath,
        degradedReason: reason
      }
    };
  }
  return { ok: true, agentDirective: loaded.agentDirective };
}

export function requireIdeaPlanAgentDirective(loaded: IdeaPlanStateSchemaLoadResult): AgentDirective {
  const guard = guardIdeaPlanStateSchemaLoad(loaded);
  if (!guard.ok) {
    throw new Error(guard.message);
  }
  return guard.agentDirective;
}
