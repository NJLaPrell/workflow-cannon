import type { WorkflowModule } from "../../contracts/module-contract.js";

export const approvalsModule: WorkflowModule = {
  registration: {
    id: "approvals",
    version: "0.1.0",
    contractVersion: "1",
    capabilities: ["approvals"],
    dependsOn: ["task-engine"]
  }
};
