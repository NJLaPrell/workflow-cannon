import type { ModuleLifecycleContext } from "../../contracts/module-contract.js";
import { buildPhaseKickoffReadiness } from "./phase-kickoff-readiness-runtime.js";
import { openPlanningStores } from "./persistence/planning-open.js";

export type PhaseKickoffEnforcementMode = "off" | "advisory" | "enforce";

export type PhaseKickoffConfig = {
  enforcementMode: PhaseKickoffEnforcementMode;
  staleTaskDays: number;
  checkScopePaths: boolean;
};

const DEFAULT_STALE_TASK_DAYS = 14;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function readEnforcementMode(raw: unknown): PhaseKickoffEnforcementMode {
  return raw === "advisory" || raw === "enforce" ? raw : "off";
}

export function readPhaseKickoffConfig(
  effectiveConfig: Record<string, unknown> | undefined
): PhaseKickoffConfig {
  const tasks = effectiveConfig?.tasks;
  const tasksObj = isRecord(tasks) ? tasks : undefined;
  const phaseKickoff = tasksObj?.phaseKickoff;
  const pk = isRecord(phaseKickoff) ? phaseKickoff : undefined;
  const staleRaw = pk?.staleTaskDays;
  const staleTaskDays =
    typeof staleRaw === "number" && Number.isFinite(staleRaw) && staleRaw > 0
      ? Math.floor(staleRaw)
      : DEFAULT_STALE_TASK_DAYS;
  return {
    enforcementMode: readEnforcementMode(pk?.enforcementMode),
    staleTaskDays,
    checkScopePaths: pk?.checkScopePaths !== false
  };
}

export function kickoffSummaryFromReadiness(readiness: Record<string, unknown>): Record<string, unknown> {
  const findings = Array.isArray(readiness.findings) ? readiness.findings : [];
  return {
    passed: readiness.passed === true,
    findingCount:
      typeof readiness.findingCount === "number" && Number.isFinite(readiness.findingCount)
        ? readiness.findingCount
        : findings.length,
    topFindings: findings.slice(0, 5)
  };
}

export async function buildKickoffReadinessForSetCurrentPhase(
  ctx: ModuleLifecycleContext,
  phaseKey: string,
  kickoffConfig: PhaseKickoffConfig
): Promise<Record<string, unknown>> {
  const planning = await openPlanningStores(ctx);
  const auditMode = kickoffConfig.enforcementMode === "enforce" ? "enforce" : "advisory";
  return buildPhaseKickoffReadiness({
    ctx,
    planning,
    store: planning.taskStore,
    phaseKey,
    commandArgs: {
      phaseKey,
      mode: auditMode,
      staleTaskDays: kickoffConfig.staleTaskDays,
      checkScopePaths: kickoffConfig.checkScopePaths,
      includeValidationPlans: true
    }
  });
}
