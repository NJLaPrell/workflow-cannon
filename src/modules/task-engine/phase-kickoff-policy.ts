import type { ModuleLifecycleContext } from "../../contracts/module-contract.js";
import type { DashboardPhaseKickoffSummary } from "../../contracts/dashboard-summary-run.js";
import { buildPhaseKickoffReadiness } from "./phase-kickoff-readiness-runtime.js";
import type { OpenedPlanningStores } from "./persistence/planning-open.js";
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
  kickoffConfig: PhaseKickoffConfig,
  planning?: OpenedPlanningStores
): Promise<Record<string, unknown>> {
  const opened = planning ?? (await openPlanningStores(ctx));
  const auditMode = kickoffConfig.enforcementMode === "enforce" ? "enforce" : "advisory";
  return buildPhaseKickoffReadiness({
    ctx,
    planning: opened,
    store: opened.taskStore,
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

export async function buildDashboardPhaseKickoffSlice(
  ctx: ModuleLifecycleContext,
  planning: OpenedPlanningStores,
  phaseKey: string | null,
  options?: { includeValidationPlans?: boolean }
): Promise<DashboardPhaseKickoffSummary | null> {
  if (!phaseKey) {
    return null;
  }
  const kickoffConfig = readPhaseKickoffConfig(ctx.effectiveConfig as Record<string, unknown> | undefined);
  const auditMode = kickoffConfig.enforcementMode === "enforce" ? "enforce" : "advisory";
  const packet = await buildPhaseKickoffReadiness({
    ctx,
    planning,
    store: planning.taskStore,
    phaseKey,
    commandArgs: {
      phaseKey,
      mode: auditMode,
      staleTaskDays: kickoffConfig.staleTaskDays,
      checkScopePaths: kickoffConfig.checkScopePaths,
      includeValidationPlans: options?.includeValidationPlans !== false
    }
  });
  const findings = Array.isArray(packet.findings) ? packet.findings : [];
  return {
    schemaVersion: 1,
    phaseKey,
    passed: packet.passed === true,
    findingCount:
      typeof packet.findingCount === "number" && Number.isFinite(packet.findingCount)
        ? packet.findingCount
        : findings.length,
    enforcementMode: kickoffConfig.enforcementMode,
    findings: findings.slice(0, 5).map((raw) => {
      const f =
        raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
      return {
        code: typeof f.code === "string" ? f.code : "kickoff-finding",
        severity: typeof f.severity === "string" ? f.severity : "advisory",
        message: typeof f.message === "string" ? f.message : "",
        ...(typeof f.slice === "string" ? { slice: f.slice } : {}),
        ...(typeof f.taskId === "string" ? { taskId: f.taskId } : {}),
        ...(typeof f.path === "string" ? { path: f.path } : {})
      };
    })
  };
}
