import type { TaskEntity } from "../types.js";

/** Resolve stable phase key from task metadata (phaseKey or phase label). */
export function inferPhaseKeyFromTask(task: TaskEntity | undefined): string | null {
  if (!task) {
    return null;
  }
  if (typeof task.phaseKey === "string" && task.phaseKey.trim()) {
    return task.phaseKey.trim();
  }
  const label = typeof task.phase === "string" ? task.phase : "";
  const m = /\b(?:phase|Phase)\s*([0-9]+)\b/.exec(label);
  if (m) {
    return m[1];
  }
  return null;
}
