import type { WorkflowModule } from "../../contracts/module-contract.js";
import { builtinInstructionEntriesForModule } from "../../contracts/builtin-run-command-manifest.js";
import { TaskEngineError } from "./transitions.js";
import { openPlanningStores } from "./persistence/planning-open.js";
import { routeTaskEngineBeforeOpenPlanningStores } from "./commands/planning-independent-commands.js";
import { dispatchTaskEnginePlanningCommands } from "./commands/task-engine-planning-dispatch.js";

export const taskEngineModule: WorkflowModule = {
  registration: {
    id: "task-engine",
    version: "0.22.0",
    contractVersion: "1",
    stateSchema: 1,
    capabilities: ["task-engine"],
    dependsOn: [],
    optionalPeers: [],
    enabledByDefault: true,
    config: {
      path: "src/modules/task-engine/config.md",
      format: "md",
      description: "Task Engine configuration contract."
    },
    instructions: {
      directory: "src/modules/task-engine/instructions",
      entries: builtinInstructionEntriesForModule("task-engine")
    }
  },

  async onCommand(command, ctx) {
    const beforeStores = await routeTaskEngineBeforeOpenPlanningStores(command, ctx);
    if (beforeStores) {
      return beforeStores;
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

    return dispatchTaskEnginePlanningCommands(command, ctx, planning, planning.taskStore);
  }
};
