import type { WorkflowModule } from "../../contracts/module-contract.js";
import type { TaskStatus } from "./types.js";
import { maybeSpawnTranscriptHookAfterCompletion } from "../../core/transcript-completion-hook.js";
import { TaskStore } from "./store.js";
import { TransitionService } from "./service.js";
import { TaskEngineError, getAllowedTransitionsFrom } from "./transitions.js";
import { getNextActions } from "./suggestions.js";
import { readWorkspaceStatusSnapshot } from "./dashboard-status.js";

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
  BlockingAnalysisEntry
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

function taskStorePath(ctx: { workspacePath: string; effectiveConfig?: Record<string, unknown> }): string | undefined {
  const tasks = ctx.effectiveConfig?.tasks;
  if (!tasks || typeof tasks !== "object" || Array.isArray(tasks)) {
    return undefined;
  }
  const p = (tasks as Record<string, unknown>).storeRelativePath;
  return typeof p === "string" && p.trim().length > 0 ? p.trim() : undefined;
}

export const taskEngineModule: WorkflowModule = {
  registration: {
    id: "task-engine",
    version: "0.5.0",
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
          name: "dashboard-summary",
          file: "dashboard-summary.md",
          description: "Stable JSON cockpit summary for UI clients (tasks + maintainer status snapshot)."
        }
      ]
    }
  },

  async onCommand(command, ctx) {
    const args = command.args ?? {};
    const store = new TaskStore(ctx.workspacePath, taskStorePath(ctx));

    try {
      await store.load();
    } catch (err) {
      if (err instanceof TaskEngineError) {
        return { ok: false, code: err.code, message: err.message };
      }
      return {
        ok: false,
        code: "storage-read-error",
        message: `Failed to load task store: ${(err as Error).message}`
      };
    }

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

    if (command.name === "dashboard-summary") {
      const tasks = store.getAllTasks();
      const suggestion = getNextActions(tasks);
      const workspaceStatus = await readWorkspaceStatusSnapshot(ctx.workspacePath);
      const readyTop = suggestion.readyQueue.slice(0, 15).map((t) => ({
        id: t.id,
        title: t.title,
        priority: t.priority ?? null,
        phase: t.phase ?? null
      }));
      const blockedTop = suggestion.blockingAnalysis.slice(0, 15);

      const data = {
        schemaVersion: 1 as const,
        taskStoreLastUpdated: store.getLastUpdated(),
        workspaceStatus,
        stateSummary: suggestion.stateSummary,
        readyQueueTop: readyTop,
        readyQueueCount: suggestion.readyQueue.length,
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

      let tasks = store.getAllTasks();
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
        data: { tasks, count: tasks.length } as Record<string, unknown>
      };
    }

    if (command.name === "get-ready-queue") {
      const tasks = store.getAllTasks();
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
        data: { tasks: ready, count: ready.length } as Record<string, unknown>
      };
    }

    if (command.name === "get-next-actions") {
      const tasks = store.getAllTasks();
      const suggestion = getNextActions(tasks);

      return {
        ok: true,
        code: "next-actions-retrieved",
        message: suggestion.suggestedNext
          ? `Suggested next: ${suggestion.suggestedNext.id} — ${suggestion.suggestedNext.title}`
          : "No tasks in ready queue",
        data: suggestion as unknown as Record<string, unknown>
      };
    }

    return {
      ok: false,
      code: "unsupported-command",
      message: `Task Engine does not support command '${command.name}'`
    };
  }
};
