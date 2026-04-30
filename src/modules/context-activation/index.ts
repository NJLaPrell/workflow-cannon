import type { WorkflowModule } from "../../contracts/module-contract.js";
import { builtinInstructionEntriesForModule } from "../../contracts/builtin-run-command-manifest.js";
import { runContextActivationOnCommand } from "./handlers/cae-command-dispatch.js";

export const contextActivationModule: WorkflowModule = {
  registration: {
    id: "context-activation",
    version: "0.1.0",
    contractVersion: "1",
    stateSchema: 1,
    capabilities: ["diagnostics"],
    dependsOn: [],
    optionalPeers: [],
    enabledByDefault: true,
    config: {
      path: "src/modules/context-activation/config.md",
      format: "md",
      description: "Context Activation Engine (CAE) read-only registry and evaluation commands."
    },
    instructions: {
      directory: "src/modules/context-activation/instructions",
      entries: builtinInstructionEntriesForModule("context-activation")
    }
  },

  async onCommand(command, ctx) {
    return runContextActivationOnCommand(command, ctx);
  }
};
