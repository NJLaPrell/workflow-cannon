import type { TaskEntity } from "./types.js";

type EntityWithId = {
  id: string;
};

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Allocate the next `{prefix}{number}` id from existing entities.
 */
export function allocateNextNumericId(entities: EntityWithId[], prefix: string): string {
  const re = new RegExp(`^${escapeRegex(prefix)}(\\d+)$`);
  let max = 0;
  for (const entity of entities) {
    const match = re.exec(entity.id);
    if (!match) {
      continue;
    }
    const numericId = Number(match[1]);
    if (Number.isFinite(numericId)) {
      max = Math.max(max, numericId);
    }
  }
  return `${prefix}${max + 1}`;
}

/**
 * Allocate the next task id in `T###` form.
 */
export function allocateNextTaskNumericId(tasks: TaskEntity[]): string {
  return allocateNextNumericId(tasks, "T");
}
