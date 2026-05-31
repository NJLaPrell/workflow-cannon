import type { ModuleLifecycleContext } from "../../../contracts/module-contract.js";
import {
  countPhaseDeliveryTasksForKey,
  isPhaseDeliveryTask,
  listPhaseDeliveryTaskIdsForKey
} from "../delivery-evidence.js";
import { readTasksCanonicalAuthority } from "../persistence/task-state-canonical-authority.js";
import { inferTaskPhaseKey } from "../phase-resolution.js";
import type { TaskEntity } from "../types.js";
import type { TaskStateProjectionV1 } from "../task-state-events/projection-types.js";
import { TASK_STATE_GIT_BRANCH } from "../task-state-git/constants.js";
import { isGitRepository, resolveTaskStateGitRef } from "../task-state-git/git-io.js";
import { readRemoteSnapshotProjection } from "../task-state-git/remote-projection-versions.js";
import { createGitEventLogBackend } from "./git-event-log-backend.js";

export const PHASE_PROJECTION_COUNT_REGRESSION_CODE = "phase-projection-count-regression" as const;
export const PHASE_PROJECTION_LOCAL_EXCEEDS_REMOTE_CODE = "phase-projection-local-exceeds-remote" as const;
export const PHASE_PROJECTION_REMOTE_UNREADABLE_CODE = "phase-projection-remote-unreadable" as const;
export const PHASE_PROJECTION_VERIFY_SCHEMA_FAILURES_CODE = "phase-projection-verify-schema-failures" as const;

export type PhaseProjectionCountGuardFindingCode =
  | typeof PHASE_PROJECTION_COUNT_REGRESSION_CODE
  | typeof PHASE_PROJECTION_LOCAL_EXCEEDS_REMOTE_CODE
  | typeof PHASE_PROJECTION_REMOTE_UNREADABLE_CODE
  | typeof PHASE_PROJECTION_VERIFY_SCHEMA_FAILURES_CODE;

export type PhaseProjectionCountGuardFinding = {
  code: PhaseProjectionCountGuardFindingCode;
  severity: "blocking" | "warning";
  phaseKey: string;
  message: string;
  remediation: string;
  details: {
    localCount: number;
    remoteCount: number | null;
    localOnlyTaskIds?: string[];
    missingFromLocalTaskIds?: string[];
    verifySchemaFailureCount?: number;
  };
};

export type PhaseProjectionCountGuardReport = {
  schemaVersion: 1;
  active: boolean;
  phaseKey: string | null;
  passed: boolean;
  findingCount: number;
  blockingFindingCount: number;
  findings: PhaseProjectionCountGuardFinding[];
  localCount: number;
  remoteCount: number | null;
};

export type BuildPhaseProjectionCountGuardInput = {
  workspacePath: string;
  effectiveConfig?: Record<string, unknown>;
  localTasks: TaskEntity[];
  phaseKey: string | null;
};

function projectionTasks(projection: TaskStateProjectionV1): TaskEntity[] {
  return Object.values(projection.tasksById).map((task) => ({ ...task }));
}

function listPhaseDeliveryTaskIdsInProjection(projection: TaskStateProjectionV1, phaseKey: string): string[] {
  return projectionTasks(projection)
    .filter((task) => isPhaseDeliveryTask(task) && inferTaskPhaseKey(task) === phaseKey)
    .map((task) => task.id)
    .sort();
}

function countPhaseDeliveryTasksInProjection(projection: TaskStateProjectionV1, phaseKey: string): number {
  return listPhaseDeliveryTaskIdsInProjection(projection, phaseKey).length;
}

function diffSorted(localIds: string[], remoteIds: string[]): { onlyLocal: string[]; onlyRemote: string[] } {
  const remoteSet = new Set(remoteIds);
  const localSet = new Set(localIds);
  return {
    onlyLocal: localIds.filter((id) => !remoteSet.has(id)),
    onlyRemote: remoteIds.filter((id) => !localSet.has(id))
  };
}

function inactiveReport(phaseKey: string | null, localCount = 0): PhaseProjectionCountGuardReport {
  return {
    schemaVersion: 1,
    active: false,
    phaseKey,
    passed: true,
    findingCount: 0,
    blockingFindingCount: 0,
    findings: [],
    localCount,
    remoteCount: null
  };
}

/** Closeout/doctor guard when git-event-log is canonical authority. */
export function isPhaseProjectionCountGuardActive(effectiveConfig?: Record<string, unknown>): boolean {
  return readTasksCanonicalAuthority(effectiveConfig) === "git-event-log";
}

function readRemotePhaseProjection(
  workspacePath: string,
  branch: string
): { ok: true; projection: TaskStateProjectionV1 } | { ok: false; message: string } {
  if (!isGitRepository(workspacePath)) {
    return { ok: false, message: "workspace is not a git repository" };
  }
  const resolved = resolveTaskStateGitRef(workspacePath, branch);
  if ("missing" in resolved) {
    return { ok: false, message: `canonical branch ${branch} is not available locally` };
  }
  const projection = readRemoteSnapshotProjection(workspacePath, resolved.ref, resolved.tipSha);
  if (!projection) {
    return { ok: false, message: `could not replay task projection from ${branch}` };
  }
  return { ok: true, projection };
}

/**
 * Compare SQLite phase delivery task counts against git canonical replay before closeout.
 * Blocks when local projection is missing git-known tasks or retains sqlite-only rows.
 */
export function buildPhaseProjectionCountGuard(
  input: BuildPhaseProjectionCountGuardInput
): PhaseProjectionCountGuardReport {
  const phaseKey = input.phaseKey?.trim() || null;
  const localCount = phaseKey ? countPhaseDeliveryTasksForKey(input.localTasks, phaseKey) : 0;

  if (!isPhaseProjectionCountGuardActive(input.effectiveConfig)) {
    return inactiveReport(phaseKey, localCount);
  }
  if (!phaseKey) {
    return inactiveReport(null, localCount);
  }

  const findings: PhaseProjectionCountGuardFinding[] = [];
  const localIds = listPhaseDeliveryTaskIdsForKey(input.localTasks, phaseKey);

  const remoteRead = readRemotePhaseProjection(input.workspacePath, TASK_STATE_GIT_BRANCH);
  let remoteCount: number | null = null;
  if (!remoteRead.ok) {
    findings.push({
      code: PHASE_PROJECTION_REMOTE_UNREADABLE_CODE,
      severity: "warning",
      phaseKey,
      message: `Could not read git canonical projection for phase ${phaseKey}: ${remoteRead.message}`,
      remediation:
        "Run `pnpm exec wk run task-sync-hydrate '{\"fetch\":true,\"policyApproval\":{...}}'` after fixing branch access, or resolve git layout per `.ai/runbooks/task-state-git-operator.md`.",
      details: { localCount, remoteCount: null }
    });
  } else {
    remoteCount = countPhaseDeliveryTasksInProjection(remoteRead.projection, phaseKey);
    const remoteIds = listPhaseDeliveryTaskIdsInProjection(remoteRead.projection, phaseKey);
    const { onlyLocal, onlyRemote } = diffSorted(localIds, remoteIds);

    if (onlyRemote.length > 0) {
      findings.push({
        code: PHASE_PROJECTION_COUNT_REGRESSION_CODE,
        severity: "blocking",
        phaseKey,
        message: `SQLite phase ${phaseKey} has ${localCount} delivery task(s) but git canonical replay has ${remoteCount}; ${onlyRemote.length} task(s) missing locally (${onlyRemote.slice(0, 5).join(", ")}${onlyRemote.length > 5 ? ", …" : ""}).`,
        remediation:
          "Run `task-sync-hydrate` with fetch after resolving outbox conflicts; do not close the phase while local projection drops git-known tasks.",
        details: {
          localCount,
          remoteCount,
          missingFromLocalTaskIds: onlyRemote
        }
      });
    }

    if (onlyLocal.length > 0) {
      findings.push({
        code: PHASE_PROJECTION_LOCAL_EXCEEDS_REMOTE_CODE,
        severity: "blocking",
        phaseKey,
        message: `SQLite phase ${phaseKey} has ${onlyLocal.length} sqlite-only delivery task(s) not present on git canonical replay (${onlyLocal.slice(0, 5).join(", ")}${onlyLocal.length > 5 ? ", …" : ""}).`,
        remediation:
          "Publish `task.created` events via `create-task`, `apply-task-batch`, or `persist-planning-execution-drafts` (git-canonical) before closeout; hydrate will drop unpublished rows.",
        details: {
          localCount,
          remoteCount,
          localOnlyTaskIds: onlyLocal
        }
      });
    }
  }

  const blockingFindingCount = findings.filter((row) => row.severity === "blocking").length;
  return {
    schemaVersion: 1,
    active: true,
    phaseKey,
    passed: blockingFindingCount === 0,
    findingCount: findings.length,
    blockingFindingCount,
    findings,
    localCount,
    remoteCount
  };
}

/** Async variant includes task-sync-verify schema failure counts. */
export async function buildPhaseProjectionCountGuardAsync(
  input: BuildPhaseProjectionCountGuardInput
): Promise<PhaseProjectionCountGuardReport> {
  const base = buildPhaseProjectionCountGuard(input);
  if (!base.active || !base.phaseKey) {
    return base;
  }

  const findings = [...base.findings];
  try {
    const backend = createGitEventLogBackend({ workspacePath: input.workspacePath });
    const verifyResult = await backend.verify();
    const schemaFailures = verifyResult.findings.filter(
      (row) => row.code === "event-schema-validation-failed"
    ).length;
    if (schemaFailures > 0) {
      findings.push({
        code: PHASE_PROJECTION_VERIFY_SCHEMA_FAILURES_CODE,
        severity: "blocking",
        phaseKey: base.phaseKey,
        message: `task-sync-verify reports ${schemaFailures} event-schema-validation-failed finding(s) on ${TASK_STATE_GIT_BRANCH}.`,
        remediation:
          "Repair invalid events on the canonical branch or run operator recovery in `.ai/runbooks/task-state-git-operator.md` before closeout.",
        details: {
          localCount: base.localCount,
          remoteCount: base.remoteCount,
          verifySchemaFailureCount: schemaFailures
        }
      });
    }
  } catch {
    // verify optional when git layout unavailable
  }

  const blockingFindingCount = findings.filter((row) => row.severity === "blocking").length;
  return {
    ...base,
    findings,
    findingCount: findings.length,
    blockingFindingCount,
    passed: blockingFindingCount === 0
  };
}

export type DoctorPhaseProjectionCountIssue = { path: string; reason: string };

/** Doctor hook: surface phase projection drift before silent closeout. */
export async function collectDoctorPhaseProjectionCountIssues(
  cwd: string,
  effective: Record<string, unknown>,
  localTasks: TaskEntity[],
  phaseKey: string | null
): Promise<DoctorPhaseProjectionCountIssue[]> {
  if (!isPhaseProjectionCountGuardActive(effective)) {
    return [];
  }
  const report = await buildPhaseProjectionCountGuardAsync({
    workspacePath: cwd,
    effectiveConfig: effective,
    localTasks,
    phaseKey
  });
  if (!report.active || report.passed) {
    return [];
  }
  return report.findings
    .filter((row) => row.severity === "blocking")
    .map((row) => ({
      path: TASK_STATE_GIT_BRANCH,
      reason: `${row.code}: ${row.message} — ${row.remediation}`
    }));
}

export function isPhaseProjectionCountGuardActiveForContext(ctx: ModuleLifecycleContext): boolean {
  return isPhaseProjectionCountGuardActive(ctx.effectiveConfig as Record<string, unknown> | undefined);
}
