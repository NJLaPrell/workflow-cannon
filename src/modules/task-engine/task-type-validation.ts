import type { TaskEntity } from "./types.js";
import { LEGACY_WISHLIST_ID_METADATA_KEY, WISHLIST_INTAKE_TASK_TYPE } from "./wishlist/wishlist-intake.js";
import { WISHLIST_ID_RE } from "./wishlist/wishlist-validation.js";
import { TRANSCRIPT_CHURN_TASK_TYPE } from "./transcript-churn.js";

export type KnownTaskTypeValidationError = {
  code: "invalid-task-type-requirements";
  message: string;
};

function nonEmptyStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.some((entry) => typeof entry === "string" && entry.trim().length > 0);
}

function nonEmptyMetaString(metadata: Record<string, unknown> | undefined, key: string): boolean {
  const v = metadata?.[key];
  return typeof v === "string" && v.trim().length > 0;
}

/**
 * Optional strictness for known task types.
 * Unknown/custom task types remain passthrough for compatibility.
 */
export function validateKnownTaskTypeRequirements(task: TaskEntity): KnownTaskTypeValidationError | null {
  if (task.type === WISHLIST_INTAKE_TASK_TYPE) {
    const meta = task.metadata;
    if (!meta || typeof meta !== "object" || Array.isArray(meta)) {
      return {
        code: "invalid-task-type-requirements",
        message: `Type '${task.type}' requires a metadata object with intake fields`
      };
    }
    const m = meta as Record<string, unknown>;
    const need = [
      "problemStatement",
      "expectedOutcome",
      "impact",
      "constraints",
      "successSignals",
      "requestor",
      "evidenceRef"
    ] as const;
    const missing = need.filter((k) => !nonEmptyMetaString(m, k));
    if (missing.length > 0) {
      return {
        code: "invalid-task-type-requirements",
        message: `Type '${task.type}' requires non-empty metadata fields: ${missing.join(", ")}`
      };
    }
    const legacy = m[LEGACY_WISHLIST_ID_METADATA_KEY];
    if (legacy !== undefined && (typeof legacy !== "string" || !WISHLIST_ID_RE.test(legacy))) {
      return {
        code: "invalid-task-type-requirements",
        message: `metadata.${LEGACY_WISHLIST_ID_METADATA_KEY} must match W<number> when present`
      };
    }
    return null;
  }

  if (task.type === TRANSCRIPT_CHURN_TASK_TYPE) {
    if (task.status !== "research") {
      return {
        code: "invalid-task-type-requirements",
        message: `Type '${TRANSCRIPT_CHURN_TASK_TYPE}' is only valid with status 'research' (use synthesize-transcript-churn to become improvement/proposed)`
      };
    }
    const meta = task.metadata;
    if (!nonEmptyMetaString(meta, "evidenceKey")) {
      return {
        code: "invalid-task-type-requirements",
        message: `Type '${TRANSCRIPT_CHURN_TASK_TYPE}' requires metadata.evidenceKey`
      };
    }
    if (!nonEmptyStringArray(task.technicalScope) || !nonEmptyStringArray(task.acceptanceCriteria)) {
      return {
        code: "invalid-task-type-requirements",
        message: `Type '${TRANSCRIPT_CHURN_TASK_TYPE}' requires non-empty technicalScope and acceptanceCriteria (pipeline placeholders until synthesis)`
      };
    }
    if (!nonEmptyMetaString(meta, "issue")) {
      return {
        code: "invalid-task-type-requirements",
        message: `Type '${TRANSCRIPT_CHURN_TASK_TYPE}' requires metadata.issue (pipeline forensics body)`
      };
    }
    return null;
  }

  if (task.type !== "improvement") {
    return null;
  }

  const missing: string[] = [];
  if (!nonEmptyStringArray(task.acceptanceCriteria)) {
    missing.push("acceptanceCriteria");
  }
  if (!nonEmptyStringArray(task.technicalScope)) {
    missing.push("technicalScope");
  }
  const meta = task.metadata;
  if (!nonEmptyMetaString(meta, "issue")) {
    missing.push("metadata.issue");
  }
  /** Legacy transcript-hash ids from older `generate-recommendations` runs; may omit `supportingReasoning` until updated. */
  const legacyImpHashId = typeof task.id === "string" && /^imp-[a-f0-9]+$/i.test(task.id);
  if (!legacyImpHashId && !nonEmptyMetaString(meta, "supportingReasoning")) {
    missing.push("metadata.supportingReasoning");
  }

  if (missing.length === 0) {
    return null;
  }

  return {
    code: "invalid-task-type-requirements",
    message: `Type '${task.type}' requires non-empty fields: ${missing.join(", ")}`
  };
}
