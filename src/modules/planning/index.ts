import type { WorkflowModule } from "../../contracts/module-contract.js";

export const planningModule: WorkflowModule = {
  registration: {
    id: "planning",
    version: "0.1.0",
    contractVersion: "1",
    capabilities: ["planning"],
    dependsOn: ["task-engine"]
  }
};
