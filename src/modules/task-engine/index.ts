import type { WorkflowModule } from "../../contracts/module-contract.js";

export const taskEngineModule: WorkflowModule = {
  registration: {
    id: "task-engine",
    version: "0.1.0",
    contractVersion: "1",
    capabilities: ["task-engine"],
    dependsOn: []
  }
};
