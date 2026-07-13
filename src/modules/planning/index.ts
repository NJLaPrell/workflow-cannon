import type { WorkflowModule } from "../../contracts/module-contract.js";
import { builtinInstructionEntriesForModule } from "../../contracts/builtin-run-command-manifest.js";
import { dispatchPlanningCommand } from "./shared/dispatch.js";

/**
 * Planning module shell — delegates all command handling to `shared/dispatch.ts`.
 * Kept registered alongside `ideasModule` as a transitional dual-registration rollback shim only.
 */
export const planningModule: WorkflowModule = {
  registration: {
    id: "planning",
    version: "0.2.0",
    contractVersion: "1",
    stateSchema: 1,
    capabilities: ["planning"],
    dependsOn: ["task-engine"],
    optionalPeers: [],
    enabledByDefault: true,
    config: {
      path: "src/modules/planning/config.md",
      format: "md",
      description: "Planning module configuration contract."
    },
    instructions: {
      directory: "src/modules/planning/instructions",
      entries: builtinInstructionEntriesForModule("planning")
    }
  },
  async onCommand(command, ctx) {
    return dispatchPlanningCommand(command, ctx, "planning");
  }
};
