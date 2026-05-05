/**
 * Composes kit/workspace posture for `dashboard-summary.systemStatus` (Editor status tab + tooling).
 */

import type { DoctorContractIssue } from "../../../cli/doctor-contract-validation.js";
import { collectDoctorContractIssues } from "../../../cli/doctor-contract-validation.js";
import { collectCaeDoctorSummaryLines } from "../../../cli/doctor-cae.js";
import type { ModuleLifecycleContext } from "../../../contracts/module-contract.js";
import type { DashboardSystemStatus } from "../../../contracts/dashboard-summary-run.js";
import type { ModuleActivationReport } from "../../../core/module-registry.js";
import type { SqliteDualPlanningStore } from "../persistence/sqlite-dual-planning.js";
import type { TaskStore } from "../persistence/store.js";
import { runPhaseStatus } from "../workspace-status-commands-runtime.js";

const DOCTOR_ISSUES_CAP = 32;

function moduleSlice(ctx: ModuleLifecycleContext): {
  enabledModuleIds: string[];
  disabledModuleIds: string[];
} {
  const reg = ctx.moduleRegistry as
    | {
        getStartupOrder(): ReadonlyArray<{ registration: { id: string } }>;
        getActivationReport?: () => ModuleActivationReport;
      }
    | undefined;
  const enabled = reg?.getStartupOrder?.().map((m) => m.registration.id) ?? [];
  let disabled: string[] = [];
  const report = reg?.getActivationReport?.();
  if (report?.modules?.length) {
    disabled = report.modules.filter((x) => !x.enabled).map((x) => x.moduleId);
  }
  disabled.sort();
  return { enabledModuleIds: enabled, disabledModuleIds: disabled };
}

export async function buildDashboardSystemStatus(
  ctx: ModuleLifecycleContext,
  store: TaskStore,
  sqliteDual: SqliteDualPlanningStore
): Promise<DashboardSystemStatus> {
  const generatedAt = new Date().toISOString();
  const mod = moduleSlice(ctx);

  const phaseRes = await runPhaseStatus(
    ctx,
    { includeDriftDetails: true },
    {
      tasks: store.getActiveTasks(),
      db: sqliteDual.getDatabase(),
      dbPath: sqliteDual.dbPath
    }
  );

  let phaseBlock: DashboardSystemStatus["phase"];
  if (phaseRes.ok === true && phaseRes.data && typeof phaseRes.data === "object") {
    const d = phaseRes.data as Record<string, unknown>;
    const canon = d.canonicalPhase as Record<string, unknown> | undefined;
    const exportStatus = d.exportStatus as Record<string, unknown> | undefined;
    const driftRaw = d.driftDetails;
    const driftMessages = Array.isArray(driftRaw)
      ? driftRaw.filter((x): x is string => typeof x === "string")
      : [];
    const remRaw = d.remediationSuggestions;
    const remediationSuggestions = Array.isArray(remRaw)
      ? remRaw.filter((x): x is string => typeof x === "string")
      : [];
    phaseBlock = {
      schemaVersion: 1,
      ok: true,
      code: typeof phaseRes.code === "string" ? phaseRes.code : undefined,
      message: typeof phaseRes.message === "string" ? phaseRes.message : undefined,
      canonicalPhaseKey:
        canon && typeof canon.canonicalPhaseKey === "string" ? canon.canonicalPhaseKey : null,
      source: canon && typeof canon.source === "string" ? canon.source : null,
      currentKitPhase: typeof d.currentKitPhase === "string" ? d.currentKitPhase : null,
      nextKitPhase: typeof d.nextKitPhase === "string" ? d.nextKitPhase : null,
      configPhaseKey:
        canon && typeof canon.configPhaseKey === "string" ? canon.configPhaseKey : null,
      workspaceStatusPhaseKey:
        canon && typeof canon.workspaceStatusPhaseKey === "string"
          ? canon.workspaceStatusPhaseKey
          : null,
      configMatchesWorkspaceStatus:
        typeof canon?.configMatchesWorkspaceStatus === "boolean"
          ? canon.configMatchesWorkspaceStatus
          : null,
      exportStale: exportStatus?.stale === true ? true : exportStatus?.stale === false ? false : null,
      exportReason:
        exportStatus && typeof exportStatus.reason === "string" ? exportStatus.reason : null,
      driftMessages,
      remediationSuggestions
    };
  } else {
    phaseBlock = {
      schemaVersion: 1,
      ok: false,
      code: typeof phaseRes.code === "string" ? phaseRes.code : "phase-status-failed",
      message: typeof phaseRes.message === "string" ? phaseRes.message : "phase-status failed",
      canonicalPhaseKey: null,
      source: null,
      currentKitPhase: null,
      nextKitPhase: null,
      configPhaseKey: null,
      workspaceStatusPhaseKey: null,
      configMatchesWorkspaceStatus: null,
      exportStale: null,
      exportReason: null,
      driftMessages: [],
      remediationSuggestions: []
    };
  }

  let doctorIssues: DoctorContractIssue[] = [];
  try {
    doctorIssues = await collectDoctorContractIssues(ctx.workspacePath);
  } catch {
    doctorIssues = [{ path: "(doctor)", reason: "collectDoctorContractIssues threw" }];
  }
  const capped = doctorIssues.slice(0, DOCTOR_ISSUES_CAP);

  let caeLines: string[] = [];
  try {
    caeLines = await collectCaeDoctorSummaryLines(ctx.workspacePath);
  } catch {
    caeLines = ["CAE: summary unavailable (collectCaeDoctorSummaryLines threw)"];
  }

  return {
    schemaVersion: 1,
    generatedAt,
    phase: phaseBlock,
    doctor: {
      schemaVersion: 1,
      ok: doctorIssues.length === 0,
      issueCount: doctorIssues.length,
      issues: capped.map((i) => ({ path: i.path, reason: i.reason }))
    },
    modules: {
      schemaVersion: 1,
      enabledModuleIds: mod.enabledModuleIds,
      disabledModuleIds: mod.disabledModuleIds
    },
    caeLines
  };
}
