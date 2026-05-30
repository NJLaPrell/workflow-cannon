import type { ModuleLifecycleContext } from "../../../contracts/module-contract.js";
import type { TaskStore } from "./store.js";

export type TasksCanonicalAuthority = "sqlite" | "git-event-log";
export type CanonicalPublishQueueConfig = {
  enabled: boolean;
  batchMaxEvents: number;
  batchMaxAgeMs: number;
  intervalMs: number;
  maxAttempts: number;
};

export const DEFAULT_CANONICAL_PUBLISH_QUEUE_CONFIG: CanonicalPublishQueueConfig = {
  enabled: false,
  batchMaxEvents: 50,
  batchMaxAgeMs: 10_000,
  intervalMs: 5_000,
  maxAttempts: 5
};

export function readTasksCanonicalAuthority(
  config?: Record<string, unknown> | null
): TasksCanonicalAuthority {
  const tasks = config?.tasks as Record<string, unknown> | undefined;
  const raw = tasks?.canonicalAuthority ?? tasks?.taskStateCanonicalAuthority;
  return raw === "git-event-log" ? "git-event-log" : "sqlite";
}

export function isGitTaskStateCanonicalAuthority(ctx: ModuleLifecycleContext): boolean {
  return readTasksCanonicalAuthority(ctx.effectiveConfig as Record<string, unknown> | undefined) === "git-event-log";
}

/** Monotonic per-task version used for optimistic concurrency (matches event applier bumps). */
export function taskVersionFromStore(store: TaskStore, taskId: string): number {
  if (!store.getTask(taskId)) {
    return 0;
  }
  let version = 1;
  for (const tr of store.getTransitionLog()) {
    if (tr.taskId === taskId) {
      version += 1;
    }
  }
  for (const m of store.getMutationLog()) {
    if (m.taskId === taskId && m.mutationType === "update-task") {
      version += 1;
    }
  }
  return version;
}

export function expectedTaskVersionsForTaskIds(
  store: TaskStore,
  taskIds: Iterable<string>
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const taskId of taskIds) {
    const version = taskVersionFromStore(store, taskId);
    if (version > 0) {
      out[taskId] = version;
    }
  }
  return out;
}

export function readCanonicalPublishQueueMode(config?: Record<string, unknown> | null): boolean {
  return readCanonicalPublishQueueConfig(config).enabled;
}

function readPositiveInt(raw: unknown, fallback: number): number {
  if (typeof raw !== "number" || !Number.isFinite(raw)) {
    return fallback;
  }
  const value = Math.trunc(raw);
  return value > 0 ? value : fallback;
}

export function readCanonicalPublishQueueConfig(
  config?: Record<string, unknown> | null
): CanonicalPublishQueueConfig {
  const tasks = config?.tasks as Record<string, unknown> | undefined;
  const queue = tasks?.canonicalPublishQueue as Record<string, unknown> | undefined;
  return {
    enabled: queue?.enabled === true,
    batchMaxEvents: readPositiveInt(
      queue?.batchMaxEvents,
      DEFAULT_CANONICAL_PUBLISH_QUEUE_CONFIG.batchMaxEvents
    ),
    batchMaxAgeMs: readPositiveInt(
      queue?.batchMaxAgeMs,
      DEFAULT_CANONICAL_PUBLISH_QUEUE_CONFIG.batchMaxAgeMs
    ),
    intervalMs: readPositiveInt(queue?.intervalMs, DEFAULT_CANONICAL_PUBLISH_QUEUE_CONFIG.intervalMs),
    maxAttempts: readPositiveInt(queue?.maxAttempts, DEFAULT_CANONICAL_PUBLISH_QUEUE_CONFIG.maxAttempts)
  };
}

export function readCanonicalPublishQueueBatchMaxEvents(config?: Record<string, unknown> | null): number {
  return readCanonicalPublishQueueConfig(config).batchMaxEvents;
}

export function readCanonicalPublishQueueBatchMaxAgeMs(config?: Record<string, unknown> | null): number {
  return readCanonicalPublishQueueConfig(config).batchMaxAgeMs;
}

export function readCanonicalPublishQueueIntervalMs(config?: Record<string, unknown> | null): number {
  return readCanonicalPublishQueueConfig(config).intervalMs;
}

export function readCanonicalPublishQueueMaxAttempts(config?: Record<string, unknown> | null): number {
  return readCanonicalPublishQueueConfig(config).maxAttempts;
}
