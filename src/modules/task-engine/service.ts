import crypto from "node:crypto";
import type { KitLifecycleHookBus } from "../../core/kit-lifecycle-hooks.js";
import type {
  TaskEntity,
  TaskStatus,
  TransitionEvidence,
  TransitionGuard
} from "./types.js";
import { TaskEngineError, TransitionValidator, getTransitionAction, resolveTargetState } from "./transitions.js";
import { TaskStore } from "./persistence/store.js";

export type TransitionRequest = {
  taskId: string;
  action: string;
  actor?: string;
  /** When set, SQLite planning row must match this generation or persist fails (`planning-generation-mismatch`). */
  expectedPlanningGeneration?: number;
};

export type TransitionResult = {
  evidence: TransitionEvidence;
  autoUnblocked: TransitionEvidence[];
};

export class TransitionService {
  private readonly store: TaskStore;
  private readonly validator: TransitionValidator;
  private readonly hookBus?: KitLifecycleHookBus;

  constructor(store: TaskStore, customGuards: TransitionGuard[] = [], hookBus?: KitLifecycleHookBus) {
    this.store = store;
    this.validator = new TransitionValidator(customGuards);
    this.hookBus = hookBus;
  }

  async runTransition(request: TransitionRequest): Promise<TransitionResult> {
    const task = this.store.getTask(request.taskId);
    if (!task) {
      throw new TaskEngineError("task-not-found", `Task '${request.taskId}' not found`);
    }

    let effectiveAction = request.action;
    if (this.hookBus?.isEnabled()) {
      const hookPre = await this.hookBus.emitBeforeTaskTransition({
        taskId: request.taskId,
        action: effectiveAction,
        fromState: task.status,
        actor: request.actor ?? null
      });
      if (hookPre.denied) {
        throw new TaskEngineError("hook-denied", hookPre.denied.reason);
      }
      if (hookPre.actionOverride) {
        effectiveAction = hookPre.actionOverride;
      }
    }

    const targetState = resolveTargetState(task.status, effectiveAction);
    if (!targetState) {
      throw new TaskEngineError(
        "invalid-transition",
        `Action '${effectiveAction}' is not valid from state '${task.status}'`
      );
    }

    const timestamp = new Date().toISOString();
    const context = {
      allTasks: this.store.getAllTasks(),
      timestamp,
      actor: request.actor
    };

    const validation = this.validator.validate(task, targetState, context);
    if (!validation.allowed) {
      const rejection = validation.guardResults.find((r) => !r.allowed);
      if (rejection?.code === "dependency-unsatisfied") {
        throw new TaskEngineError("dependency-unsatisfied", rejection.message ?? "Dependencies not satisfied");
      }
      if (rejection?.code === "invalid-transition") {
        throw new TaskEngineError("invalid-transition", rejection.message ?? "Invalid transition");
      }
      throw new TaskEngineError(
        "guard-rejected",
        rejection?.message ?? "Transition rejected by guard"
      );
    }

    const fromState = task.status;
    const updatedTask: TaskEntity = {
      ...task,
      status: targetState,
      updatedAt: timestamp
    };
    this.store.updateTask(updatedTask);

    const action = getTransitionAction(fromState, targetState) ?? effectiveAction;
    const autoUnblockResults = targetState === "completed"
      ? this.autoUnblock(request.taskId, timestamp, request.actor)
      : [];

    const evidence: TransitionEvidence = {
      transitionId: `${request.taskId}-${timestamp}-${crypto.randomUUID().slice(0, 8)}`,
      taskId: request.taskId,
      fromState,
      toState: targetState,
      action,
      guardResults: validation.guardResults,
      dependentsUnblocked: autoUnblockResults.map((r) => r.taskId),
      timestamp,
      actor: request.actor
    };
    this.store.addEvidence(evidence);

    for (const unblockEvidence of autoUnblockResults) {
      this.store.addEvidence(unblockEvidence);
    }

    if (this.hookBus?.isEnabled()) {
      const persistGate = await this.hookBus.emitBeforeTaskStorePersist({
        taskId: request.taskId,
        fromState,
        toState: targetState
      });
      if (persistGate.denied) {
        throw new TaskEngineError("hook-denied", persistGate.denied.reason);
      }
    }

    await this.store.save(
      request.expectedPlanningGeneration !== undefined
        ? { expectedPlanningGeneration: request.expectedPlanningGeneration }
        : undefined
    );

    if (this.hookBus?.isEnabled()) {
      await this.hookBus.emitAfterTaskStorePersist({ taskId: request.taskId, toState: targetState });
      await this.hookBus.emitAfterTaskTransition({
        taskId: request.taskId,
        fromState,
        toState: targetState,
        transitionId: evidence.transitionId,
        action
      });
    }

    return { evidence, autoUnblocked: autoUnblockResults };
  }

  private autoUnblock(
    completedTaskId: string,
    timestamp: string,
    actor?: string
  ): TransitionEvidence[] {
    const results: TransitionEvidence[] = [];
    const allTasks = this.store.getAllTasks();

    const dependents = allTasks.filter(
      (t) => t.status === "blocked" && t.dependsOn?.includes(completedTaskId)
    );

    for (const dependent of dependents) {
      const deps = dependent.dependsOn ?? [];
      const allDepsComplete = deps.every((depId) => {
        if (depId === completedTaskId) return true;
        const depTask = this.store.getTask(depId);
        return depTask?.status === "completed";
      });

      if (!allDepsComplete) continue;

      const updatedDependent: TaskEntity = {
        ...dependent,
        status: "ready" as TaskStatus,
        updatedAt: timestamp
      };
      this.store.updateTask(updatedDependent);

      results.push({
        transitionId: `${dependent.id}-${timestamp}-${crypto.randomUUID().slice(0, 8)}`,
        taskId: dependent.id,
        fromState: "blocked",
        toState: "ready",
        action: "unblock",
        guardResults: [{ allowed: true, guardName: "auto-unblock" }],
        dependentsUnblocked: [],
        timestamp,
        actor
      });
    }

    return results;
  }

  getStore(): TaskStore {
    return this.store;
  }

  getValidator(): TransitionValidator {
    return this.validator;
  }
}
