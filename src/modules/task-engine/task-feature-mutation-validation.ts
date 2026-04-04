import { WISHLIST_INTAKE_TASK_TYPE } from "./wishlist/wishlist-intake.js";

export function taskTypeFailsClosedOnUnknownFeatures(taskType: string): boolean {
  if (taskType === "improvement" || taskType === WISHLIST_INTAKE_TASK_TYPE) {
    return false;
  }
  return true;
}

export function findUnknownFeatureIds(features: string[] | undefined, known: Set<string>): string[] {
  if (!features?.length) {
    return [];
  }
  return features.filter((f) => !known.has(f));
}
