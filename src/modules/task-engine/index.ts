import path from "node:path";
import fs from "node:fs/promises";
import type { WorkflowModule } from "../../contracts/module-contract.js";
import type { TaskStatus } from "./types.js";
import { TaskStore } from "./store.js";
import { TransitionService } from "./service.js";
import { TaskEngineError } from "./transitions.js";
import { generateTasksMd } from "./generator.js";
import { importTasksFromMarkdown } from "./importer.js";
import { getNextActions } from "./suggestions.js";

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
export { generateTasksMd } from "./generator.js";
export { importTasksFromMarkdown } from "./importer.js";
export { getNextActions } from "./suggestions.js";

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
    version: "0.4.0",
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
          name: "import-tasks",
          file: "import-tasks.md",
          description: "One-time import from TASKS.md into engine state."
        },
        {
          name: "generate-tasks-md",
          file: "generate-tasks-md.md",
          description: "Generate read-only TASKS.md from engine state."
        },
        {
          name: "get-next-actions",
          file: "get-next-actions.md",
          description: "Get prioritized next-action suggestions with blocking analysis."
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

      return {
        ok: true,
        code: "task-retrieved",
        data: { task } as Record<string, unknown>
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

    if (command.name === "import-tasks") {
      const sourcePath = typeof args.sourcePath === "string"
        ? path.resolve(ctx.workspacePath, args.sourcePath)
        : path.resolve(ctx.workspacePath, "docs/maintainers/TASKS.md");

      try {
        const result = await importTasksFromMarkdown(sourcePath);
        store.replaceAllTasks(result.tasks);
        await store.save();

        return {
          ok: true,
          code: "tasks-imported",
          message: `Imported ${result.imported} tasks (${result.skipped} skipped)`,
          data: {
            imported: result.imported,
            skipped: result.skipped,
            errors: result.errors
          } as Record<string, unknown>
        };
      } catch (err) {
        if (err instanceof TaskEngineError) {
          return { ok: false, code: err.code, message: err.message };
        }
        return {
          ok: false,
          code: "import-parse-error",
          message: (err as Error).message
        };
      }
    }

    if (command.name === "generate-tasks-md") {
      const outputPath = typeof args.outputPath === "string"
        ? path.resolve(ctx.workspacePath, args.outputPath)
        : path.resolve(ctx.workspacePath, "docs/maintainers/TASKS.md");

      const tasks = store.getAllTasks();
      const markdown = generateTasksMd(tasks);

      try {
        await fs.mkdir(path.dirname(outputPath), { recursive: true });
        await fs.writeFile(outputPath, markdown, "utf8");
      } catch (err) {
        return {
          ok: false,
          code: "storage-write-error",
          message: `Failed to write TASKS.md: ${(err as Error).message}`
        };
      }

      return {
        ok: true,
        code: "tasks-md-generated",
        message: `Generated TASKS.md with ${tasks.length} tasks`,
        data: { outputPath, taskCount: tasks.length } as Record<string, unknown>
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
