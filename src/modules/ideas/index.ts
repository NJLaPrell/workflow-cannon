import type { WorkflowModule } from "../../contracts/module-contract.js";
import { builtinInstructionEntriesForModule } from "../../contracts/builtin-run-command-manifest.js";
import { openPlanningStores } from "../../core/planning/index.js";
import { TaskEngineError } from "../task-engine/transitions.js";
import { isPlanningGitSyncPublishActive } from "../task-engine/persistence/planning-canonical-sync-domains.js";
import { isIdeaCrudCommand, runIdeaCrudCommand } from "../planning/idea-row/idea-crud-commands.js";
import { runStartIdeaPlanning } from "./start-idea-planning-handler.js";
import { runStartBrainstormSession } from "./start-brainstorm-session-handler.js";
import { runUpdateIdeaPlanningSession } from "./update-idea-planning-session-handler.js";
import { runUpdateBrainstormSession } from "./update-brainstorm-session-handler.js";
import { runCompleteBrainstorm } from "./complete-brainstorm-handler.js";
import { runCheckDeliveryStatus } from "./check-delivery-status-handler.js";
import { runCancelPlanArtifact } from "./cancel-plan-artifact-handler.js";
import { runDeletePlanArtifact } from "./delete-plan-artifact-handler.js";
import { runGetPlannerFlowStatus } from "./get-planner-flow-status-handler.js";
import { runMigrateIdeasToUnifiedDocument } from "./migrate-ideas-to-unified-document-handler.js";

export const ideasModule: WorkflowModule = {
  registration: {
    id: "ideas",
    version: "0.1.0",
    contractVersion: "1",
    stateSchema: 1,
    capabilities: ["ideas"],
    dependsOn: [],
    optionalPeers: ["planning"],
    enabledByDefault: true,
    config: {
      path: "src/modules/ideas/config.md",
      format: "md",
      description: "Lightweight idea capture records in kit SQLite for planner-chat workflows."
    },
    instructions: {
      directory: "src/modules/ideas/instructions",
      entries: builtinInstructionEntriesForModule("ideas")
    }
  },
  async onCommand(command, ctx) {
    const args = command.args ?? {};
    let planning;
    try {
      planning = await openPlanningStores(ctx);
    } catch (err) {
      if (err instanceof TaskEngineError) {
        return { ok: false, code: err.code, message: err.message };
      }
      return {
        ok: false,
        code: "storage-read-error",
        message: `Failed to open planning stores: ${(err as Error).message}`
      };
    }

    const db = planning.sqliteDual.getDatabase();
    const store = planning.taskStore;
    const gitCanonical = isPlanningGitSyncPublishActive(ctx, "ideas");
    const planningGeneration = planning.sqliteDual.getPlanningGeneration();
    const policyApproval = args.policyApproval as { confirmed: boolean; rationale: string } | undefined;

    if (isIdeaCrudCommand(command.name)) {
      const crudResult = await runIdeaCrudCommand(command.name, args as Record<string, unknown>, ctx, {
        db,
        store,
        planning,
        planningGeneration,
        gitCanonical,
        policyApproval
      });
      if (crudResult) {
        return crudResult;
      }
    }

    if (command.name === "start-idea-planning") {
      return runStartIdeaPlanning(
        args as Record<string, unknown>,
        ctx,
        "src/modules/ideas/instructions/start-idea-planning.md"
      );
    }

    if (command.name === "update-idea-planning-session") {
      return runUpdateIdeaPlanningSession(
        args as Record<string, unknown>,
        ctx,
        "src/modules/ideas/instructions/update-idea-planning-session.md"
      );
    }

    if (command.name === "check-delivery-status") {
      return runCheckDeliveryStatus(
        args as Record<string, unknown>,
        ctx,
        "src/modules/ideas/instructions/check-delivery-status.md"
      );
    }

    if (command.name === "cancel-plan-artifact") {
      return runCancelPlanArtifact(
        args as Record<string, unknown>,
        ctx,
        "src/modules/ideas/instructions/cancel-plan-artifact.md"
      );
    }

    if (command.name === "delete-plan-artifact") {
      return runDeletePlanArtifact(
        args as Record<string, unknown>,
        ctx,
        "src/modules/ideas/instructions/delete-plan-artifact.md"
      );
    }

    if (command.name === "get-planner-flow-status") {
      return runGetPlannerFlowStatus(
        args as Record<string, unknown>,
        ctx,
        "src/modules/ideas/instructions/get-planner-flow-status.md"
      );
    }

    if (command.name === "start-brainstorm-session") {
      return runStartBrainstormSession(
        args as Record<string, unknown>,
        ctx,
        "src/modules/ideas/instructions/start-brainstorm-session.md"
      );
    }

    if (command.name === "update-brainstorm-session") {
      return runUpdateBrainstormSession(
        args as Record<string, unknown>,
        ctx,
        "src/modules/ideas/instructions/update-brainstorm-session.md"
      );
    }

    if (command.name === "complete-brainstorm") {
      return runCompleteBrainstorm(
        args as Record<string, unknown>,
        ctx,
        "src/modules/ideas/instructions/complete-brainstorm.md"
      );
    }

    if (command.name === "migrate-ideas-to-unified-document") {
      return runMigrateIdeasToUnifiedDocument(
        args as Record<string, unknown>,
        ctx,
        "src/modules/ideas/instructions/migrate-ideas-to-unified-document.md"
      );
    }

    return { ok: false, code: "unknown-command", message: `ideas does not implement ${command.name}` };
  }
};
