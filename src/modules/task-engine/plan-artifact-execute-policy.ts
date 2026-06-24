import type { ModuleCommandResult } from "../../contracts/module-contract.js";
import type {
  PlanArtifactExecuteEvidenceBundle,
  PlanArtifactV1
} from "../../core/planning/plan-artifact-v1.js";
import {
  readLatestPlanArtifact,
  readPlanArtifactVersion,
  resolveLatestPlanArtifactVersion
} from "../../core/planning/plan-artifact-storage.js";
import type { GuardResult, TaskEntity, TaskStatus, TransitionContext, TransitionGuard } from "./types.js";

export const PLAN_EXECUTION_EVIDENCE_METADATA_KEY = "planExecutionEvidence";
export const PLAN_ARTIFACT_REF_PREFIX = "plan-artifact:";

export type PlanArtifactExecuteEnforcementMode = "off" | "advisory" | "enforce";

export type PlanExecutionEvidenceMetadata = {
  schemaVersion: 1;
  planId: string;
  planRef: string;
  planVersion: number;
  approvedPlanVersion?: number;
  evidenceBundle: PlanArtifactExecuteEvidenceBundle;
};

export type PlanArtifactExecuteEvaluation = {
  required: boolean;
  satisfied: boolean;
  code: string;
  message?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function positiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

export function readPlanArtifactExecuteEnforcementMode(
  effectiveConfig: Record<string, unknown> | undefined
): PlanArtifactExecuteEnforcementMode {
  const tasks = effectiveConfig?.tasks;
  const tasksObj = isRecord(tasks) ? tasks : undefined;
  const executePolicy = tasksObj?.planArtifactExecute;
  const executeObj = isRecord(executePolicy) ? executePolicy : undefined;
  const raw = executeObj?.enforcementMode;
  if (raw === "off" || raw === "advisory" || raw === "enforce") {
    return raw;
  }
  return "off";
}

export function parsePlanIdFromPlanArtifactRef(planRef: string): string | null {
  if (!planRef.startsWith(PLAN_ARTIFACT_REF_PREFIX)) {
    return null;
  }
  const planId = planRef.slice(PLAN_ARTIFACT_REF_PREFIX.length).trim();
  return planId.length > 0 ? planId : null;
}

export function isPlanArtifactExecuteBypass(task: TaskEntity): boolean {
  const metadata = task.metadata ?? {};
  if (metadata.localOnly === true) {
    return true;
  }
  if (metadata.planArtifactExecuteRequired === false) {
    return true;
  }
  return false;
}

function validateEvidenceBundle(raw: unknown): PlanArtifactExecuteEvidenceBundle | null {
  if (!isRecord(raw)) {
    return null;
  }
  if (
    raw.schemaVersion !== 1 ||
    raw.command !== "execute-plan-artifact" ||
    !nonEmptyString(raw.planId) ||
    !nonEmptyString(raw.planRef) ||
    !positiveInteger(raw.planRevision) ||
    !nonEmptyString(raw.taskId) ||
    !nonEmptyString(raw.linkedAt) ||
    !nonEmptyString(raw.linkedBy)
  ) {
    return null;
  }
  return {
    schemaVersion: 1,
    command: "execute-plan-artifact",
    planId: raw.planId.trim(),
    planRef: raw.planRef.trim(),
    planRevision: raw.planRevision,
    ...(positiveInteger(raw.approvedPlanVersion) ? { approvedPlanVersion: raw.approvedPlanVersion } : {}),
    taskId: raw.taskId.trim(),
    ...(nonEmptyString(raw.wbsId) ? { wbsId: raw.wbsId.trim() } : {}),
    linkedAt: raw.linkedAt.trim(),
    linkedBy: raw.linkedBy.trim()
  };
}

function validatePlanExecutionEvidence(raw: unknown, taskId: string): PlanExecutionEvidenceMetadata | null {
  if (!isRecord(raw) || raw.schemaVersion !== 1) {
    return null;
  }
  if (
    !nonEmptyString(raw.planId) ||
    !nonEmptyString(raw.planRef) ||
    !positiveInteger(raw.planVersion)
  ) {
    return null;
  }
  const evidenceBundle = validateEvidenceBundle(raw.evidenceBundle);
  if (!evidenceBundle || evidenceBundle.taskId !== taskId) {
    return null;
  }
  return {
    schemaVersion: 1,
    planId: raw.planId.trim(),
    planRef: raw.planRef.trim(),
    planVersion: raw.planVersion,
    ...(positiveInteger(raw.approvedPlanVersion) ? { approvedPlanVersion: raw.approvedPlanVersion } : {}),
    evidenceBundle
  };
}

export function evaluatePlanArtifactExecuteLinkage(task: TaskEntity): PlanArtifactExecuteEvaluation {
  if (isPlanArtifactExecuteBypass(task)) {
    return {
      required: false,
      satisfied: true,
      code: "plan-artifact-execute-not-required"
    };
  }

  const evidence = validatePlanExecutionEvidence(task.metadata?.[PLAN_EXECUTION_EVIDENCE_METADATA_KEY], task.id);
  if (evidence) {
    return {
      required: true,
      satisfied: true,
      code: "plan-artifact-execute-linked"
    };
  }

  return {
    required: true,
    satisfied: false,
    code: "plan-artifact-execute-missing",
    message:
      "PlanArtifact execute linkage required: run execute-plan-artifact to record metadata.planExecutionEvidence before start."
  };
}

function resolveApprovalTargetVersion(loaded: PlanArtifactV1): number {
  if (loaded.status === "accepted" && loaded.approvalRecord?.approvedVersion !== undefined) {
    return loaded.approvalRecord.approvedVersion;
  }
  return loaded.version;
}

export function loadExecuteEligiblePlan(
  workspacePath: string,
  planId: string,
  version?: number
):
  | { ok: true; artifact: PlanArtifactV1 }
  | { ok: false; code: string; message: string; data?: Record<string, unknown> } {
  const latestVersion = resolveLatestPlanArtifactVersion(workspacePath, planId);
  if (latestVersion === null) {
    return {
      ok: false,
      code: "plan-artifact-not-found",
      message: `PlanArtifact ${planId} not found`,
      data: { schemaVersion: 1, responseSchemaVersion: 1, planId }
    };
  }

  const targetVersion = version ?? latestVersion;
  const loaded =
    version === undefined
      ? readLatestPlanArtifact(workspacePath, planId)
      : readPlanArtifactVersion(workspacePath, planId, targetVersion);
  if (!loaded) {
    return {
      ok: false,
      code: "plan-artifact-not-found",
      message: `PlanArtifact ${planId} version ${targetVersion} not found`,
      data: { schemaVersion: 1, responseSchemaVersion: 1, planId, version: targetVersion }
    };
  }

  if (version !== undefined && version !== latestVersion) {
    return {
      ok: false,
      code: "plan-artifact-version-mismatch",
      message: `Requested version ${version} is not the latest (${latestVersion})`,
      data: {
        schemaVersion: 1,
        responseSchemaVersion: 1,
        planId,
        version,
        latestVersion
      }
    };
  }

  if (loaded.status !== "accepted" && loaded.status !== "finalized") {
    return {
      ok: false,
      code: "plan-artifact-not-accepted",
      message: `PlanArtifact ${planId} is not accepted or finalized (status: ${loaded.status})`,
      data: {
        schemaVersion: 1,
        responseSchemaVersion: 1,
        planId,
        version: loaded.version,
        status: loaded.status
      }
    };
  }

  const approvalTarget = resolveApprovalTargetVersion(loaded);
  if (
    loaded.approvalRecord?.approvedVersion !== undefined &&
    loaded.approvalRecord.approvedVersion !== approvalTarget &&
    loaded.status === "accepted"
  ) {
    return {
      ok: false,
      code: "plan-artifact-not-accepted",
      message: `PlanArtifact ${planId} approval pin is inconsistent`,
      data: { schemaVersion: 1, responseSchemaVersion: 1, planId, version: loaded.version }
    };
  }

  return { ok: true, artifact: loaded };
}

export function evaluatePersistPlanRefExecuteGate(input: {
  enforcementMode: PlanArtifactExecuteEnforcementMode;
  workspacePath: string;
  planRef: string | undefined;
}): ModuleCommandResult | null {
  if (input.enforcementMode !== "enforce" || !input.planRef) {
    return null;
  }

  const planId = parsePlanIdFromPlanArtifactRef(input.planRef);
  if (!planId) {
    return {
      ok: false,
      code: "plan-artifact-execute-blocked",
      message:
        "persist-planning-execution-drafts planRef must be plan-artifact:<uuid> when tasks.planArtifactExecute.enforcementMode is enforce"
    };
  }

  const loaded = loadExecuteEligiblePlan(input.workspacePath, planId);
  if (!loaded.ok) {
    return {
      ok: false,
      code: loaded.code,
      message: loaded.message,
      data: loaded.data
    };
  }

  if (loaded.artifact.planRef !== input.planRef) {
    return {
      ok: false,
      code: "plan-artifact-schema-invalid",
      message: "planRef does not match stored PlanArtifact planRef",
      data: { schemaVersion: 1, responseSchemaVersion: 1, planId, planRef: input.planRef }
    };
  }

  return null;
}

export function createPlanArtifactExecuteGuard(options: {
  enforcementMode?: PlanArtifactExecuteEnforcementMode;
  effectiveConfig?: Record<string, unknown> | undefined;
  workspacePath?: string;
}): TransitionGuard {
  const enforcementMode =
    options.enforcementMode ?? readPlanArtifactExecuteEnforcementMode(options.effectiveConfig);
  return {
    name: "plan-artifact-execute",
    canTransition(
      task: TaskEntity,
      targetState: TaskStatus,
      _context: TransitionContext
    ): GuardResult {
      if (enforcementMode === "off") {
        return { allowed: true, guardName: "plan-artifact-execute", code: "plan-artifact-execute-off" };
      }

      const isStart = task.status === "ready" && targetState === "in_progress";
      if (!isStart) {
        return { allowed: true, guardName: "plan-artifact-execute", code: "plan-artifact-execute-not-applicable" };
      }

      const evaluation = evaluatePlanArtifactExecuteLinkage(task);
      if (!evaluation.required || evaluation.satisfied) {
        return {
          allowed: true,
          guardName: "plan-artifact-execute",
          code: evaluation.code
        };
      }

      const blocking = enforcementMode === "enforce";
      return {
        allowed: !blocking,
        guardName: "plan-artifact-execute",
        code: blocking ? "plan-artifact-execute-missing" : "plan-artifact-execute-advisory",
        message: evaluation.message
      };
    }
  };
}
