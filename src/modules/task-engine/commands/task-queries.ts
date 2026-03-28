import type { ModuleCommandResult, ModuleLifecycleContext } from "../../../contracts/module-contract.js";
import type { OpenedPlanningStores } from "../planning-open.js";
import type { TaskStore } from "../store.js";
import type { TaskStatus } from "../types.js";
import { getAllowedTransitionsFrom } from "../transitions.js";
import { getNextActions } from "../suggestions.js";
import { isRecordLike, readMetadataPath, SAFE_METADATA_PATH_RE } from "./shared.js";

export async function handleGetTask(
  args: Record<string, unknown>,
  ctx: ModuleLifecycleContext,
  planning: OpenedPlanningStores,
  store: TaskStore
): Promise<ModuleCommandResult> {
  const taskId = typeof args.taskId === "string" ? args.taskId : undefined;
  if (!taskId) {
    return { ok: false, code: "invalid-task-schema", message: "get-task requires 'taskId' argument" };
  }
  const task = store.getTask(taskId);
  if (!task) {
    return { ok: false, code: "task-not-found", message: `Task '${taskId}' not found` };
  }
  const historyLimitRaw = args.historyLimit;
  const historyLimit =
    typeof historyLimitRaw === "number" && Number.isFinite(historyLimitRaw) && historyLimitRaw > 0
      ? Math.min(Math.floor(historyLimitRaw), 200)
      : 50;
  const log = store.getTransitionLog();
  const recentTransitions = log
    .filter((e) => e.taskId === taskId)
    .sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1))
    .slice(0, historyLimit);
  const allowedActions = getAllowedTransitionsFrom(task.status as TaskStatus).map(({ to, action }) => ({
    action,
    targetStatus: to
  }));
  return {
    ok: true,
    code: "task-retrieved",
    data: { task, recentTransitions, allowedActions } as Record<string, unknown>
  };
}

export async function handleListTasks(
  args: Record<string, unknown>,
  ctx: ModuleLifecycleContext,
  planning: OpenedPlanningStores,
  store: TaskStore
): Promise<ModuleCommandResult> {
  const statusFilter = typeof args.status === "string" ? (args.status as TaskStatus) : undefined;
  const phaseFilter = typeof args.phase === "string" ? args.phase : undefined;
  const typeFilter = typeof args.type === "string" && args.type.trim().length > 0 ? args.type.trim() : undefined;
  const categoryFilter =
    typeof args.category === "string" && args.category.trim().length > 0 ? args.category.trim() : undefined;
  const tagsFilterRaw = args.tags;
  const tagsFilter =
    typeof tagsFilterRaw === "string"
      ? [tagsFilterRaw]
      : Array.isArray(tagsFilterRaw)
        ? tagsFilterRaw.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
        : [];
  const metadataFilters = isRecordLike(args.metadataFilters)
    ? Object.entries(args.metadataFilters).filter(([path]) => SAFE_METADATA_PATH_RE.test(path))
    : [];
  const includeArchived = args.includeArchived === true;

  let tasks = includeArchived ? store.getAllTasks() : store.getActiveTasks();
  if (statusFilter) {
    tasks = tasks.filter((t) => t.status === statusFilter);
  }
  if (phaseFilter) {
    tasks = tasks.filter((t) => t.phase === phaseFilter);
  }
  if (typeFilter) {
    tasks = tasks.filter((t) => t.type === typeFilter);
  }
  if (categoryFilter) {
    tasks = tasks.filter((t) => readMetadataPath(t.metadata, "category") === categoryFilter);
  }
  if (tagsFilter.length > 0) {
    tasks = tasks.filter((t) => {
      const tags = readMetadataPath(t.metadata, "tags");
      if (!Array.isArray(tags)) {
        return false;
      }
      const normalized = tags.filter((entry): entry is string => typeof entry === "string");
      return tagsFilter.every((tag) => normalized.includes(tag));
    });
  }
  if (metadataFilters.length > 0) {
    tasks = tasks.filter((t) =>
      metadataFilters.every(([path, expected]) => readMetadataPath(t.metadata, path) === expected)
    );
  }

  return {
    ok: true,
    code: "tasks-listed",
    message: `Found ${tasks.length} tasks`,
    data: { tasks, count: tasks.length, scope: "tasks-only" } as Record<string, unknown>
  };
}

export async function handleGetReadyQueue(
  args: Record<string, unknown>,
  ctx: ModuleLifecycleContext,
  planning: OpenedPlanningStores,
  store: TaskStore
): Promise<ModuleCommandResult> {
  const tasks = store.getActiveTasks();
  const ready = tasks
    .filter((t) => t.status === "ready")
    .sort((a, b) => {
      const pa = a.priority ?? "P9";
      const pb = b.priority ?? "P9";
      return pa.localeCompare(pb);
    });
  return {
    ok: true,
    code: "ready-queue-retrieved",
    message: `${ready.length} tasks in ready queue`,
    data: { tasks: ready, count: ready.length, scope: "tasks-only" } as Record<string, unknown>
  };
}

export async function handleGetNextActions(
  args: Record<string, unknown>,
  ctx: ModuleLifecycleContext,
  planning: OpenedPlanningStores,
  store: TaskStore
): Promise<ModuleCommandResult> {
  const tasks = store.getActiveTasks();
  const suggestion = getNextActions(tasks);
  return {
    ok: true,
    code: "next-actions-retrieved",
    message: suggestion.suggestedNext
      ? `Suggested next: ${suggestion.suggestedNext.id} — ${suggestion.suggestedNext.title}`
      : "No tasks in ready queue",
    data: { ...suggestion, scope: "tasks-only" } as unknown as Record<string, unknown>
  };
}

export async function handleGetTaskSummary(
  args: Record<string, unknown>,
  ctx: ModuleLifecycleContext,
  planning: OpenedPlanningStores,
  store: TaskStore
): Promise<ModuleCommandResult> {
  const tasks = store.getActiveTasks();
  const suggestion = getNextActions(tasks);
  return {
    ok: true,
    code: "task-summary",
    data: {
      scope: "tasks-only",
      stateSummary: suggestion.stateSummary,
      readyQueueCount: suggestion.readyQueue.length,
      suggestedNext: suggestion.suggestedNext
        ? {
            id: suggestion.suggestedNext.id,
            title: suggestion.suggestedNext.title,
            priority: suggestion.suggestedNext.priority ?? null
          }
        : null
    } as Record<string, unknown>
  };
}

export async function handleGetBlockedSummary(
  args: Record<string, unknown>,
  ctx: ModuleLifecycleContext,
  planning: OpenedPlanningStores,
  store: TaskStore
): Promise<ModuleCommandResult> {
  const tasks = store.getActiveTasks();
  const suggestion = getNextActions(tasks);
  return {
    ok: true,
    code: "blocked-summary",
    data: {
      blockedCount: suggestion.blockingAnalysis.length,
      blockedItems: suggestion.blockingAnalysis,
      scope: "tasks-only"
    } as Record<string, unknown>
  };
}

export async function handleExplainTaskEngineModel(
  args: Record<string, unknown>,
  ctx: ModuleLifecycleContext,
  planning: OpenedPlanningStores,
  store: TaskStore
): Promise<ModuleCommandResult> {
  const allStatuses: TaskStatus[] = ["proposed", "ready", "in_progress", "blocked", "completed", "cancelled"];
  const lifecycle = allStatuses.map((status) => ({
    status,
    allowedActions: getAllowedTransitionsFrom(status).map((entry) => ({
      action: entry.action,
      targetStatus: entry.to
    }))
  }));
  return {
    ok: true,
    code: "task-engine-model-explained",
    message: "Task Engine model variants, planning boundary, and lifecycle transitions.",
    data: {
      modelVersion: 1 as const,
      variants: [
        {
          variant: "execution-task",
          idPattern: "^T[0-9]+$",
          appearsInExecutionPlanning: true,
          requiredFields: ["id", "title", "type", "status", "createdAt", "updatedAt"],
          optionalFields: [
            "priority",
            "dependsOn",
            "unblocks",
            "phase",
            "metadata",
            "ownership",
            "approach",
            "technicalScope",
            "acceptanceCriteria"
          ]
        },
        {
          variant: "wishlist-item",
          idPattern: "^W[0-9]+$",
          appearsInExecutionPlanning: false,
          requiredFields: [
            "id",
            "title",
            "problemStatement",
            "expectedOutcome",
            "impact",
            "constraints",
            "successSignals",
            "requestor",
            "evidenceRef",
            "status",
            "createdAt",
            "updatedAt"
          ],
          optionalFields: ["metadata", "convertedTaskIds", "closedAt", "closeReason"],
          notes: "Wishlist is ideation-only and excluded from task ready queues."
        }
      ],
      planningBoundary: {
        executionQueues: "tasks-only",
        wishlistScope: "separate-namespace"
      },
      executionTaskLifecycle: lifecycle
    } as unknown as Record<string, unknown>
  };
}
