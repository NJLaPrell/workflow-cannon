import { inferTaskPhaseKey } from "./phase-resolution.js";
import type {
  GuardResult,
  TaskEntity,
  TaskStatus,
  TransitionContext,
  TransitionGuard
} from "./types.js";

export const DELIVERY_EVIDENCE_METADATA_KEY = "deliveryEvidence";
export const DELIVERY_WAIVER_METADATA_KEY = "deliveryWaiver";

export type DeliveryEvidenceEnforcementMode = "off" | "advisory" | "enforce";

export type DeliveryEvidenceViolation = {
  taskId: string;
  title: string;
  status: TaskStatus;
  phaseKey: string | null;
  code: string;
  message: string;
  missingFields: string[];
};

export type DeliveryEvidenceEvaluation = {
  required: boolean;
  satisfied: boolean;
  satisfiedBy: "evidence" | "waiver" | "not-required" | null;
  violations: DeliveryEvidenceViolation[];
};

type DeliveryEvidenceGuardOptions = {
  enforcementMode?: DeliveryEvidenceEnforcementMode;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function positiveInteger(value: unknown): boolean {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function hasResultLikeField(value: Record<string, unknown>): boolean {
  return (
    nonEmptyString(value.result) ||
    nonEmptyString(value.status) ||
    nonEmptyString(value.conclusion) ||
    typeof value.exitCode === "number"
  );
}

function missingDeliveryEvidenceFields(value: unknown): string[] {
  if (!isRecord(value)) {
    return [DELIVERY_EVIDENCE_METADATA_KEY];
  }

  const missing: string[] = [];
  if (value.schemaVersion !== 1) missing.push("deliveryEvidence.schemaVersion");
  if (!nonEmptyString(value.branchName)) missing.push("deliveryEvidence.branchName");
  if (!nonEmptyString(value.prUrl)) missing.push("deliveryEvidence.prUrl");
  if (!positiveInteger(value.prNumber)) missing.push("deliveryEvidence.prNumber");
  if (!nonEmptyString(value.baseBranch)) missing.push("deliveryEvidence.baseBranch");
  if (!nonEmptyString(value.mergeSha)) missing.push("deliveryEvidence.mergeSha");

  const checks = value.checks;
  if (!Array.isArray(checks) || checks.length === 0) {
    missing.push("deliveryEvidence.checks");
  } else {
    for (let i = 0; i < checks.length; i++) {
      const check = checks[i];
      if (!isRecord(check)) {
        missing.push(`deliveryEvidence.checks[${i}]`);
        continue;
      }
      if (!nonEmptyString(check.name)) missing.push(`deliveryEvidence.checks[${i}].name`);
      if (!hasResultLikeField(check)) missing.push(`deliveryEvidence.checks[${i}].result`);
    }
  }

  const validationCommands = value.validationCommands;
  if (!Array.isArray(validationCommands) || validationCommands.length === 0) {
    missing.push("deliveryEvidence.validationCommands");
  } else {
    for (let i = 0; i < validationCommands.length; i++) {
      const validation = validationCommands[i];
      if (!isRecord(validation)) {
        missing.push(`deliveryEvidence.validationCommands[${i}]`);
        continue;
      }
      if (!nonEmptyString(validation.command)) {
        missing.push(`deliveryEvidence.validationCommands[${i}].command`);
      }
      if (!hasResultLikeField(validation)) {
        missing.push(`deliveryEvidence.validationCommands[${i}].result`);
      }
    }
  }

  return missing;
}

function missingDeliveryWaiverFields(value: unknown): string[] {
  if (!isRecord(value)) {
    return [DELIVERY_WAIVER_METADATA_KEY];
  }

  const missing: string[] = [];
  if (value.schemaVersion !== 1) missing.push("deliveryWaiver.schemaVersion");
  if (!nonEmptyString(value.actor)) missing.push("deliveryWaiver.actor");
  if (!nonEmptyString(value.rationale)) missing.push("deliveryWaiver.rationale");
  if (!nonEmptyString(value.timestamp)) missing.push("deliveryWaiver.timestamp");
  if (!nonEmptyString(value.scope)) missing.push("deliveryWaiver.scope");
  return missing;
}

function isLocalOnlyTask(task: TaskEntity): boolean {
  const metadata = task.metadata;
  return Boolean(
    metadata?.deliveryEvidenceRequired === false ||
    metadata?.localOnly === true ||
    metadata?.nonShipping === true
  );
}

export function isPhaseDeliveryTask(task: TaskEntity): boolean {
  if (task.archived || isLocalOnlyTask(task)) {
    return false;
  }
  if (task.type === "wishlist_intake" || task.type === "transcript_churn") {
    return false;
  }
  return inferTaskPhaseKey(task) !== null;
}

export function evaluateDeliveryEvidence(task: TaskEntity): DeliveryEvidenceEvaluation {
  if (!isPhaseDeliveryTask(task)) {
    return {
      required: false,
      satisfied: true,
      satisfiedBy: "not-required",
      violations: []
    };
  }

  const metadata = task.metadata ?? {};
  const evidenceMissing = missingDeliveryEvidenceFields(metadata[DELIVERY_EVIDENCE_METADATA_KEY]);
  if (evidenceMissing.length === 0) {
    return {
      required: true,
      satisfied: true,
      satisfiedBy: "evidence",
      violations: []
    };
  }

  const waiverMissing = missingDeliveryWaiverFields(metadata[DELIVERY_WAIVER_METADATA_KEY]);
  if (waiverMissing.length === 0) {
    return {
      required: true,
      satisfied: true,
      satisfiedBy: "waiver",
      violations: []
    };
  }

  return {
    required: true,
    satisfied: false,
    satisfiedBy: null,
    violations: [
      {
        taskId: task.id,
        title: task.title,
        status: task.status,
        phaseKey: inferTaskPhaseKey(task),
        code: "delivery-evidence-missing",
        message:
          "Phase delivery completion requires metadata.deliveryEvidence or metadata.deliveryWaiver.",
        missingFields: [...evidenceMissing, ...waiverMissing]
      }
    ]
  };
}

export function buildPhaseDeliveryPreflight(args: {
  tasks: TaskEntity[];
  phaseKey?: string | null;
  includeInProgress?: boolean;
}): {
  schemaVersion: 1;
  phaseKey: string | null;
  checkedTaskCount: number;
  violationCount: number;
  violations: DeliveryEvidenceViolation[];
} {
  const includeInProgress = args.includeInProgress ?? true;
  const targetPhase = args.phaseKey?.trim() || null;
  const statuses: TaskStatus[] = includeInProgress ? ["completed", "in_progress"] : ["completed"];

  const checked = args.tasks.filter((task) => {
    if (!statuses.includes(task.status)) return false;
    if (!isPhaseDeliveryTask(task)) return false;
    if (targetPhase === null) return true;
    return inferTaskPhaseKey(task) === targetPhase;
  });

  const violations = checked.flatMap((task) => evaluateDeliveryEvidence(task).violations);

  return {
    schemaVersion: 1,
    phaseKey: targetPhase,
    checkedTaskCount: checked.length,
    violationCount: violations.length,
    violations
  };
}

export function readDeliveryEvidenceEnforcementMode(
  effectiveConfig: Record<string, unknown> | undefined
): DeliveryEvidenceEnforcementMode {
  const tasks = effectiveConfig?.tasks;
  const tasksObj = isRecord(tasks) ? tasks : undefined;
  const deliveryEvidence = tasksObj?.deliveryEvidence;
  const deliveryObj = isRecord(deliveryEvidence) ? deliveryEvidence : undefined;
  const raw = deliveryObj?.enforcementMode;
  if (raw === "off" || raw === "advisory" || raw === "enforce") {
    return raw;
  }
  return "advisory";
}

export function createDeliveryEvidenceGuard(
  options: DeliveryEvidenceGuardOptions = {}
): TransitionGuard {
  const enforcementMode = options.enforcementMode ?? "advisory";
  return {
    name: "delivery-evidence",
    canTransition(
      task: TaskEntity,
      targetState: TaskStatus,
      _context: TransitionContext
    ): GuardResult {
      if (targetState !== "completed" || enforcementMode === "off") {
        return { allowed: true, guardName: "delivery-evidence" };
      }

      const evaluation = evaluateDeliveryEvidence(task);
      if (evaluation.satisfied) {
        return {
          allowed: true,
          guardName: "delivery-evidence",
          code: evaluation.satisfiedBy === "waiver" ? "delivery-waiver-present" : "delivery-evidence-present"
        };
      }

      const violation = evaluation.violations[0];
      return {
        allowed: enforcementMode !== "enforce",
        guardName: "delivery-evidence",
        code: violation?.code ?? "delivery-evidence-missing",
        message: violation?.message ?? "Phase delivery completion evidence is missing."
      };
    }
  };
}
