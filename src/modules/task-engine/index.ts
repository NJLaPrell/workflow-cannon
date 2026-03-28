import type { WorkflowModule, ModuleCommandResult } from "../../contracts/module-contract.js";
import { TaskEngineError } from "./transitions.js";
import { openPlanningStores } from "./planning-open.js";
import { runMigrateTaskPersistence } from "./migrate-task-persistence-runtime.js";
import type { CommandHandler } from "./commands/shared.js";
import { handleRunTransition } from "./commands/run-transition.js";
import { handleCreateTask, handleUpdateTask, handleArchiveTask } from "./commands/task-mutations.js";
import {
  handleGetTask,
  handleListTasks,
  handleGetReadyQueue,
  handleGetNextActions,
  handleGetTaskSummary,
  handleGetBlockedSummary,
  handleExplainTaskEngineModel
} from "./commands/task-queries.js";
import { handleDependencyMutation, handleGetDependencyGraph } from "./commands/task-dependencies.js";
import { handleTaskHistory } from "./commands/task-history.js";
import { handleDashboardSummary } from "./commands/dashboard.js";
import {
  handleCreateWishlist,
  handleListWishlist,
  handleGetWishlist,
  handleUpdateWishlist,
  handleConvertWishlist
} from "./commands/wishlist.js";
import { handleModuleState } from "./commands/module-state.js";

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

const COMMAND_HANDLERS: Record<string, CommandHandler> = {
  "run-transition": handleRunTransition,
  "create-task": (args, ctx, planning, store) => handleCreateTask(args, ctx, planning, store, "create-task"),
  "create-task-from-plan": (args, ctx, planning, store) => handleCreateTask(args, ctx, planning, store, "create-task-from-plan"),
  "update-task": handleUpdateTask,
  "archive-task": handleArchiveTask,
  "get-task": handleGetTask,
  "list-tasks": handleListTasks,
  "get-ready-queue": handleGetReadyQueue,
  "get-next-actions": handleGetNextActions,
  "get-task-summary": handleGetTaskSummary,
  "get-blocked-summary": handleGetBlockedSummary,
  "explain-task-engine-model": handleExplainTaskEngineModel,
  "add-dependency": (args, ctx, planning, store) => handleDependencyMutation(args, ctx, planning, store, "add-dependency"),
  "remove-dependency": (args, ctx, planning, store) => handleDependencyMutation(args, ctx, planning, store, "remove-dependency"),
  "get-dependency-graph": handleGetDependencyGraph,
  "get-task-history": (args, ctx, planning, store) => handleTaskHistory(args, ctx, planning, store, "get-task-history"),
  "get-recent-task-activity": (args, ctx, planning, store) => handleTaskHistory(args, ctx, planning, store, "get-recent-task-activity"),
  "dashboard-summary": handleDashboardSummary,
  "create-wishlist": handleCreateWishlist,
  "list-wishlist": handleListWishlist,
  "get-wishlist": handleGetWishlist,
  "update-wishlist": handleUpdateWishlist,
  "convert-wishlist": handleConvertWishlist
};

export const taskEngineModule: WorkflowModule = {
  registration: {
    id: "task-engine",
    version: "0.6.0",
    contractVersion: "1",
    stateSchema: 1,
    capabilities: ["task-engine"],
    dependsOn: [],
    enabledByDefault: true,
    config: {
      path: "src/modules/task-engine/config.md",
      format: "md",
      description: "Task Engine configuration contract."
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
          name: "list-module-states",
          file: "list-module-states.md",
          description: "List unified SQLite module-state rows for diagnostics and migration verification."
        },
        {
          name: "get-module-state",
          file: "get-module-state.md",
          description: "Read one module-state row from unified SQLite storage."
        },
        {
          name: "dashboard-summary",
          file: "dashboard-summary.md",
          description: "Stable JSON cockpit summary for UI clients (tasks + maintainer status snapshot)."
        },
        {
          name: "explain-task-engine-model",
          file: "explain-task-engine-model.md",
          description: "Explain model variants, planning boundaries, lifecycle transitions, and required fields."
        }
      ]
    }
  },

  async onCommand(command, ctx): Promise<ModuleCommandResult> {
    const args = (command.args ?? {}) as Record<string, unknown>;

    if (command.name === "migrate-task-persistence") {
      return runMigrateTaskPersistence(ctx, args);
    }

    if (command.name === "list-module-states" || command.name === "get-module-state") {
      return handleModuleState(args, ctx, command.name);
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

    const handler = COMMAND_HANDLERS[command.name];
    if (!handler) {
      return {
        ok: false,
        code: "unsupported-command",
        message: `Task Engine does not support command '${command.name}'`
      };
    }

    return handler(args, ctx, planning, planning.taskStore);
  }
};
