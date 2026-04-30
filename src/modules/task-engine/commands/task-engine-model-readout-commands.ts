import type { ModuleCommandResult } from "../../../contracts/module-contract.js";
import { TaskStore } from "../persistence/store.js";
import { getNextActions } from "../suggestions.js";
import { getAllowedTransitionsFrom } from "../transitions.js";
import type { TaskStatus } from "../types.js";
import { WISHLIST_INTAKE_TASK_TYPE } from "../wishlist/wishlist-intake.js";

/**
 * Static model explanation + lightweight queue summaries.
 * Returns **`null`** when the command name is not handled here.
 */
export function resolveTaskEngineModelReadoutCommands(
  command: { name: string; args?: Record<string, unknown> },
  store: TaskStore
): ModuleCommandResult | null {
  if (command.name === "explain-task-engine-model") {
    const allStatuses: TaskStatus[] = [
      "research",
      "proposed",
      "ready",
      "in_progress",
      "blocked",
      "completed",
      "cancelled"
    ];
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
              "phaseKey",
              "metadata",
              "metadata.queueNamespace",
              "metadata.implementationEstimatePack",
              "metadata.maintainerDeliveryProfile",
              "metadata.requiresPhaseBranch",
              "ownership",
              "approach",
              "summary",
              "description",
              "risk",
              "technicalScope",
              "acceptanceCriteria",
              "features",
              "metadata.skillIds"
            ]
          },
          {
            variant: "wishlist-intake-task",
            idPattern: "^T[0-9]+$",
            taskType: WISHLIST_INTAKE_TASK_TYPE,
            appearsInExecutionPlanning: false,
            requiredFields: [
              "id",
              "title",
              "type",
              "status",
              "createdAt",
              "updatedAt",
              "metadata.problemStatement",
              "metadata.expectedOutcome",
              "metadata.impact",
              "metadata.constraints",
              "metadata.successSignals",
              "metadata.requestor",
              "metadata.evidenceRef"
            ],
            optionalFields: [
              "metadata.legacyWishlistId",
              "metadata",
              "priority",
              "dependsOn",
              "unblocks"
            ],
            notes:
              "Ideation backlog uses type wishlist_intake (T ids); optional metadata.legacyWishlistId preserves W### provenance after migration. Excluded from ready-queue suggestions."
          }
        ],
        planningBoundary: {
          executionQueues: "tasks-only",
          wishlistScope: "task-backed-wishlist-intake"
        },
        executionTaskLifecycle: lifecycle
      } as unknown as Record<string, unknown>
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

  return null;
}
