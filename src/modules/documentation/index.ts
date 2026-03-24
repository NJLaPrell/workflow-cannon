import type { WorkflowModule } from "../../contracts/module-contract.js";

export const documentationModule: WorkflowModule = {
  registration: {
    id: "documentation",
    version: "0.1.0",
    contractVersion: "1",
    capabilities: ["documentation"],
    dependsOn: [],
    enabledByDefault: true,
    config: {
      path: "src/modules/documentation/config.md",
      format: "md",
      description: "Documentation module configuration contract."
    },
    state: {
      path: "src/modules/documentation/state.md",
      format: "md",
      description: "Documentation module generation/runtime state contract."
    },
    instructions: {
      directory: "src/modules/documentation/instructions",
      entries: [
        {
          name: "document-project",
          file: "document-project.md",
          description: "Generate aligned project docs for .ai and docs surfaces."
        }
      ]
    }
  }
};
