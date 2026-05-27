import type { ModuleLifecycleContext } from "../../../contracts/module-contract.js";
import type { TaskStore } from "./store.js";

export type TasksCanonicalAuthority = "sqlite" | "git-event-log";

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
  const tasks = config?.tasks as Record<string, unknown> | undefined;
  const queue = tasks?.canonicalPublishQueue as Record<string, unknown> | undefined;
  return queue?.enabled === true;
}
