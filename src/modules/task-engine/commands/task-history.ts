import type { ModuleCommandResult, ModuleLifecycleContext } from "../../../contracts/module-contract.js";
import type { OpenedPlanningStores } from "../planning-open.js";
import type { TaskStore } from "../store.js";

export async function handleTaskHistory(
  args: Record<string, unknown>,
  _ctx: ModuleLifecycleContext,
  _planning: OpenedPlanningStores,
  store: TaskStore,
  commandName: string
): Promise<ModuleCommandResult> {
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
    code: commandName === "get-task-history" ? "task-history" : "recent-task-activity",
    data: { taskId: taskId ?? null, items: merged, count: merged.length } as Record<string, unknown>
  };
}
