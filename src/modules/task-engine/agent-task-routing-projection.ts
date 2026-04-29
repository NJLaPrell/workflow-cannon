import type { AgentTaskRoutingMetadata } from "../../contracts/agent-task-read-contract.js";
import type { TaskEntity } from "./types.js";
import { getTaskQueueNamespace } from "./suggestions.js";

function readMetaString(md: Record<string, unknown> | undefined, key: string): string | null {
  if (!md) {
    return null;
  }
  const v = md[key];
  return typeof v === "string" && v.length > 0 ? v : null;
}

function readMetaStringArray(md: Record<string, unknown> | undefined, key: string): string[] {
  if (!md) {
    return [];
  }
  const v = md[key];
  if (!Array.isArray(v)) {
    return [];
  }
  return v.filter((e): e is string => typeof e === "string" && e.length > 0);
}

/** Stable v1 routing projection for agent consumers (list/get/next-actions). */
export function buildAgentTaskRoutingMetadata(task: TaskEntity): AgentTaskRoutingMetadata {
  const md = task.metadata && typeof task.metadata === "object" && !Array.isArray(task.metadata)
    ? (task.metadata as Record<string, unknown>)
    : undefined;
  const qn = getTaskQueueNamespace(task);
  const features = [...(task.features ?? [])].sort();
  const keys = md ? Object.keys(md) : [];
  /** Keys mirrored in routing projection or common routing-adjacent labels; anything else implies extension/module payload. */
  const routingScopedKeys = new Set([
    "queueNamespace",
    "evidenceKey",
    "evidenceKind",
    "category",
    "tags",
    "confidenceTier",
    "blockedReasonCategory",
    "source",
    "plannedPhase",
    "roadmapItem"
  ]);
  const hasModuleMetadata = keys.some((k) => !routingScopedKeys.has(k));

  return {
    ownership: task.ownership ?? null,
    queueNamespace: qn,
    features,
    source: readMetaString(md, "source"),
    hasModuleMetadata,
    category: readMetaString(md, "category"),
    tags: readMetaStringArray(md, "tags"),
    confidenceTier: readMetaString(md, "confidenceTier"),
    blockedReasonCategory: readMetaString(md, "blockedReasonCategory")
  };
}

/** Attach `agentRouting` for CLI JSON surfaces; idempotent. */
export function attachAgentRoutingProjection(task: TaskEntity): TaskEntity {
  return {
    ...task,
    agentRouting: buildAgentTaskRoutingMetadata(task)
  };
}

/** Remove projection before persisting JSON blobs (ephemeral field). */
export function stripAgentRoutingFromTask(task: TaskEntity): TaskEntity {
  if (task.agentRouting === undefined) {
    return task;
  }
  const { agentRouting: _ar, ...rest } = task;
  return rest;
}

export function attachAgentRoutingToTasks(tasks: TaskEntity[]): TaskEntity[] {
  return tasks.map((t) => attachAgentRoutingProjection(t));
}
