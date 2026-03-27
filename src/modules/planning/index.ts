import type { WorkflowModule } from "../../contracts/module-contract.js";
import {
  PLANNING_WORKFLOW_DESCRIPTORS,
  PLANNING_WORKFLOW_TYPES,
  type PlanningWorkflowType
} from "./types.js";

export const planningModule: WorkflowModule = {
  registration: {
    id: "planning",
    version: "0.1.0",
    contractVersion: "1",
    capabilities: ["planning"],
    dependsOn: ["task-engine"],
    enabledByDefault: true,
    config: {
      path: "src/modules/planning/config.md",
      format: "md",
      description: "Planning module configuration contract."
    },
    state: {
      path: "src/modules/planning/state.md",
      format: "md",
      description: "Planning module runtime state contract."
    },
    instructions: {
      directory: "src/modules/planning/instructions",
      entries: [
        {
          name: "build-plan",
          file: "build-plan.md",
          description: "Generate a dependency-aware execution plan."
        },
        {
          name: "list-planning-types",
          file: "list-planning-types.md",
          description: "List supported planning workflow types and their intent."
        }
      ]
    }
  },
  async onCommand(command) {
    if (command.name === "list-planning-types") {
      return {
        ok: true,
        code: "planning-types-listed",
        message: `Found ${PLANNING_WORKFLOW_DESCRIPTORS.length} planning workflow types`,
        data: {
          planningTypes: PLANNING_WORKFLOW_DESCRIPTORS
        }
      };
    }

    if (command.name === "build-plan") {
      const args = command.args ?? {};
      const planningType = typeof args.planningType === "string" ? args.planningType.trim() : "";
      if (!PLANNING_WORKFLOW_TYPES.includes(planningType as PlanningWorkflowType)) {
        return {
          ok: false,
          code: "invalid-planning-type",
          message:
            "build-plan requires planningType of: task-breakdown, sprint-phase, task-ordering, new-feature, change"
        };
      }
      const descriptor = PLANNING_WORKFLOW_DESCRIPTORS.find((x) => x.type === planningType);
      return {
        ok: true,
        code: "planning-scaffold",
        message: `Planning scaffold initialized for ${planningType}`,
        data: {
          planningType,
          descriptor,
          scaffoldVersion: 1,
          note: "Phase 17 scaffold: adaptive interview/rule engine and wishlist artifact integration follow in subsequent tasks."
        }
      };
    }

    return {
      ok: false,
      code: "unsupported-command",
      message: `Planning module does not support command '${command.name}'`
    };
  }
};
