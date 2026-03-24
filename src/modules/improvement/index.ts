import type { WorkflowModule } from "../../contracts/module-contract.js";

export const improvementModule: WorkflowModule = {
  registration: {
    id: "improvement",
    version: "0.1.0",
    contractVersion: "1",
    capabilities: ["improvement"],
    dependsOn: ["task-engine", "planning"]
  }
};
