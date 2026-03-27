import type { WorkflowModule } from "../../contracts/module-contract.js";
import crypto from "node:crypto";
import type { TaskEntity, TaskMutationEvidence, TaskMutationType, TaskPriority, TaskStatus } from "./types.js";
import { maybeSpawnTranscriptHookAfterCompletion } from "../../core/transcript-completion-hook.js";
import { TaskStore } from "./store.js";
import { TransitionService } from "./service.js";
import { TaskEngineError, getAllowedTransitionsFrom } from "./transitions.js";
import { getNextActions } from "./suggestions.js";
import { readWorkspaceStatusSnapshot } from "./dashboard-status.js";
import { openPlanningStores } from "./planning-open.js";
import { runMigrateTaskPersistence } from "./migrate-task-persistence-runtime.js";
import type { WishlistConversionDecomposition, WishlistItem } from "./wishlist-types.js";
import {
  buildWishlistItemFromIntake,
  validateWishlistIntakePayload,
  validateWishlistUpdatePayload,
  WISHLIST_ID_RE
} from "./wishlist-validation.js";

export type {
  TaskEntity,
  TaskStatus,
  TaskPriority,
  TaskStoreDocument,
  TransitionEvidence,
  TransitionGuard,
  TransitionContext,
  GuardResult,
  TaskEngineError as TaskEngineErrorType,
  TaskEngineErrorCode,
  TaskAdapter,
  TaskAdapterCapability,
  NextActionSuggestion,
  BlockingAnalysisEntry,
  TaskMutationEvidence,
  TaskMutationType
} from "./types.js";

export { TaskStore } from "./store.js";
export { TransitionService } from "./service.js";
export {
  TaskEngineError,
  TransitionValidator,
  isTransitionAllowed,
  getTransitionAction,
  resolveTargetState,
  getAllowedTransitionsFrom,
  stateValidityGuard,
  dependencyCheckGuard
} from "./transitions.js";
export { getNextActions } from "./suggestions.js";
export { readWorkspaceStatusSnapshot } from "./dashboard-status.js";
export { WishlistStore } from "./wishlist-store.js";
export type { WishlistItem, WishlistStatus, WishlistStoreDocument } from "./wishlist-types.js";
export {
  validateWishlistIntakePayload,
  validateWishlistUpdatePayload,
  buildWishlistItemFromIntake,
  WISHLIST_ID_RE
} from "./wishlist-validation.js";
export { openPlanningStores } from "./planning-open.js";
export {
  getTaskPersistenceBackend,
  planningSqliteDatabaseRelativePath,
  planningTaskStoreRelativePath,
  planningWishlistStoreRelativePath
} from "./planning-config.js";

const TASK_ID_RE = /^T\d+$/;
const MUTABLE_TASK_FIELDS = new Set([
  "title",
  "type",
  "priority",
  "dependsOn",
  "unblocks",
  "phase",
  "metadata",
  "ownership",
  "approach",
  "technicalScope",
  "acceptanceCriteria"
]);

function nowIso(): string {
  return new Date().toISOString();
}

function parseConversionDecomposition(
  raw: unknown
): { ok: true; value: WishlistConversionDecomposition } | { ok: false; message: string } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, message: "convert-wishlist requires 'decomposition' object" };
  }
  const o = raw as Record<string, unknown>;
  const rationale = typeof o.rationale === "string" ? o.rationale.trim() : "";
  const boundaries = typeof o.boundaries === "string" ? o.boundaries.trim() : "";
  const dependencyIntent = typeof o.dependencyIntent === "string" ? o.dependencyIntent.trim() : "";
  if (!rationale || !boundaries || !dependencyIntent) {
    return {
      ok: false,
      message: "decomposition requires non-empty rationale, boundaries, and dependencyIntent"
    };
  }
  return { ok: true, value: { rationale, boundaries, dependencyIntent } };
}

function buildTaskFromConversionPayload(
  row: Record<string, unknown>,
  timestamp: string
): { ok: true; task: TaskEntity } | { ok: false; message: string } {
  const id = typeof row.id === "string" ? row.id.trim() : "";
  if (!TASK_ID_RE.test(id)) {
    return { ok: false, message: "Each converted task requires 'id' matching T<number>" };
  }
  const title = typeof row.title === "string" ? row.title.trim() : "";
  if (!title) {
    return { ok: false, message: `Task '${id}' requires non-empty title` };
  }
  const phase = typeof row.phase === "string" ? row.phase.trim() : "";
  if (!phase) {
    return { ok: false, message: `Task '${id}' requires 'phase' for workable tasks` };
  }
  const type = typeof row.type === "string" && row.type.trim() ? row.type.trim() : "workspace-kit";
  const priority =
    typeof row.priority === "string" && ["P1", "P2", "P3"].includes(row.priority)
      ? (row.priority as TaskPriority)
      : undefined;
  const approach = typeof row.approach === "string" ? row.approach.trim() : "";
  if (!approach) {
    return { ok: false, message: `Task '${id}' requires 'approach'` };
  }
  const technicalScope = Array.isArray(row.technicalScope)
    ? row.technicalScope.filter((x) => typeof x === "string")
    : [];
  const acceptanceCriteria = Array.isArray(row.acceptanceCriteria)
    ? row.acceptanceCriteria.filter((x) => typeof x === "string")
    : [];
  if (technicalScope.length === 0) {
    return { ok: false, message: `Task '${id}' requires non-empty technicalScope array` };
  }
  if (acceptanceCriteria.length === 0) {
    return { ok: false, message: `Task '${id}' requires non-empty acceptanceCriteria array` };
  }
  const task: TaskEntity = {
    id,
    title,
    type,
    status: "proposed",
    createdAt: timestamp,
    updatedAt: timestamp,
    priority,
    dependsOn: Array.isArray(row.dependsOn) ? row.dependsOn.filter((x) => typeof x === "string") : undefined,
    unblocks: Array.isArray(row.unblocks) ? row.unblocks.filter((x) => typeof x === "string") : undefined,
    phase,
    approach,
    technicalScope,
    acceptanceCriteria
  };
  return { ok: true, task };
}

function mutationEvidence(
  mutationType: TaskMutationType,
  taskId: string,
  actor?: string,
  details?: Record<string, unknown>
): TaskMutationEvidence {
  return {
    mutationId: `${mutationType}-${taskId}-${nowIso()}-${crypto.randomUUID().slice(0, 8)}`,
    mutationType,
    taskId,
    timestamp: nowIso(),
    actor,
    details
  };
}

export const taskEngineModule: WorkflowModule = {
  registration: {
    id: "task-engine",
    version: "0.6.0",
    contractVersion: "1",
    capabilities: ["task-engine"],
    dependsOn: [],
    enabledByDefault: true,
    config: {
      path: "src/modules/task-engine/config.md",
      format: "md",
      description: "Task Engine configuration contract."
    },
    state: {
      path: "src/modules/task-engine/state.md",
      format: "md",
      description: "Task Engine runtime state contract."
    },
    instructions: {
      directory: "src/modules/task-engine/instructions",
      entries: [
        {
          name: "run-transition",
          file: "run-transition.md",
          description: "Execute a validated task status transition."
        },
        {
          name: "create-task",
          file: "create-task.md",
          description: "Create a new task through validated task-engine persistence."
        },
        {
          name: "update-task",
          file: "update-task.md",
          description: "Update mutable task fields without lifecycle bypass."
        },
        {
          name: "update-wishlist",
          file: "update-wishlist.md",
          description: "Update mutable fields on an open Wishlist item."
        },
        {
          name: "archive-task",
          file: "archive-task.md",
          description: "Archive a task without destructive deletion."
        },
        {
          name: "add-dependency",
          file: "add-dependency.md",
          description: "Add a dependency edge between tasks with cycle checks."
        },
        {
          name: "remove-dependency",
          file: "remove-dependency.md",
          description: "Remove a dependency edge between tasks."
        },
        {
          name: "get-dependency-graph",
          file: "get-dependency-graph.md",
          description: "Get dependency graph data for one task or the full store."
        },
        {
          name: "get-task-history",
          file: "get-task-history.md",
          description: "Get transition and mutation history for a task."
        },
        {
          name: "get-recent-task-activity",
          file: "get-recent-task-activity.md",
          description: "List recent transition and mutation activity across tasks."
        },
        {
          name: "get-task-summary",
          file: "get-task-summary.md",
          description: "Get aggregate task-state summary for active tasks."
        },
        {
          name: "get-blocked-summary",
          file: "get-blocked-summary.md",
          description: "Get blocked-task dependency summary for active tasks."
        },
        {
          name: "create-task-from-plan",
          file: "create-task-from-plan.md",
          description: "Promote planning output into a canonical task."
        },
        {
          name: "convert-wishlist",
          file: "convert-wishlist.md",
          description: "Convert a Wishlist item into one or more phased tasks and close the wishlist item."
        },
        {
          name: "create-wishlist",
          file: "create-wishlist.md",
          description: "Create a Wishlist ideation item with strict required fields (separate namespace from tasks)."
        },
        {
          name: "get-wishlist",
          file: "get-wishlist.md",
          description: "Retrieve a single Wishlist item by ID."
        },
        {
          name: "get-task",
          file: "get-task.md",
          description: "Retrieve a single task by ID."
        },
        {
          name: "list-tasks",
          file: "list-tasks.md",
          description: "List tasks with optional status/phase filters."
        },
        {
          name: "list-wishlist",
          file: "list-wishlist.md",
          description: "List Wishlist items (ideation-only; not part of task execution queues)."
        },
        {
          name: "get-ready-queue",
          file: "get-ready-queue.md",
          description: "Get ready tasks sorted by priority."
        },
        {
          name: "get-next-actions",
          file: "get-next-actions.md",
          description: "Get prioritized next-action suggestions with blocking analysis."
        },
        {
          name: "migrate-task-persistence",
          file: "migrate-task-persistence.md",
          description: "Copy task + wishlist state between JSON files and a single SQLite database (offline migration)."
        },
        {
          name: "dashboard-summary",
          file: "dashboard-summary.md",
          description: "Stable JSON cockpit summary for UI clients (tasks + maintainer status snapshot)."
        }
      ]
    }
  },

  async onCommand(command, ctx) {
    const args = command.args ?? {};
    if (command.name === "migrate-task-persistence") {
      return runMigrateTaskPersistence(ctx, args as Record<string, unknown>);
    }

    let planning;
    try {
      planning = await openPlanningStores(ctx);
    } catch (err) {
      if (err instanceof TaskEngineError) {
        return { ok: false, code: err.code, message: err.message };
      }
      return {
        ok: false,
        code: "storage-read-error",
        message: `Failed to open task planning stores: ${(err as Error).message}`
      };
    }
    const store = planning.taskStore;

    if (command.name === "run-transition") {
      const taskId = typeof args.taskId === "string" ? args.taskId : undefined;
      const action = typeof args.action === "string" ? args.action : undefined;
      const actor =
        typeof args.actor === "string"
          ? args.actor
          : ctx.resolvedActor !== undefined
            ? ctx.resolvedActor
            : undefined;

      if (!taskId || !action) {
        return {
          ok: false,
          code: "invalid-task-schema",
          message: "run-transition requires 'taskId' and 'action' arguments"
        };
      }

      try {
        const service = new TransitionService(store);
        const result = await service.runTransition({ taskId, action, actor });
        if (result.evidence.toState === "completed") {
          maybeSpawnTranscriptHookAfterCompletion(
            ctx.workspacePath,
            (ctx.effectiveConfig ?? {}) as Record<string, unknown>
          );
        }
        return {
          ok: true,
          code: "transition-applied",
          message: `${taskId}: ${result.evidence.fromState} → ${result.evidence.toState} (${action})`,
          data: {
            evidence: result.evidence,
            autoUnblocked: result.autoUnblocked
          } as Record<string, unknown>
        };
      } catch (err) {
        if (err instanceof TaskEngineError) {
          return { ok: false, code: err.code, message: err.message };
        }
        return {
          ok: false,
          code: "invalid-transition",
          message: (err as Error).message
        };
      }
    }

    if (command.name === "create-task" || command.name === "create-task-from-plan") {
      const actor =
        typeof args.actor === "string"
          ? args.actor
          : ctx.resolvedActor !== undefined
            ? ctx.resolvedActor
            : undefined;
      const id = typeof args.id === "string" && args.id.trim().length > 0 ? args.id.trim() : undefined;
      const title = typeof args.title === "string" && args.title.trim().length > 0 ? args.title.trim() : undefined;
      const type = typeof args.type === "string" && args.type.trim().length > 0 ? args.type.trim() : "workspace-kit";
      const status = typeof args.status === "string" ? args.status : "proposed";
      const priority =
        typeof args.priority === "string" && ["P1", "P2", "P3"].includes(args.priority)
          ? args.priority as TaskPriority
          : undefined;
      if (!id || !title || !TASK_ID_RE.test(id) || !["proposed", "ready"].includes(status)) {
        return {
          ok: false,
          code: "invalid-task-schema",
          message:
            "create-task requires id/title, id format T<number>, and status of proposed or ready"
        };
      }
      if (store.getTask(id)) {
        return { ok: false, code: "duplicate-task-id", message: `Task '${id}' already exists` };
      }

      const timestamp = nowIso();
      const task: TaskEntity = {
        id,
        title,
        type,
        status: status as TaskStatus,
        createdAt: timestamp,
        updatedAt: timestamp,
        priority,
        dependsOn: Array.isArray(args.dependsOn) ? args.dependsOn.filter((x) => typeof x === "string") : undefined,
        unblocks: Array.isArray(args.unblocks) ? args.unblocks.filter((x) => typeof x === "string") : undefined,
        phase: typeof args.phase === "string" ? args.phase : undefined,
        metadata: typeof args.metadata === "object" && args.metadata !== null ? args.metadata as Record<string, unknown> : undefined,
        ownership: typeof args.ownership === "string" ? args.ownership : undefined,
        approach: typeof args.approach === "string" ? args.approach : undefined,
        technicalScope: Array.isArray(args.technicalScope) ? args.technicalScope.filter((x) => typeof x === "string") : undefined,
        acceptanceCriteria: Array.isArray(args.acceptanceCriteria) ? args.acceptanceCriteria.filter((x) => typeof x === "string") : undefined
      };
      store.addTask(task);
      if (command.name === "create-task-from-plan") {
        const planRef = typeof args.planRef === "string" && args.planRef.trim().length > 0 ? args.planRef.trim() : undefined;
        if (!planRef) {
          return {
            ok: false,
            code: "invalid-task-schema",
            message: "create-task-from-plan requires 'planRef'"
          };
        }
        task.metadata = { ...(task.metadata ?? {}), planRef };
        store.updateTask(task);
      }
      const evidenceType = command.name === "create-task-from-plan" ? "create-task-from-plan" : "create-task";
      store.addMutationEvidence(mutationEvidence(evidenceType, id, actor, {
        initialStatus: task.status,
        source: command.name
      }));
      await store.save();
      return {
        ok: true,
        code: "task-created",
        message: `Created task '${id}'`,
        data: { task } as Record<string, unknown>
      };
    }

    if (command.name === "update-task") {
      const taskId = typeof args.taskId === "string" ? args.taskId : undefined;
      const updates = typeof args.updates === "object" && args.updates !== null ? args.updates as Record<string, unknown> : undefined;
      const actor =
        typeof args.actor === "string"
          ? args.actor
          : ctx.resolvedActor !== undefined
            ? ctx.resolvedActor
            : undefined;
      if (!taskId || !updates) {
        return { ok: false, code: "invalid-task-schema", message: "update-task requires taskId and updates object" };
      }
      const task = store.getTask(taskId);
      if (!task) {
        return { ok: false, code: "task-not-found", message: `Task '${taskId}' not found` };
      }
      const invalidKeys = Object.keys(updates).filter((key) => !MUTABLE_TASK_FIELDS.has(key));
      if (invalidKeys.length > 0) {
        return {
          ok: false,
          code: "invalid-task-update",
          message: `update-task cannot mutate immutable fields: ${invalidKeys.join(", ")}`
        };
      }
      const updatedTask = { ...task, ...updates, updatedAt: nowIso() };
      store.updateTask(updatedTask);
      store.addMutationEvidence(mutationEvidence("update-task", taskId, actor, { updatedFields: Object.keys(updates) }));
      await store.save();
      return { ok: true, code: "task-updated", message: `Updated task '${taskId}'`, data: { task: updatedTask } as Record<string, unknown> };
    }

    if (command.name === "archive-task") {
      const taskId = typeof args.taskId === "string" ? args.taskId : undefined;
      const actor =
        typeof args.actor === "string"
          ? args.actor
          : ctx.resolvedActor !== undefined
            ? ctx.resolvedActor
            : undefined;
      if (!taskId) {
        return { ok: false, code: "invalid-task-schema", message: "archive-task requires taskId" };
      }
      const task = store.getTask(taskId);
      if (!task) {
        return { ok: false, code: "task-not-found", message: `Task '${taskId}' not found` };
      }
      const archivedAt = nowIso();
      const updatedTask = { ...task, archived: true, archivedAt, updatedAt: archivedAt };
      store.updateTask(updatedTask);
      store.addMutationEvidence(mutationEvidence("archive-task", taskId, actor));
      await store.save();
      return { ok: true, code: "task-archived", message: `Archived task '${taskId}'`, data: { task: updatedTask } as Record<string, unknown> };
    }

    if (command.name === "get-task") {
      const taskId = typeof args.taskId === "string" ? args.taskId : undefined;
      if (!taskId) {
        return {
          ok: false,
          code: "invalid-task-schema",
          message: "get-task requires 'taskId' argument"
        };
      }

      const task = store.getTask(taskId);
      if (!task) {
        return {
          ok: false,
          code: "task-not-found",
          message: `Task '${taskId}' not found`
        };
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

    if (command.name === "add-dependency" || command.name === "remove-dependency") {
      const taskId = typeof args.taskId === "string" ? args.taskId : undefined;
      const dependencyTaskId = typeof args.dependencyTaskId === "string" ? args.dependencyTaskId : undefined;
      const actor =
        typeof args.actor === "string"
          ? args.actor
          : ctx.resolvedActor !== undefined
            ? ctx.resolvedActor
            : undefined;
      if (!taskId || !dependencyTaskId) {
        return {
          ok: false,
          code: "invalid-task-schema",
          message: `${command.name} requires taskId and dependencyTaskId`
        };
      }
      if (taskId === dependencyTaskId) {
        return { ok: false, code: "dependency-cycle", message: "Task cannot depend on itself" };
      }
      const task = store.getTask(taskId);
      const dep = store.getTask(dependencyTaskId);
      if (!task || !dep) {
        return { ok: false, code: "task-not-found", message: "taskId or dependencyTaskId not found" };
      }
      const deps = new Set(task.dependsOn ?? []);
      if (command.name === "add-dependency") {
        if (deps.has(dependencyTaskId)) {
          return { ok: false, code: "duplicate-dependency", message: "Dependency already exists" };
        }
        deps.add(dependencyTaskId);
      } else {
        deps.delete(dependencyTaskId);
      }
      const updatedTask = { ...task, dependsOn: [...deps], updatedAt: nowIso() };
      store.updateTask(updatedTask);
      const mutationType = command.name === "add-dependency" ? "add-dependency" : "remove-dependency";
      store.addMutationEvidence(mutationEvidence(mutationType, taskId, actor, { dependencyTaskId }));
      await store.save();
      return {
        ok: true,
        code: command.name === "add-dependency" ? "dependency-added" : "dependency-removed",
        message: `${command.name} applied for '${taskId}'`,
        data: { task: updatedTask } as Record<string, unknown>
      };
    }

    if (command.name === "get-dependency-graph") {
      const taskId = typeof args.taskId === "string" ? args.taskId : undefined;
      const tasks = store.getActiveTasks();
      const nodes = tasks.map((task) => ({ id: task.id, status: task.status }));
      const edges = tasks.flatMap((task) => (task.dependsOn ?? []).map((depId) => ({ from: task.id, to: depId })));
      if (!taskId) {
        return { ok: true, code: "dependency-graph", data: { nodes, edges } as Record<string, unknown> };
      }
      const task = tasks.find((candidate) => candidate.id === taskId);
      if (!task) {
        return { ok: false, code: "task-not-found", message: `Task '${taskId}' not found` };
      }
      return {
        ok: true,
        code: "dependency-graph",
        data: {
          taskId,
          dependsOn: task.dependsOn ?? [],
          directDependents: tasks.filter((candidate) => (candidate.dependsOn ?? []).includes(taskId)).map((x) => x.id),
          nodes,
          edges
        } as Record<string, unknown>
      };
    }

    if (command.name === "get-task-history" || command.name === "get-recent-task-activity") {
      const limitRaw = args.limit;
      const limit =
        typeof limitRaw === "number" && Number.isFinite(limitRaw) && limitRaw > 0
          ? Math.min(Math.floor(limitRaw), 500)
          : 50;
      const taskId = typeof args.taskId === "string" ? args.taskId : undefined;
      const transitions = store.getTransitionLog().map((entry) => ({ kind: "transition", ...entry }));
      const mutations = store.getMutationLog().map((entry) => ({ kind: "mutation", ...entry }));
      const merged = [...transitions, ...mutations]
        .filter((entry) => (taskId ? entry.taskId === taskId : true))
        .sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1))
        .slice(0, limit);
      return {
        ok: true,
        code: command.name === "get-task-history" ? "task-history" : "recent-task-activity",
        data: { taskId: taskId ?? null, items: merged, count: merged.length } as Record<string, unknown>
      };
    }

    if (command.name === "dashboard-summary") {
      const tasks = store.getActiveTasks();
      const suggestion = getNextActions(tasks);
      const workspaceStatus = await readWorkspaceStatusSnapshot(ctx.workspacePath);
      const readyTop = suggestion.readyQueue.slice(0, 15).map((t) => ({
        id: t.id,
        title: t.title,
        priority: t.priority ?? null,
        phase: t.phase ?? null
      }));
      const blockedTop = suggestion.blockingAnalysis.slice(0, 15);

      let wishlistItems: WishlistItem[] = [];
      try {
        const wishlistStore = await planning.openWishlist();
        wishlistItems = wishlistStore.getAllItems();
      } catch {
        /* wishlist store optional */
      }
      const wishlistOpenCount = wishlistItems.filter((i) => i.status === "open").length;

      const data = {
        schemaVersion: 1 as const,
        taskStoreLastUpdated: store.getLastUpdated(),
        workspaceStatus,
        stateSummary: suggestion.stateSummary,
        readyQueueTop: readyTop,
        readyQueueCount: suggestion.readyQueue.length,
        executionPlanningScope: "tasks-only" as const,
        wishlist: {
          schemaVersion: 1 as const,
          openCount: wishlistOpenCount,
          totalCount: wishlistItems.length
        },
        blockedSummary: {
          count: suggestion.blockingAnalysis.length,
          top: blockedTop
        },
        suggestedNext: suggestion.suggestedNext
          ? {
              id: suggestion.suggestedNext.id,
              title: suggestion.suggestedNext.title,
              status: suggestion.suggestedNext.status,
              priority: suggestion.suggestedNext.priority ?? null,
              phase: suggestion.suggestedNext.phase ?? null
            }
          : null,
        blockingAnalysis: suggestion.blockingAnalysis
      } satisfies Record<string, unknown>;

      return {
        ok: true,
        code: "dashboard-summary",
        message: "Dashboard summary built from task store and maintainer status snapshot",
        data
      };
    }

    if (command.name === "list-tasks") {
      const statusFilter = typeof args.status === "string" ? args.status as TaskStatus : undefined;
      const phaseFilter = typeof args.phase === "string" ? args.phase : undefined;
      const includeArchived = args.includeArchived === true;

      let tasks = includeArchived ? store.getAllTasks() : store.getActiveTasks();
      if (statusFilter) {
        tasks = tasks.filter((t) => t.status === statusFilter);
      }
      if (phaseFilter) {
        tasks = tasks.filter((t) => t.phase === phaseFilter);
      }

      return {
        ok: true,
        code: "tasks-listed",
        message: `Found ${tasks.length} tasks`,
        data: { tasks, count: tasks.length, scope: "tasks-only" } as Record<string, unknown>
      };
    }

    if (command.name === "get-ready-queue") {
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

    if (command.name === "get-next-actions") {
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

    if (command.name === "get-task-summary") {
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

    if (command.name === "get-blocked-summary") {
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

    if (command.name === "create-wishlist") {
      const wishlistStore = await planning.openWishlist();
      const raw = args as Record<string, unknown>;
      const v = validateWishlistIntakePayload(raw);
      if (!v.ok) {
        return { ok: false, code: "invalid-task-schema", message: v.errors.join(" ") };
      }
      const ts = nowIso();
      const item: WishlistItem = buildWishlistItemFromIntake(raw, ts);
      try {
        wishlistStore.addItem(item);
      } catch (err) {
        if (err instanceof TaskEngineError) {
          return { ok: false, code: err.code, message: err.message };
        }
        throw err;
      }
      await wishlistStore.save();
      return {
        ok: true,
        code: "wishlist-created",
        message: `Created wishlist '${item.id}'`,
        data: { item } as Record<string, unknown>
      };
    }

    if (command.name === "list-wishlist") {
      const wishlistStore = await planning.openWishlist();
      const statusFilter = typeof args.status === "string" ? args.status : undefined;
      let items = wishlistStore.getAllItems();
      if (statusFilter && ["open", "converted", "cancelled"].includes(statusFilter)) {
        items = items.filter((i) => i.status === statusFilter);
      }
      return {
        ok: true,
        code: "wishlist-listed",
        message: `Found ${items.length} wishlist items`,
        data: { items, count: items.length, scope: "wishlist-only" } as Record<string, unknown>
      };
    }

    if (command.name === "get-wishlist") {
      const wishlistId =
        typeof args.wishlistId === "string" && args.wishlistId.trim().length > 0
          ? args.wishlistId.trim()
          : typeof args.id === "string" && args.id.trim().length > 0
            ? args.id.trim()
            : "";
      if (!wishlistId) {
        return { ok: false, code: "invalid-task-schema", message: "get-wishlist requires 'wishlistId' or 'id'" };
      }
      const wishlistStore = await planning.openWishlist();
      const item = wishlistStore.getItem(wishlistId);
      if (!item) {
        return { ok: false, code: "task-not-found", message: `Wishlist item '${wishlistId}' not found` };
      }
      return {
        ok: true,
        code: "wishlist-retrieved",
        data: { item } as Record<string, unknown>
      };
    }

    if (command.name === "update-wishlist") {
      const wishlistId = typeof args.wishlistId === "string" ? args.wishlistId.trim() : "";
      const updates = typeof args.updates === "object" && args.updates !== null ? (args.updates as Record<string, unknown>) : undefined;
      if (!wishlistId || !updates) {
        return { ok: false, code: "invalid-task-schema", message: "update-wishlist requires wishlistId and updates" };
      }
      const wishlistStore = await planning.openWishlist();
      const existing = wishlistStore.getItem(wishlistId);
      if (!existing) {
        return { ok: false, code: "task-not-found", message: `Wishlist item '${wishlistId}' not found` };
      }
      if (existing.status !== "open") {
        return { ok: false, code: "invalid-transition", message: "Only open wishlist items can be updated" };
      }
      const uv = validateWishlistUpdatePayload(updates);
      if (!uv.ok) {
        return { ok: false, code: "invalid-task-schema", message: uv.errors.join(" ") };
      }
      const merged: WishlistItem = { ...existing, updatedAt: nowIso() };
      const mutable: (keyof WishlistItem)[] = [
        "title",
        "problemStatement",
        "expectedOutcome",
        "impact",
        "constraints",
        "successSignals",
        "requestor",
        "evidenceRef"
      ];
      for (const key of mutable) {
        if (key in updates && typeof updates[key as string] === "string") {
          (merged as Record<string, unknown>)[key] = (updates[key as string] as string).trim();
        }
      }
      wishlistStore.updateItem(merged);
      await wishlistStore.save();
      return {
        ok: true,
        code: "wishlist-updated",
        message: `Updated wishlist '${wishlistId}'`,
        data: { item: merged } as Record<string, unknown>
      };
    }

    if (command.name === "convert-wishlist") {
      const wishlistId = typeof args.wishlistId === "string" ? args.wishlistId.trim() : "";
      if (!wishlistId || !WISHLIST_ID_RE.test(wishlistId)) {
        return {
          ok: false,
          code: "invalid-task-schema",
          message: "convert-wishlist requires wishlistId matching W<number>"
        };
      }
      const dec = parseConversionDecomposition(args.decomposition);
      if (!dec.ok) {
        return { ok: false, code: "invalid-task-schema", message: dec.message };
      }
      const tasksRaw = args.tasks;
      if (!Array.isArray(tasksRaw) || tasksRaw.length === 0) {
        return {
          ok: false,
          code: "invalid-task-schema",
          message: "convert-wishlist requires non-empty tasks array"
        };
      }
      const wishlistStore = await planning.openWishlist();
      const wlItem = wishlistStore.getItem(wishlistId);
      if (!wlItem) {
        return { ok: false, code: "task-not-found", message: `Wishlist item '${wishlistId}' not found` };
      }
      if (wlItem.status !== "open") {
        return {
          ok: false,
          code: "invalid-transition",
          message: "Only open wishlist items can be converted"
        };
      }
      const actor =
        typeof args.actor === "string"
          ? args.actor
          : ctx.resolvedActor !== undefined
            ? ctx.resolvedActor
            : undefined;
      const timestamp = nowIso();
      const built: TaskEntity[] = [];
      for (const row of tasksRaw) {
        if (!row || typeof row !== "object" || Array.isArray(row)) {
          return { ok: false, code: "invalid-task-schema", message: "Each task must be an object" };
        }
        const bt = buildTaskFromConversionPayload(row as Record<string, unknown>, timestamp);
        if (!bt.ok) {
          return { ok: false, code: "invalid-task-schema", message: bt.message };
        }
        if (store.getTask(bt.task.id)) {
          return {
            ok: false,
            code: "duplicate-task-id",
            message: `Task '${bt.task.id}' already exists`
          };
        }
        built.push(bt.task);
      }
      const convertedIds = built.map((t) => t.id);
      const updatedWishlist: WishlistItem = {
        ...wlItem,
        status: "converted",
        updatedAt: timestamp,
        convertedAt: timestamp,
        convertedToTaskIds: convertedIds,
        conversionDecomposition: dec.value
      };
      const applyConvertMutations = (): void => {
        for (const t of built) {
          store.addTask(t);
          store.addMutationEvidence(
            mutationEvidence("create-task", t.id, actor, {
              initialStatus: t.status,
              source: "convert-wishlist",
              wishlistId
            })
          );
        }
        wishlistStore.updateItem(updatedWishlist);
      };
      if (planning.kind === "sqlite") {
        planning.sqliteDual.withTransaction(applyConvertMutations);
      } else {
        applyConvertMutations();
        await store.save();
        await wishlistStore.save();
      }
      return {
        ok: true,
        code: "wishlist-converted",
        message: `Converted wishlist '${wishlistId}' to tasks: ${convertedIds.join(", ")}`,
        data: { wishlist: updatedWishlist, createdTasks: built } as Record<string, unknown>
      };
    }

    return {
      ok: false,
      code: "unsupported-command",
      message: `Task Engine does not support command '${command.name}'`
    };
  }
};
