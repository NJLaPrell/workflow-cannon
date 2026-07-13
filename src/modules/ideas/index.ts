import type { WorkflowModule } from "../../contracts/module-contract.js";
import { builtinInstructionEntriesForModule } from "../../contracts/builtin-run-command-manifest.js";
import { dispatchPlanningCommand } from "../planning/shared/dispatch.js";

/**
 * Ideas module shell — delegates all command handling to `planning/shared/dispatch.ts`.
 * Transitional dual-registration rollback shim only; handler logic is not duplicated here.
 */
export const ideasModule: WorkflowModule = {
  registration: {
    id: "ideas",
    version: "0.1.0",
    contractVersion: "1",
    stateSchema: 1,
    capabilities: ["ideas"],
    dependsOn: [],
    optionalPeers: ["planning"],
    enabledByDefault: true,
    config: {
      path: "src/modules/ideas/config.md",
      format: "md",
      description: "Lightweight idea capture records in kit SQLite for planner-chat workflows."
    },
    instructions: {
      directory: "src/modules/ideas/instructions",
      entries: builtinInstructionEntriesForModule("ideas")
    }
  },
  async onCommand(command, ctx) {
    return dispatchPlanningCommand(command, ctx, "ideas");
  }
};
