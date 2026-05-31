import type { ModuleLifecycleContext } from "../../contracts/module-contract.js";
import {
  resolveDashboardDataSource,
  type DashboardDataSourceMode
} from "../../services/dashboard-service/resolve-data-source-config.js";
import { runDashboardServiceStatus } from "../../services/dashboard-service/lifecycle-runtime.js";
import { isGitTaskStateCanonicalAuthority } from "./persistence/task-state-canonical-authority.js";
import { runTaskStateStatus } from "./persistence/task-state-status-runtime.js";

export type PhaseServiceSyncFindingCode =
  | "service-sync-service-not-running"
  | "service-sync-service-unhealthy"
  | "service-sync-outbox-not-drained"
  | "service-sync-projection-not-fresh"
  | "service-sync-conflict-rows";

export type PhaseServiceSyncFinding = {
  code: PhaseServiceSyncFindingCode;
  severity: "blocking" | "warning";
  message: string;
  remediation: string;
  details?: Record<string, unknown>;
};

export type PhaseServiceSyncPreflight = {
  schemaVersion: 1;
  active: boolean;
  dataSourceMode: DashboardDataSourceMode | null;
  passed: boolean;
  findingCount: number;
  blockingFindingCount: number;
  findings: PhaseServiceSyncFinding[];
  serviceStatus: Record<string, unknown> | null;
  taskStateStatus: Record<string, unknown> | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Service sync closeout gates apply when git-event-log authority and dashboard reads use service/auto. */
export function isPhaseServiceSyncPreflightActive(ctx: ModuleLifecycleContext): boolean {
  if (!isGitTaskStateCanonicalAuthority(ctx)) {
    return false;
  }
  const mode = resolveDashboardDataSource(ctx.effectiveConfig as Record<string, unknown> | undefined);
  return mode === "service" || mode === "auto";
}

function readOutboxCounts(taskState: Record<string, unknown>): {
  pending: number;
  publishing: number;
  failed: number;
  conflict: number;
} {
  const outbox = isRecord(taskState.outbox) ? taskState.outbox : {};
  const num = (key: string) =>
    typeof outbox[key] === "number" && Number.isFinite(outbox[key]) ? (outbox[key] as number) : 0;
  return {
    pending: num("pending"),
    publishing: num("publishing"),
    failed: num("failed"),
    conflict: num("conflict")
  };
}

/**
 * Closeout preflight for dashboard service mode: service health, drained outbox,
 * fresh projection, and no conflict rows. CLI task-sync-* remains the fallback when
 * `dashboard.dataSource` is `auto` and the service is not running.
 */
export async function buildPhaseServiceSyncPreflight(
  ctx: ModuleLifecycleContext
): Promise<PhaseServiceSyncPreflight> {
  const inactive: PhaseServiceSyncPreflight = {
    schemaVersion: 1,
    active: false,
    dataSourceMode: null,
    passed: true,
    findingCount: 0,
    blockingFindingCount: 0,
    findings: [],
    serviceStatus: null,
    taskStateStatus: null
  };

  if (!isPhaseServiceSyncPreflightActive(ctx)) {
    return inactive;
  }

  const dataSourceMode = resolveDashboardDataSource(
    ctx.effectiveConfig as Record<string, unknown> | undefined
  );
  const findings: PhaseServiceSyncFinding[] = [];

  const serviceResult = await runDashboardServiceStatus(ctx);
  const serviceData = isRecord(serviceResult.data) ? serviceResult.data : null;
  const serviceRunning = serviceData?.running === true;
  const serviceHealthy =
    serviceRunning &&
    isRecord(serviceData?.health) &&
    serviceData.health.ok === true;

  if (dataSourceMode === "service") {
    if (!serviceRunning) {
      findings.push({
        code: "service-sync-service-not-running",
        severity: "blocking",
        message: "Dashboard service is not running but dashboard.dataSource is service.",
        remediation:
          "Run `pnpm exec wk run dashboard-service-start` and confirm `dashboard-service-status` reports healthy before closeout.",
        details: { dataSourceMode }
      });
    } else if (!serviceHealthy) {
      findings.push({
        code: "service-sync-service-unhealthy",
        severity: "blocking",
        message: "Dashboard service is running but /health did not report ok.",
        remediation:
          "Inspect `.workspace-kit/dashboard-service/service.log`, restart with `dashboard-service-stop` then `dashboard-service-start`, and re-run preflight.",
        details: { dataSourceMode, health: serviceData?.health ?? null }
      });
    }
  } else if (!serviceRunning) {
    findings.push({
      code: "service-sync-service-not-running",
      severity: "warning",
      message:
        "Dashboard service is not running; closeout continues on CLI task-state fallback (dashboard.dataSource is auto).",
      remediation:
        "Optional: start the service with `dashboard-service-start` so background outbox sync runs during closeout.",
      details: { dataSourceMode, cliFallback: true }
    });
  }

  const taskStateResult = await runTaskStateStatus(ctx, { fetch: false });
  const taskStateStatus = isRecord(taskStateResult.data) ? taskStateResult.data : null;

  if (taskStateStatus) {
    const outbox = readOutboxCounts(taskStateStatus);
    const undrained = outbox.pending + outbox.publishing;
    if (undrained > 0) {
      findings.push({
        code: "service-sync-outbox-not-drained",
        severity: "blocking",
        message: `Canonical event outbox has ${undrained} pending/publishing row(s).`,
        remediation:
          "Drain the outbox with `task-sync-status` / `task-sync-publish`, or wait for the dashboard service sync worker; resolve conflicts before closeout.",
        details: { outbox }
      });
    }

    const localProjection =
      typeof taskStateStatus.localProjection === "string" ? taskStateStatus.localProjection : "unknown";
    if (localProjection !== "fresh") {
      findings.push({
        code: "service-sync-projection-not-fresh",
        severity: "blocking",
        message: `Local task-state projection is '${localProjection}', not fresh.`,
        remediation:
          "Run `pnpm exec wk run task-sync-hydrate '{\"fetch\":true,\"policyApproval\":{...}}'` or resolve conflicts per `.ai/runbooks/task-state-git-operator.md`.",
        details: { localProjection, syncState: taskStateStatus.syncState ?? null }
      });
    }

    const conflictRows = outbox.failed + outbox.conflict;
    if (conflictRows > 0 || localProjection === "conflict") {
      findings.push({
        code: "service-sync-conflict-rows",
        severity: "blocking",
        message:
          conflictRows > 0
            ? `Outbox has ${conflictRows} failed/conflict row(s).`
            : "Task-state sync is in conflict posture.",
        remediation:
          "Resolve outbox conflicts with `task-sync-publish` / operator runbook recovery; do not close the phase until canonical sync is clean.",
        details: { outbox, localProjection }
      });
    }
  }

  const blockingFindingCount = findings.filter((row) => row.severity === "blocking").length;

  return {
    schemaVersion: 1,
    active: true,
    dataSourceMode,
    passed: blockingFindingCount === 0,
    findingCount: findings.length,
    blockingFindingCount,
    findings,
    serviceStatus: serviceData,
    taskStateStatus
  };
}
