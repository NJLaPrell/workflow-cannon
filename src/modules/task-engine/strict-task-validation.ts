import type { TaskEntity } from "./types.js";
import { validateKnownTaskTypeRequirements } from "./task-type-validation.js";

const TASK_ID_RE = /^T\d+$/;
const ALLOWED_STATUS = new Set(["proposed", "ready", "in_progress", "blocked", "completed", "cancelled"]);

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function isIsoDateLike(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && Number.isFinite(Date.parse(value));
}

export function validateTaskEntityForStrictMode(task: TaskEntity): string | null {
  if (!TASK_ID_RE.test(task.id)) {
    return `task '${task.id}' has invalid id format`;
  }
  if (typeof task.title !== "string" || task.title.trim().length === 0) {
    return `task '${task.id}' has empty title`;
  }
  if (!ALLOWED_STATUS.has(task.status)) {
    return `task '${task.id}' has unsupported status '${String(task.status)}'`;
  }
  if (typeof task.type !== "string" || task.type.trim().length === 0) {
    return `task '${task.id}' has empty type`;
  }
  if (!isIsoDateLike(task.createdAt) || !isIsoDateLike(task.updatedAt)) {
    return `task '${task.id}' has invalid createdAt/updatedAt timestamps`;
  }
  if (task.dependsOn !== undefined && !isStringArray(task.dependsOn)) {
    return `task '${task.id}' has invalid dependsOn values`;
  }
  if (task.unblocks !== undefined && !isStringArray(task.unblocks)) {
    return `task '${task.id}' has invalid unblocks values`;
  }
  if (task.technicalScope !== undefined && !isStringArray(task.technicalScope)) {
    return `task '${task.id}' has invalid technicalScope values`;
  }
  if (task.acceptanceCriteria !== undefined && !isStringArray(task.acceptanceCriteria)) {
    return `task '${task.id}' has invalid acceptanceCriteria values`;
  }
  if (task.type === "wishlist_intake" && task.phase !== undefined && String(task.phase).trim().length > 0) {
    return `task '${task.id}': wishlist_intake tasks must not set phase (ideation-only until converted)`;
  }
  const knownTypeValidation = validateKnownTaskTypeRequirements(task);
  if (knownTypeValidation) {
    return `task '${task.id}': ${knownTypeValidation.message}`;
  }
  return null;
}

export function validateTaskSetForStrictMode(tasks: TaskEntity[]): string | null {
  for (const task of tasks) {
    const issue = validateTaskEntityForStrictMode(task);
    if (issue) {
      return issue;
    }
  }
  return null;
}
