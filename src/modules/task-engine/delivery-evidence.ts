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

/** v2 discriminant for `deliveryEvidence.schemaVersion === 2`. */
export type DeliveryEvidenceModeV2 =
  | "github-pr"
  | "local-reviewed-merge"
  | "direct-reviewed-merge"
  | "external-review";

export const DELIVERY_EVIDENCE_V2_MODES: ReadonlySet<DeliveryEvidenceModeV2> = new Set([
  "github-pr",
  "local-reviewed-merge",
  "direct-reviewed-merge",
  "external-review"
]);

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
  /** When satisfied via evidence: reported shape (best-effort). */
  evidenceSchemaVersion?: 1 | 2;
  evidenceMode?: DeliveryEvidenceModeV2 | "v1-github-pr";
};

export type EvaluateDeliveryEvidenceOptions = {
  /**
   * When set (e.g. from resolved maintainer delivery policy), v2 evidence with a mode
   * outside this list yields `delivery-evidence-mode-not-allowed`.
   */
  allowedEvidenceModes?: readonly string[];
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

function validateChecksAndValidationCommands(value: Record<string, unknown>, prefix: string): string[] {
  const missing: string[] = [];
  const checks = value.checks;
  if (!Array.isArray(checks) || checks.length === 0) {
    missing.push(`${prefix}.checks`);
  } else {
    for (let i = 0; i < checks.length; i++) {
      const check = checks[i];
      if (!isRecord(check)) {
        missing.push(`${prefix}.checks[${i}]`);
        continue;
      }
      if (!nonEmptyString(check.name)) missing.push(`${prefix}.checks[${i}].name`);
      if (!hasResultLikeField(check)) missing.push(`${prefix}.checks[${i}].result`);
    }
  }

  const validationCommands = value.validationCommands;
  if (!Array.isArray(validationCommands) || validationCommands.length === 0) {
    missing.push(`${prefix}.validationCommands`);
  } else {
    for (let i = 0; i < validationCommands.length; i++) {
      const validation = validationCommands[i];
      if (!isRecord(validation)) {
        missing.push(`${prefix}.validationCommands[${i}]`);
        continue;
      }
      if (!nonEmptyString(validation.command)) {
        missing.push(`${prefix}.validationCommands[${i}].command`);
      }
      if (!hasResultLikeField(validation)) {
        missing.push(`${prefix}.validationCommands[${i}].result`);
      }
    }
  }
  return missing;
}

/** v1 GitHub PR-shaped evidence (legacy). */
export function missingDeliveryEvidenceFieldsV1(value: unknown): string[] {
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

  missing.push(...validateChecksAndValidationCommands(value, "deliveryEvidence"));

  return missing;
}

type EvidenceValidateFailure = { ok: false; code: string; missingFields: string[] };

function validateDeliveryEvidenceV2(
  evidence: Record<string, unknown>,
  allowedEvidenceModes: readonly string[] | undefined
): EvidenceValidateFailure | null {
  const prefix = "deliveryEvidence";
  if (evidence.schemaVersion !== 2) {
    return {
      ok: false,
      code: "delivery-evidence-malformed-v2",
      missingFields: [`${prefix}.schemaVersion`]
    };
  }

  const modeRaw = evidence.mode;
  if (!nonEmptyString(modeRaw)) {
    return {
      ok: false,
      code: "delivery-evidence-malformed-v2",
      missingFields: [`${prefix}.mode`]
    };
  }

  const mode = modeRaw.trim();
  if (!DELIVERY_EVIDENCE_V2_MODES.has(mode as DeliveryEvidenceModeV2)) {
    return {
      ok: false,
      code: "delivery-evidence-unsupported-mode",
      missingFields: [`${prefix}.mode`]
    };
  }

  const modeTyped = mode as DeliveryEvidenceModeV2;
  if (allowedEvidenceModes && allowedEvidenceModes.length > 0 && !allowedEvidenceModes.includes(modeTyped)) {
    return {
      ok: false,
      code: "delivery-evidence-mode-not-allowed",
      missingFields: [`${prefix}.mode`]
    };
  }

  const missing: string[] = [];
  if (!nonEmptyString(evidence.branchName)) missing.push(`${prefix}.branchName`);
  if (!nonEmptyString(evidence.baseBranch)) missing.push(`${prefix}.baseBranch`);
  if (!nonEmptyString(evidence.mergeSha)) missing.push(`${prefix}.mergeSha`);

  missing.push(...validateChecksAndValidationCommands(evidence, prefix));

  if (modeTyped === "github-pr") {
    if (!nonEmptyString(evidence.prUrl)) missing.push(`${prefix}.prUrl`);
    if (!positiveInteger(evidence.prNumber)) missing.push(`${prefix}.prNumber`);
  } else if (modeTyped === "local-reviewed-merge" || modeTyped === "direct-reviewed-merge") {
    if (!nonEmptyString(evidence.reviewer)) {
      missing.push(`${prefix}.reviewer`);
    }
    if (modeTyped === "local-reviewed-merge") {
      if (!nonEmptyString(evidence.reviewArtifactRelativePath)) {
        missing.push(`${prefix}.reviewArtifactRelativePath`);
      }
    }
  } else if (modeTyped === "external-review") {
    if (!nonEmptyString(evidence.externalReviewUrl)) {
      missing.push(`${prefix}.externalReviewUrl`);
    }
  }

  if (missing.length > 0) {
    return { ok: false, code: "delivery-evidence-malformed-v2", missingFields: missing };
  }

  return null;
}

export function summarizeDeliveryEvidence(evidence: unknown): {
  schemaVersion: number | null;
  mode: string | null;
} {
  if (!isRecord(evidence)) {
    return { schemaVersion: null, mode: null };
  }
  const sv = evidence.schemaVersion;
  const schemaVersion = typeof sv === "number" && Number.isInteger(sv) ? sv : null;
  const modeRaw = evidence.mode;
  const mode = nonEmptyString(modeRaw) ? modeRaw.trim() : null;
  return { schemaVersion, mode };
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

function violationMessageForCode(code: string): string {
  switch (code) {
    case "delivery-evidence-malformed-v1":
      return "deliveryEvidence (v1) is present but missing required fields.";
    case "delivery-evidence-malformed-v2":
      return "deliveryEvidence (v2) is present but missing required fields.";
    case "delivery-evidence-unsupported-schema":
      return "deliveryEvidence uses an unsupported schemaVersion (expected 1 or 2).";
    case "delivery-evidence-unsupported-mode":
      return "deliveryEvidence (v2) uses an unsupported mode.";
    case "delivery-evidence-mode-not-allowed":
      return "deliveryEvidence (v2) mode is not allowed by the active delivery policy.";
    default:
      return "deliveryEvidence validation failed.";
  }
}

function evaluateEvidenceBlob(
  raw: unknown,
  options: EvaluateDeliveryEvidenceOptions | undefined
):
  | { ok: true; schemaVersion: 1 | 2; evidenceMode?: DeliveryEvidenceModeV2 | "v1-github-pr" }
  | EvidenceValidateFailure {
  if (!isRecord(raw)) {
    return { ok: false, code: "delivery-evidence-malformed-v1", missingFields: [DELIVERY_EVIDENCE_METADATA_KEY] };
  }

  const sv = raw.schemaVersion;
  if (sv === 1) {
    const missing = missingDeliveryEvidenceFieldsV1(raw);
    if (missing.length > 0) {
      return { ok: false, code: "delivery-evidence-malformed-v1", missingFields: missing };
    }
    return { ok: true, schemaVersion: 1, evidenceMode: "v1-github-pr" };
  }

  if (sv === 2) {
    const v2Err = validateDeliveryEvidenceV2(raw, options?.allowedEvidenceModes);
    if (v2Err) {
      return v2Err;
    }
    const modeStr = nonEmptyString(raw.mode) ? raw.mode.trim() : "";
    return {
      ok: true,
      schemaVersion: 2,
      evidenceMode: modeStr as DeliveryEvidenceModeV2
    };
  }

  if (sv === undefined) {
    return {
      ok: false,
      code: "delivery-evidence-unsupported-schema",
      missingFields: ["deliveryEvidence.schemaVersion"]
    };
  }

  return {
    ok: false,
    code: "delivery-evidence-unsupported-schema",
    missingFields: ["deliveryEvidence.schemaVersion"]
  };
}

export function evaluateDeliveryEvidence(
  task: TaskEntity,
  options?: EvaluateDeliveryEvidenceOptions
): DeliveryEvidenceEvaluation {
  if (!isPhaseDeliveryTask(task)) {
    return {
      required: false,
      satisfied: true,
      satisfiedBy: "not-required",
      violations: []
    };
  }

  const metadata = task.metadata ?? {};
  const evidenceRaw = metadata[DELIVERY_EVIDENCE_METADATA_KEY];

  if (evidenceRaw !== undefined && evidenceRaw !== null) {
    const evaluated = evaluateEvidenceBlob(evidenceRaw, options);
    if ("ok" in evaluated && evaluated.ok === true) {
      return {
        required: true,
        satisfied: true,
        satisfiedBy: "evidence",
        violations: [],
        evidenceSchemaVersion: evaluated.schemaVersion,
        evidenceMode: evaluated.evidenceMode
      };
    }
    const bad = evaluated as EvidenceValidateFailure;
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
          code: bad.code,
          message: violationMessageForCode(bad.code),
          missingFields: bad.missingFields
        }
      ]
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
        missingFields: [...[DELIVERY_EVIDENCE_METADATA_KEY], ...waiverMissing]
      }
    ]
  };
}

export function buildPhaseDeliveryPreflight(args: {
  tasks: TaskEntity[];
  phaseKey?: string | null;
  includeInProgress?: boolean;
  /** When set, constrains acceptable v2 evidence modes (policy-aware preflight). */
  allowedEvidenceModesByTaskId?: Record<string, readonly string[]>;
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

  const violations = checked.flatMap((task) => {
    const allowed = args.allowedEvidenceModesByTaskId?.[task.id];
    return evaluateDeliveryEvidence(task, allowed ? { allowedEvidenceModes: allowed } : undefined).violations;
  });

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
  options: DeliveryEvidenceGuardOptions & EvaluateDeliveryEvidenceOptions = {}
): TransitionGuard {
  const enforcementMode = options.enforcementMode ?? "advisory";
  const evidenceOpts: EvaluateDeliveryEvidenceOptions = {
    allowedEvidenceModes: options.allowedEvidenceModes
  };
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

      const evaluation = evaluateDeliveryEvidence(task, evidenceOpts);
      if (evaluation.satisfied) {
        const code =
          evaluation.satisfiedBy === "waiver"
            ? "delivery-waiver-present"
            : evaluation.satisfiedBy === "not-required"
              ? "delivery-evidence-not-required"
              : "delivery-evidence-present";
        return {
          allowed: true,
          guardName: "delivery-evidence",
          code
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
