import type { ModuleCommandResult, ModuleLifecycleContext } from "../../../contracts/module-contract.js";
import type { OpenedPlanningStores } from "../planning-open.js";
import type { TaskStore } from "../store.js";
import { resolveActor, nowIso, mutationEvidence, strictValidationError } from "./shared.js";

export async function handleDependencyMutation(
  args: Record<string, unknown>,
  ctx: ModuleLifecycleContext,
  _planning: OpenedPlanningStores,
  store: TaskStore,
  commandName: string
): Promise<ModuleCommandResult> {
  const taskId = typeof args.taskId === "string" ? args.taskId : undefined;
  const dependencyTaskId = typeof args.dependencyTaskId === "string" ? args.dependencyTaskId : undefined;
  const actor = resolveActor(args, ctx);
  if (!taskId || !dependencyTaskId) {
    return {
      ok: false,
      code: "invalid-task-schema",
      message: `${commandName} requires taskId and dependencyTaskId`
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
  if (commandName === "add-dependency") {
    if (deps.has(dependencyTaskId)) {
      return { ok: false, code: "duplicate-dependency", message: "Dependency already exists" };
    }
    deps.add(dependencyTaskId);
  } else {
    deps.delete(dependencyTaskId);
  }
  const updatedTask = { ...task, dependsOn: [...deps], updatedAt: nowIso() };
  store.updateTask(updatedTask);
  const mutationType = commandName === "add-dependency" ? "add-dependency" : "remove-dependency";
  store.addMutationEvidence(mutationEvidence(mutationType, taskId, actor, { dependencyTaskId }));
  const strictIssue = strictValidationError(store, ctx.effectiveConfig as Record<string, unknown> | undefined);
  if (strictIssue) {
    return { ok: false, code: "strict-task-validation-failed", message: strictIssue };
  }
  await store.save();
  return {
    ok: true,
    code: commandName === "add-dependency" ? "dependency-added" : "dependency-removed",
    message: `${commandName} applied for '${taskId}'`,
    data: { task: updatedTask } as Record<string, unknown>
  };
}

export async function handleGetDependencyGraph(
  args: Record<string, unknown>,
  _ctx: ModuleLifecycleContext,
  _planning: OpenedPlanningStores,
  store: TaskStore
): Promise<ModuleCommandResult> {
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
