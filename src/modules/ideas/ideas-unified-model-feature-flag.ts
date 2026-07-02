/**
 * IDEAS_UNIFIED_MODEL_ENABLED — gates unified IdeaPlan dashboard UI and six-state commands.
 * Default off until WBS-2A through WBS-3C are deployed and WBS-6 migration has run.
 */

export const IDEAS_UNIFIED_MODEL_ENV_VAR = "IDEAS_UNIFIED_MODEL_ENABLED";

function parseTruthyEnv(value: string | undefined): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on") {
    return true;
  }
  if (normalized === "0" || normalized === "false" || normalized === "no" || normalized === "off" || normalized === "") {
    return false;
  }
  return undefined;
}

export type IdeasUnifiedModelFlagSource = "override" | "env" | "default";

export type IdeasUnifiedModelFlagResolution = {
  enabled: boolean;
  source: IdeasUnifiedModelFlagSource;
};

/**
 * Resolve whether the unified IdeaPlan model is enabled.
 * Precedence: explicit override → `IDEAS_UNIFIED_MODEL_ENABLED` env → default false.
 */
export function resolveIdeasUnifiedModelEnabled(override?: boolean): IdeasUnifiedModelFlagResolution {
  if (override !== undefined) {
    return { enabled: override, source: "override" };
  }
  const fromEnv = parseTruthyEnv(process.env[IDEAS_UNIFIED_MODEL_ENV_VAR]);
  if (fromEnv !== undefined) {
    return { enabled: fromEnv, source: "env" };
  }
  return { enabled: false, source: "default" };
}

export function isIdeasUnifiedModelEnabled(override?: boolean): boolean {
  return resolveIdeasUnifiedModelEnabled(override).enabled;
}
