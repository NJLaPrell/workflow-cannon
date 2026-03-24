import type { WorkflowModule } from "../../contracts/module-contract.js";

export const approvalsModule: WorkflowModule = {
  registration: {
    id: "approvals",
    version: "0.1.0",
    contractVersion: "1",
    capabilities: ["approvals"],
    dependsOn: ["task-engine"],
    enabledByDefault: true,
    config: {
      path: "src/modules/approvals/config.md",
      format: "md",
      description: "Approvals module policy and queue configuration contract."
    },
    state: {
      path: "src/modules/approvals/state.md",
      format: "md",
      description: "Approvals module decision and queue state contract."
    },
    instructions: {
      directory: "src/modules/approvals/instructions",
      entries: [
        {
          name: "review-item",
          file: "review-item.md",
          description: "Review and record an approval decision."
        }
      ]
    }
  }
};
