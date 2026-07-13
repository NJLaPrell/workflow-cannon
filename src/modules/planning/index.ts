import type { WorkflowModule } from "../../contracts/module-contract.js";
import { builtinInstructionEntriesForModule } from "../../contracts/builtin-run-command-manifest.js";
import { dispatchPlanningCommand } from "./shared/dispatch.js";

/**
 * Planning module shell — delegates all command handling to `shared/dispatch.ts`.
 */
export const planningModule: WorkflowModule = {
  registration: {
    id: "planning",
    version: "0.2.0",
    contractVersion: "1",
    stateSchema: 1,
    capabilities: ["planning"],
    dependsOn: ["task-engine"],
    optionalPeers: [],
    enabledByDefault: true,
    config: {
      path: "src/modules/planning/config.md",
      format: "md",
      description: "Planning module configuration contract."
    },
    instructions: {
      directory: "src/modules/planning/instructions",
      entries: builtinInstructionEntriesForModule("planning")
    }
  },
  async onCommand(command, ctx) {
    return dispatchPlanningCommand(command, ctx, "planning");
  }
};

export {
  deriveIdeaPlanningLifecycleState,
  type DeriveIdeaPlanningLifecycleStateInput,
  type IdeaPlanningLifecycleState,
  type PlanFinalizeSummary
} from "./idea-plan/derive-idea-planning-lifecycle-state.js";
export { listIdeas } from "./idea-row/idea-store.js";
export { listIdeaPlanArtifacts, readIdeaPlanArtifact } from "./idea-plan/idea-plan-artifact-storage.js";
export { computeBrainstormReadiness } from "./brainstorm/brainstorm-readiness.js";
export type {
  BrainstormSession,
  IdeaPlanBrainstormSection,
  IdeaPlanDocument
} from "./idea-plan/idea-plan-types.js";
