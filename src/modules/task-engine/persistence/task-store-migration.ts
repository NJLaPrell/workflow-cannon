import type { TaskStoreDocument } from "../types.js";
import { TaskEngineError } from "../transitions.js";
import { attachAgentRoutingToTasks } from "../agent-task-routing-projection.js";

/** Schema versions accepted on read; normalized to canonical `schemaVersion: 1` in memory and on save (today). */
export function isSupportedReadTaskStoreSchemaVersion(v: unknown): boolean {
  return v === 1 || v === 2;
}

function assertTaskStoreCoreShape(o: Record<string, unknown>): void {
  if (!Array.isArray(o.tasks) || !Array.isArray(o.transitionLog)) {
    throw new TaskEngineError("storage-read-error", "Task store document missing tasks or transitionLog");
  }
  if (typeof o.lastUpdated !== "string") {
    throw new TaskEngineError("storage-read-error", "Task store document missing lastUpdated");
  }
}

/**
 * Parse a decoded task-store JSON object into the canonical in-memory document (`schemaVersion` 1).
 * Version 2 is currently a no-op forward label (same required fields as v1); it normalizes to v1 on load/save.
 */
export function normalizeTaskStoreDocumentFromUnknown(parsed: unknown): TaskStoreDocument {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new TaskEngineError("storage-read-error", "Task store document must be a JSON object");
  }
  const o = parsed as Record<string, unknown>;
  if (!isSupportedReadTaskStoreSchemaVersion(o.schemaVersion)) {
    throw new TaskEngineError(
      "storage-read-error",
      `Unsupported schema version: ${String(o.schemaVersion)}`
    );
  }
  assertTaskStoreCoreShape(o);
  const mutationLog = Array.isArray(o.mutationLog) ? o.mutationLog : [];
  return {
    schemaVersion: 1,
    tasks: attachAgentRoutingToTasks(o.tasks as TaskStoreDocument["tasks"]),
    transitionLog: o.transitionLog as TaskStoreDocument["transitionLog"],
    mutationLog: mutationLog as TaskStoreDocument["mutationLog"],
    lastUpdated: o.lastUpdated as string
  };
}
