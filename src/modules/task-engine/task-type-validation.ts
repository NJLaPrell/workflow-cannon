import type { TaskEntity } from "./types.js";

export type KnownTaskTypeValidationError = {
  code: "invalid-task-type-requirements";
  message: string;
};

function nonEmptyStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.some((entry) => typeof entry === "string" && entry.trim().length > 0);
}

/**
 * Optional strictness for known task types.
 * Unknown/custom task types remain passthrough for compatibility.
 */
export function validateKnownTaskTypeRequirements(task: TaskEntity): KnownTaskTypeValidationError | null {
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

  if (missing.length === 0) {
    return null;
  }

  return {
    code: "invalid-task-type-requirements",
    message: `Type '${task.type}' requires non-empty fields: ${missing.join(", ")}`
  };
}
