import fs from "node:fs/promises";
import path from "node:path";
import type { TaskEntity, TaskStoreDocument } from "../types.js";
import { getNextActions } from "../suggestions.js";

export const REPLAY_QUEUE_SNAPSHOT_SCHEMA_VERSION = 1 as const;

const REPLAY_CAVEAT =
  "Replay uses frozen tasks only; live store is untouched. Code/version skew: queue rules in this binary may differ from the version that produced the snapshot — treat historical answers as approximate.";

function isTaskEntityLike(row: unknown): row is TaskEntity {
  if (!row || typeof row !== "object" || Array.isArray(row)) {
    return false;
  }
  const o = row as Record<string, unknown>;
  return (
    typeof o.id === "string" &&
    typeof o.status === "string" &&
    typeof o.type === "string" &&
    typeof o.title === "string" &&
    typeof o.createdAt === "string" &&
    typeof o.updatedAt === "string"
  );
}

export function parseTasksFromSnapshotPayload(parsed: unknown): TaskEntity[] {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("snapshot: expected JSON object");
  }
  const o = parsed as Record<string, unknown>;
  let raw: unknown;
  if (Array.isArray(o.tasks)) {
    raw = o.tasks;
  } else if (o.schemaVersion === 1 && Array.isArray((parsed as TaskStoreDocument).tasks)) {
    raw = (parsed as TaskStoreDocument).tasks;
  } else {
    throw new Error("snapshot: expected top-level tasks array or task store document with tasks[]");
  }
  if (!Array.isArray(raw)) {
    throw new Error("snapshot: tasks must be an array");
  }
  const out: TaskEntity[] = [];
  for (const row of raw) {
    if (!isTaskEntityLike(row)) {
      throw new Error(`snapshot: invalid task row near id=${String((row as TaskEntity)?.id)}`);
    }
    out.push(row);
  }
  return out;
}

export async function loadTasksFromSnapshotFile(
  workspacePath: string,
  snapshotRelativePath: string
): Promise<TaskEntity[]> {
  const abs = path.resolve(workspacePath, snapshotRelativePath);
  const workspaceRoot = path.resolve(workspacePath);
  const rel = path.relative(workspaceRoot, abs);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error("snapshot: path must stay under workspace root");
  }
  const rawText = await fs.readFile(abs, "utf8");
  const parsed = JSON.parse(rawText) as unknown;
  return parseTasksFromSnapshotPayload(parsed);
}

export type ReplayQueueSnapshotResult = {
  schemaVersion: typeof REPLAY_QUEUE_SNAPSHOT_SCHEMA_VERSION;
  replay: true;
  caveat: string;
  taskCount: number;
  queueNamespace: string | null;
} & ReturnType<typeof getNextActions> & { scope: "tasks-only" };

export function replayQueueFromTasks(
  tasks: TaskEntity[],
  options?: { queueNamespace?: string }
): ReplayQueueSnapshotResult {
  const suggestion = getNextActions(tasks, options);
  return {
    schemaVersion: REPLAY_QUEUE_SNAPSHOT_SCHEMA_VERSION,
    replay: true,
    caveat: REPLAY_CAVEAT,
    taskCount: tasks.length,
    queueNamespace: options?.queueNamespace?.trim() ? options.queueNamespace.trim() : null,
    ...suggestion,
    scope: "tasks-only"
  };
}
