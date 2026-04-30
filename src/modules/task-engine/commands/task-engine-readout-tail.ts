import type { ModuleCommandResult, ModuleLifecycleContext } from "../../../contracts/module-contract.js";
import type { OpenedPlanningStores } from "../persistence/planning-open.js";
import { TaskStore } from "../persistence/store.js";
import { resolveQueueDashboardReadoutCommands } from "./queue-dashboard-readout-commands.js";
import { resolveTaskEngineModelReadoutCommands } from "./task-engine-model-readout-commands.js";
import { resolveTaskListQueueReadoutCommands } from "./task-list-queue-readout-commands.js";

/**
 * Queue dashboard, list/get queue readouts, and static model summaries (after heavier handlers).
 * Returns **`null`** when no tail handler matches.
 */
export async function resolveTaskEngineReadoutTail(
  command: { name: string; args?: Record<string, unknown> },
  ctx: ModuleLifecycleContext,
  planning: OpenedPlanningStores,
  store: TaskStore
): Promise<ModuleCommandResult | null> {
  const queueDashboardReadout = await resolveQueueDashboardReadoutCommands(command, ctx, planning, store);
  if (queueDashboardReadout !== null) {
    return queueDashboardReadout;
  }

  const taskListQueueReadout = resolveTaskListQueueReadoutCommands(command, ctx, planning, store);
  if (taskListQueueReadout !== null) {
    return taskListQueueReadout;
  }

  const modelReadout = resolveTaskEngineModelReadoutCommands(command, store);
  if (modelReadout !== null) {
    return modelReadout;
  }

  return null;
}
