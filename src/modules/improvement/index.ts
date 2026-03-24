import type { WorkflowModule } from "../../contracts/module-contract.js";

export const improvementModule: WorkflowModule = {
  registration: {
    id: "improvement",
    version: "0.1.0",
    contractVersion: "1",
    capabilities: ["improvement"],
    dependsOn: ["task-engine", "planning"],
    enabledByDefault: true,
    config: {
      path: "src/modules/improvement/config.md",
      format: "md",
      description: "Improvement module configuration contract."
    },
    state: {
      path: "src/modules/improvement/state.md",
      format: "md",
      description: "Improvement module recommendation state contract."
    },
    instructions: {
      directory: "src/modules/improvement/instructions",
      entries: [
        {
          name: "generate-recommendations",
          file: "generate-recommendations.md",
          description: "Produce evidence-backed workflow recommendations."
        }
      ]
    }
  }
};
