import { planningStrictValidationEnabled } from "../planning-config.js";
import type { TaskStore } from "../persistence/store.js";
import { validateTaskSetForStrictMode } from "../strict-task-validation.js";

/** Post-mutation strict-mode check over the full task set in the store. */
export function strictValidationError(
  store: TaskStore,
  effectiveConfig: Record<string, unknown> | undefined
): string | null {
  if (!planningStrictValidationEnabled({ effectiveConfig })) {
    return null;
  }
  return validateTaskSetForStrictMode(store.getAllTasks());
}
