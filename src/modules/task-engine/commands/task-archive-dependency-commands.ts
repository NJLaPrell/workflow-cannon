import type { ModuleCommandResult, ModuleLifecycleContext } from "../../../contracts/module-contract.js";
import { CLI_REMEDIATION_INSTRUCTIONS } from "../../../core/cli-remediation.js";
import { attachPolicyMeta } from "../attach-planning-response-meta.js";
import { mutationEvidence, nowIso, planningConcurrencySaveOpts } from "../mutation-utils.js";
import { planningGenPolicyGate } from "../planning-generation-gate.js";
import type { OpenedPlanningStores } from "../persistence/planning-open.js";
import { TaskStore } from "../persistence/store.js";
import { strictValidationError } from "./strict-store-validation.js";
import { getAllowedTransitionsFrom } from "../transitions.js";
import type { TaskStatus } from "../types.js";

/**
 * Archive, single-task readout, dependency mutations, graph, and merged history.
 * Returns **`null`** when the command name is not handled here.
 */
export async function resolveTaskArchiveDependencyCommands(
  command: { name: string; args?: Record<string, unknown> },
  ctx: ModuleLifecycleContext,
  planning: OpenedPlanningStores,
  store: TaskStore
): Promise<ModuleCommandResult | null> {
  const args = command.args ?? {};

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
    const pgArchive = planningGenPolicyGate(
      ctx,
      args as Record<string, unknown>,
      CLI_REMEDIATION_INSTRUCTIONS.archiveTask,
      planning.sqliteDual.getPlanningGeneration()
    );
    if (pgArchive.block) {
      return pgArchive.block;
    }
    const archivedAt = nowIso();
    const updatedTask = { ...task, archived: true, archivedAt, updatedAt: archivedAt };
    store.updateTask(updatedTask);
    store.addMutationEvidence(mutationEvidence("archive-task", taskId, actor));
    const strictIssue = strictValidationError(store, ctx.effectiveConfig as Record<string, unknown> | undefined);
    if (strictIssue) {
      return { ok: false, code: "strict-task-validation-failed", message: strictIssue };
    }
    await store.save(planningConcurrencySaveOpts(args as Record<string, unknown>));
    const archData: Record<string, unknown> = { task: updatedTask };
    attachPolicyMeta(archData, ctx, planning.sqliteDual.getPlanningGeneration(), pgArchive.warnings);
    return {
      ok: true,
      code: "task-archived",
      message: `Archived task '${taskId}'`,
      data: archData
    };
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

    const gtData: Record<string, unknown> = {
      task,
      recentTransitions,
      allowedActions
    };
    attachPolicyMeta(gtData, ctx, planning.sqliteDual.getPlanningGeneration());
    return {
      ok: true,
      code: "task-retrieved",
      data: gtData
    };
  }

  if (command.name === "add-dependency" || command.name === "remove-dependency") {
    const taskId = typeof args.taskId === "string" ? args.taskId : undefined;
    const dependencyTaskId =
      typeof args.dependencyTaskId === "string"
        ? args.dependencyTaskId
        : typeof args.dependsOnTaskId === "string"
          ? args.dependsOnTaskId
          : undefined;
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
    const pgDep = planningGenPolicyGate(
      ctx,
      args as Record<string, unknown>,
      CLI_REMEDIATION_INSTRUCTIONS.addDependency,
      planning.sqliteDual.getPlanningGeneration()
    );
    if (pgDep.block) {
      return pgDep.block;
    }
    const updatedTask = { ...task, dependsOn: [...deps], updatedAt: nowIso() };
    store.updateTask(updatedTask);
    const mutationType = command.name === "add-dependency" ? "add-dependency" : "remove-dependency";
    store.addMutationEvidence(mutationEvidence(mutationType, taskId, actor, { dependencyTaskId }));
    const strictIssueDep = strictValidationError(store, ctx.effectiveConfig as Record<string, unknown> | undefined);
    if (strictIssueDep) {
      return { ok: false, code: "strict-task-validation-failed", message: strictIssueDep };
    }
    await store.save(planningConcurrencySaveOpts(args as Record<string, unknown>));
    const depData: Record<string, unknown> = { task: updatedTask };
    attachPolicyMeta(depData, ctx, planning.sqliteDual.getPlanningGeneration(), pgDep.warnings);
    return {
      ok: true,
      code: command.name === "add-dependency" ? "dependency-added" : "dependency-removed",
      message: `${command.name} applied for '${taskId}'`,
      data: depData
    };
  }

  if (command.name === "get-dependency-graph") {
    const taskId = typeof args.taskId === "string" ? args.taskId : undefined;
    const tasks = store.getActiveTasks();
    const byId = new Map(tasks.map((t) => [t.id, t]));
    const nodes = tasks.map((t) => ({ id: t.id, status: t.status }));
    const edges = tasks.flatMap((t) => (t.dependsOn ?? []).map((depId) => ({ from: t.id, to: depId })));
    const dependencyEdges = edges.map((edge) => {
      const d = byId.get(edge.to);
      return {
        taskId: edge.from,
        dependsOnTaskId: edge.to,
        dependencyStatus: d?.status ?? "missing",
        satisfied: d?.status === "completed"
      };
    });
    if (!taskId) {
      return { ok: true, code: "dependency-graph", data: { nodes, edges, dependencyEdges } as Record<string, unknown> };
    }
    const task = tasks.find((candidate) => candidate.id === taskId);
    if (!task) {
      return { ok: false, code: "task-not-found", message: `Task '${taskId}' not found` };
    }
    const taskDependencyEdges = dependencyEdges.filter((edge) => edge.taskId === taskId);
    return {
      ok: true,
      code: "dependency-graph",
      data: {
        taskId,
        dependsOn: task.dependsOn ?? [],
        directDependents: tasks.filter((candidate) => (candidate.dependsOn ?? []).includes(taskId)).map((x) => x.id),
        nodes,
        edges,
        dependencyEdges: taskDependencyEdges
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

  return null;
}
