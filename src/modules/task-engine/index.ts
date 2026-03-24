import type { WorkflowModule } from "../../contracts/module-contract.js";

export const taskEngineModule: WorkflowModule = {
  registration: {
    id: "task-engine",
    version: "0.1.0",
    contractVersion: "1",
    capabilities: ["task-engine"],
    dependsOn: [],
    enabledByDefault: true,
    config: {
      path: "src/modules/task-engine/config.md",
      format: "md",
      description: "Task Engine configuration contract."
    },
    state: {
      path: "src/modules/task-engine/state.md",
      format: "md",
      description: "Task Engine runtime state contract."
    },
    instructions: {
      directory: "src/modules/task-engine/instructions",
      entries: [
        {
          name: "run-transition",
          file: "run-transition.md",
          description: "Run a validated task status transition."
        }
      ]
    }
  }
};
