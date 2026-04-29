import type { TaskEntity } from "./types.js";
import { TASK_ID_RE, compareTaskIdNumeric } from "./mutation-utils.js";

/** Hard cap for `list-tasks` `limit` (abuse / payload size). */
export const LIST_TASKS_MAX_LIMIT = 500;

/** Default `limit` when the client passes `cursor` without an explicit `limit`. */
export const LIST_TASKS_DEFAULT_LIMIT = 100;

export function listTasksComparator(a: TaskEntity, b: TaskEntity): number {
  const ct = b.updatedAt.localeCompare(a.updatedAt);
  if (ct !== 0) {
    return ct;
  }
  return compareTaskIdNumeric(a.id, b.id);
}

export function encodeListTasksCursor(task: TaskEntity): string {
  return Buffer.from(JSON.stringify({ u: task.updatedAt, i: task.id }), "utf8").toString("base64url");
}

export function decodeListTasksCursor(cursor: string): { u: string; i: string } | null {
  try {
    const raw = Buffer.from(cursor, "base64url").toString("utf8");
    const o = JSON.parse(raw) as { u?: unknown; i?: unknown };
    if (typeof o.u === "string" && typeof o.i === "string" && TASK_ID_RE.test(o.i)) {
      return { u: o.u, i: o.i };
    }
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * True when `task` is strictly after `cursor` in `listTasksComparator` sort order
 * (older / lower-priority rows for paging).
 */
export function listTaskIsAfterCursor(task: TaskEntity, cursor: { u: string; i: string }): boolean {
  const ord = task.updatedAt.localeCompare(cursor.u);
  if (ord < 0) {
    return true;
  }
  if (ord > 0) {
    return false;
  }
  return compareTaskIdNumeric(task.id, cursor.i) > 0;
}
