import {
  validateKnownTaskTypeRequirements,
  type TaskEntity
} from "../../core/planning/index.js";
import { buildTaskFromConversionPayload, TASK_ID_RE } from "../task-engine/mutation-utils.js";

export function maxNumericTaskIdFromIds(ids: Iterable<string>): number {
  let max = 0;
  for (const id of ids) {
    const match = /^T(\d+)$/.exec(id);
    if (!match) continue;
    const parsed = Number(match[1]);
    if (Number.isFinite(parsed)) {
      max = Math.max(max, parsed);
    }
  }
  return max;
}

export function nextTaskId(tasks: TaskEntity[]): string {
  return `T${maxNumericTaskIdFromIds(tasks.map((t) => t.id)) + 1}`;
}

/**
 * Build execution tasks from operator-supplied drafts (convert-wishlist-compatible rows).
 * Allocates T### ids for rows missing or holding invalid ids; rejects duplicates against the store and within the batch.
 */
export function buildTasksFromExecutionDrafts(args: {
  drafts: unknown;
  existingTasks: TaskEntity[];
  planningType: string;
  planRef: string;
  capturedAnswerKeys: string[];
  timestamp: string;
}):
  | { ok: true; tasks: TaskEntity[] }
  | { ok: false; code: string; message: string } {
  if (!Array.isArray(args.drafts) || args.drafts.length === 0) {
    return {
      ok: false,
      code: "invalid-execution-task-drafts",
      message: "executionTaskDrafts must be a non-empty array of task objects"
    };
  }
  const existingIds = new Set(args.existingTasks.map((t) => t.id));
  let nextAlloc = maxNumericTaskIdFromIds(existingIds);
  const assignedIds: string[] = [];
  const normalizedRows: Record<string, unknown>[] = [];

  for (const raw of args.drafts) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      return {
        ok: false,
        code: "invalid-execution-task-drafts",
        message: "Each executionTaskDrafts entry must be an object"
      };
    }
    const row = { ...(raw as Record<string, unknown>) };
    const idRaw = typeof row.id === "string" ? row.id.trim() : "";
    let id = idRaw;
    if (!TASK_ID_RE.test(id)) {
      nextAlloc += 1;
      id = `T${nextAlloc}`;
      row.id = id;
    }
    if (existingIds.has(id) || assignedIds.includes(id)) {
      return {
        ok: false,
        code: "duplicate-task-id",
        message: `executionTaskDrafts references duplicate or existing task id '${id}'`
      };
    }
    assignedIds.push(id);
    normalizedRows.push(row);
  }

  const built: TaskEntity[] = [];
  for (const row of normalizedRows) {
    const bt = buildTaskFromConversionPayload(row, args.timestamp);
    if (!bt.ok) {
      return { ok: false, code: "invalid-execution-task-drafts", message: bt.message };
    }
    const knownTypeValidationError = validateKnownTaskTypeRequirements(bt.task);
    if (knownTypeValidationError) {
      return {
        ok: false,
        code: knownTypeValidationError.code,
        message: knownTypeValidationError.message
      };
    }
    const withProv: TaskEntity = {
      ...bt.task,
      metadata: {
        ...(bt.task.metadata ?? {}),
        planRef: args.planRef,
        planningProvenance: {
          planningType: args.planningType,
          outputMode: "tasks",
          source: "build-plan-execution-drafts",
          capturedAnswerKeys: args.capturedAnswerKeys
        }
      }
    };
    built.push(withProv);
  }

  return { ok: true, tasks: built };
}
