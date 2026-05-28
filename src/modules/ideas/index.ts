import type { WorkflowModule } from "../../contracts/module-contract.js";

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
      entries: []
    }
  }
};
