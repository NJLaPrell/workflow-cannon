/**
 * Shared Planning + Ideas command dispatcher.
 *
 * Transitional dual-registration shim: `planningModule` and `ideasModule` remain separately
 * registered in the module registry, but both shells delegate here so handler logic stays in one
 * place. This is a rollback aid only — not a long-term pattern for independently disabling either
 * module. Registry cutover to Planning-only is a later phase; until then preserve command names,
 * argv shapes, policy opIds, and response codes.
 */
import type {
  ModuleCommand,
  ModuleCommandResult,
  ModuleLifecycleContext
} from "../../../contracts/module-contract.js";
import { getBuiltinRunCommandManifestRow } from "../../../contracts/builtin-run-command-manifest.js";
import {
  PLANNING_WORKFLOW_DESCRIPTORS,
  PLANNING_WORKFLOW_TYPES,
  type PlanningWorkflowType
} from "../types.js";
import { resolvePlanningConfig, resolvePlanningRulePack } from "../question-engine.js";
import { openPlanningStores } from "../../../core/planning/index.js";
import { PlanArtifactVersionImmutableError } from "../../../core/planning/plan-artifact-immutability.js";
import { validatePlanArtifactDraftInput } from "../../../core/planning/validate-plan-artifact.js";
import {
  commitPlanArtifactDraftPersist,
  planArtifactDraftPersistSuccessResult,
  preludePlanArtifactDraftPersist
} from "../persist-plan-artifact-draft.js";
import { runReviewPlanArtifact } from "../review-plan-artifact-handler.js";
import { runAcceptPlanArtifact } from "../accept-plan-artifact-handler.js";
import { runFinalizePlanToPhase } from "../finalize-plan-to-phase-handler.js";
import { runGeneratePlanDocument } from "../generate-plan-document-handler.js";
import {
  attachGeneratedPlanDocPath,
  bestEffortGeneratePlanDocument
} from "../best-effort-generate-plan-document.js";
import { runGetPlanArtifact } from "../get-plan-artifact-handler.js";
import { runGetPlanArtifactTemplate } from "../get-plan-artifact-template-handler.js";
import { runAppendWbsRow } from "../append-wbs-row-handler.js";
import { runPatchPlanArtifact } from "../patch-plan-artifact-handler.js";
import { runExecutePlanArtifact } from "../execute-plan-artifact-handler.js";
import { attachPolicyMeta } from "../../../modules/task-engine/attach-planning-response-meta.js";
import { planningGenPolicyGate } from "../../../modules/task-engine/planning-generation-gate.js";
import { planningConcurrencySaveOpts, readIdempotencyValue } from "../../../modules/task-engine/mutation-utils.js";
import { TaskEngineError } from "../../../modules/task-engine/transitions.js";
import { isPlanningGitSyncPublishActive } from "../../../modules/task-engine/persistence/planning-canonical-sync-domains.js";
import { isIdeaCrudCommand, runIdeaCrudCommand } from "../idea-row/idea-crud-commands.js";
import { runStartIdeaPlanning } from "../../ideas/start-idea-planning-handler.js";
import { runStartBrainstormSession } from "../brainstorm/start-brainstorm-session-handler.js";
import { runUpdateIdeaPlanningSession } from "../../ideas/update-idea-planning-session-handler.js";
import { runUpdateBrainstormSession } from "../brainstorm/update-brainstorm-session-handler.js";
import { runCompleteBrainstorm } from "../brainstorm/complete-brainstorm-handler.js";
import { runCheckDeliveryStatus } from "../../ideas/check-delivery-status-handler.js";
import { runCancelPlanArtifact } from "../../ideas/cancel-plan-artifact-handler.js";
import { runDeletePlanArtifact } from "../../ideas/delete-plan-artifact-handler.js";
import { runGetPlannerFlowStatus } from "../../ideas/get-planner-flow-status-handler.js";
import { runMigrateIdeasToUnifiedDocument } from "../idea-row/migrate-ideas-to-unified-document-handler.js";

/** All operator commands owned by Planning + Ideas modules (manifest rows). */
export const PLANNING_IDEAS_DISPATCH_COMMANDS = [
  "accept-plan-artifact",
  "append-wbs-row",
  "cancel-plan-artifact",
  "check-delivery-status",
  "complete-brainstorm",
  "create-idea",
  "delete-idea",
  "delete-plan-artifact",
  "draft-plan-artifact",
  "execute-plan-artifact",
  "explain-planning-rules",
  "finalize-plan-to-phase",
  "generate-plan-document",
  "get-idea",
  "get-plan-artifact",
  "get-plan-artifact-template",
  "get-planner-flow-status",
  "list-ideas",
  "list-planning-types",
  "migrate-ideas-to-unified-document",
  "patch-plan-artifact",
  "reorder-ideas",
  "review-plan-artifact",
  "start-brainstorm-session",
  "start-idea-planning",
  "update-brainstorm-session",
  "update-idea",
  "update-idea-planning-session"
] as const;

export type PlanningIdeasDispatchCommand = (typeof PLANNING_IDEAS_DISPATCH_COMMANDS)[number];

export type PlanningDispatchShell = "planning" | "ideas";

/** Resolve `src/modules/<moduleId>/instructions/<file>` from the builtin manifest row. */
export function manifestInstructionPath(commandName: string): string {
  const row = getBuiltinRunCommandManifestRow(commandName);
  if (!row) {
    throw new Error(`builtin manifest missing row for command '${commandName}'`);
  }
  return `src/modules/${row.moduleId}/instructions/${row.file}`;
}

function shellFallback(commandName: string, shell: PlanningDispatchShell): ModuleCommandResult {
  if (shell === "planning") {
    return {
      ok: false,
      code: "unsupported-command",
      message: `Planning module does not support command '${commandName}'`
    };
  }
  return {
    ok: false,
    code: "unknown-command",
    message: `ideas does not implement ${commandName}`
  };
}

/**
 * Single dispatcher for all Planning + Ideas `workspace-kit run` commands while both modules
 * remain registered. Shell modules pass their registry id only for legacy error-code parity.
 */
export async function dispatchPlanningCommand(
  command: ModuleCommand,
  ctx: ModuleLifecycleContext,
  shell: PlanningDispatchShell
): Promise<ModuleCommandResult> {
  const args = command.args ?? {};

  if (command.name === "review-plan-artifact") {
    return runReviewPlanArtifact(
      args as Record<string, unknown>,
      ctx,
      manifestInstructionPath("review-plan-artifact")
    );
  }

  if (command.name === "accept-plan-artifact") {
    return runAcceptPlanArtifact(
      args as Record<string, unknown>,
      ctx,
      manifestInstructionPath("accept-plan-artifact")
    );
  }

  if (command.name === "finalize-plan-to-phase") {
    return runFinalizePlanToPhase(
      args as Record<string, unknown>,
      ctx,
      manifestInstructionPath("finalize-plan-to-phase")
    );
  }

  if (command.name === "execute-plan-artifact") {
    return runExecutePlanArtifact(
      args as Record<string, unknown>,
      ctx,
      manifestInstructionPath("execute-plan-artifact")
    );
  }

  if (command.name === "get-plan-artifact") {
    return runGetPlanArtifact(args as Record<string, unknown>, ctx);
  }

  if (command.name === "get-plan-artifact-template") {
    return runGetPlanArtifactTemplate(args as Record<string, unknown>, ctx);
  }

  if (command.name === "append-wbs-row") {
    return runAppendWbsRow(
      args as Record<string, unknown>,
      ctx,
      manifestInstructionPath("append-wbs-row")
    );
  }

  if (command.name === "patch-plan-artifact") {
    return runPatchPlanArtifact(
      args as Record<string, unknown>,
      ctx,
      manifestInstructionPath("patch-plan-artifact")
    );
  }

  if (command.name === "generate-plan-document") {
    return runGeneratePlanDocument(args as Record<string, unknown>, ctx);
  }

  if (command.name === "draft-plan-artifact") {
    const artifactRaw = args.artifact;
    if (!artifactRaw || typeof artifactRaw !== "object" || Array.isArray(artifactRaw)) {
      return {
        ok: false,
        code: "invalid-run-args",
        message: "draft-plan-artifact requires a non-null artifact object"
      };
    }
    const persist = args.persist !== false;
    const importSource =
      args.importSource === "import-build-plan" || args.importSource === "import-wishlist"
        ? args.importSource
        : undefined;
    const ideaId =
      typeof args.ideaId === "string" && args.ideaId.trim().length > 0 ? args.ideaId.trim() : undefined;
    const validation = validatePlanArtifactDraftInput(artifactRaw, {
      workspaceRoot: ctx.workspacePath,
      planId: typeof args.planId === "string" ? args.planId : undefined,
      importSource,
      ideaId,
      actor: typeof args.actor === "string" ? args.actor : undefined
    });
    if (!validation.ok) {
      return {
        ok: false,
        code: "plan-artifact-schema-invalid",
        message: "PlanArtifact validation failed",
        data: {
          schemaVersion: 1,
          responseSchemaVersion: 1,
          errors: validation.errors
        }
      };
    }
    if (persist) {
      const stores = await openPlanningStores(ctx);
      const draftInstruction = manifestInstructionPath("draft-plan-artifact");
      const pg = planningGenPolicyGate(
        ctx,
        args as Record<string, unknown>,
        draftInstruction,
        stores.sqliteDual.getPlanningGeneration()
      );
      if (pg.block) {
        return pg.block;
      }
      const clientMutationId = readIdempotencyValue(args as Record<string, unknown>);
      const sqliteDb = stores.sqliteDual.getDatabase();
      const prelude = preludePlanArtifactDraftPersist({
        workspacePath: ctx.workspacePath,
        artifact: validation.artifact,
        artifactRaw,
        clientMutationId,
        effectiveConfig: ctx.effectiveConfig as Record<string, unknown> | undefined,
        sqliteDb
      });
      if (prelude.kind === "conflict") {
        return {
          ok: false,
          code: prelude.code,
          message: prelude.message,
          ...(prelude.data ? { data: prelude.data } : {})
        };
      }
      if (prelude.kind === "replay") {
        const replay = planArtifactDraftPersistSuccessResult({
          code: "plan-artifact-draft-idempotent-replay",
          artifact: prelude.artifact,
          storagePath: prelude.storagePath,
          replayed: true
        });
        attachPolicyMeta(
          replay.data as Record<string, unknown>,
          ctx,
          stores.sqliteDual.getPlanningGeneration(),
          pg.warnings
        );
        attachGeneratedPlanDocPath(
          replay.data as Record<string, unknown>,
          await bestEffortGeneratePlanDocument(ctx, prelude.artifact.planId)
        );
        return replay;
      }
      let committed;
      try {
        stores.sqliteDual.withTransaction(() => {
          committed = commitPlanArtifactDraftPersist({
            workspacePath: ctx.workspacePath,
            artifact: prelude.kind === "commit" ? prelude.artifact : validation.artifact,
            clientMutationId,
            digest: prelude.digest,
            effectiveConfig: ctx.effectiveConfig as Record<string, unknown> | undefined,
            sqliteDb
          });
        }, planningConcurrencySaveOpts(args as Record<string, unknown>));
      } catch (err) {
        if (err instanceof TaskEngineError) {
          const data =
            err.code === "planning-generation-mismatch" && err.details
              ? (err.details as Record<string, unknown>)
              : undefined;
          return { ok: false, code: err.code, message: err.message, data };
        }
        if (err instanceof PlanArtifactVersionImmutableError) {
          return {
            ok: false,
            code: err.code,
            message: err.message,
            data: {
              schemaVersion: 1,
              responseSchemaVersion: 1,
              planId: err.planId,
              version: err.version,
              status: err.status
            }
          };
        }
        throw err;
      }
      const persisted = planArtifactDraftPersistSuccessResult({
        code: "plan-artifact-draft-persisted",
        artifact: committed!.artifact,
        storagePath: committed!.storagePath,
        replayed: false,
        ...(committed!.planningChatSession ? { planningChatSession: committed!.planningChatSession } : {})
      });
      attachPolicyMeta(
        persisted.data as Record<string, unknown>,
        ctx,
        stores.sqliteDual.getPlanningGeneration(),
        pg.warnings
      );
      attachGeneratedPlanDocPath(
        persisted.data as Record<string, unknown>,
        await bestEffortGeneratePlanDocument(ctx, committed!.artifact.planId)
      );
      return persisted;
    }
    return {
      ok: true,
      code: "plan-artifact-draft-validated",
      message: "PlanArtifact draft validated",
      data: {
        schemaVersion: 1,
        responseSchemaVersion: 1,
        planId: validation.artifact.planId,
        version: validation.artifact.version,
        planRef: validation.artifact.planRef,
        status: validation.artifact.status
      }
    };
  }

  if (command.name === "list-planning-types") {
    return {
      ok: true,
      code: "planning-types-listed",
      message: `Found ${PLANNING_WORKFLOW_DESCRIPTORS.length} planning workflow types`,
      data: {
        responseSchemaVersion: 1,
        planningTypes: PLANNING_WORKFLOW_DESCRIPTORS
      }
    };
  }

  if (command.name === "explain-planning-rules") {
    const planningType = typeof args.planningType === "string" ? args.planningType.trim() : "";
    if (!PLANNING_WORKFLOW_TYPES.includes(planningType as PlanningWorkflowType)) {
      return {
        ok: false,
        code: "invalid-planning-type",
        message:
          "explain-planning-rules requires planningType of: task-breakdown, sprint-phase, task-ordering, new-feature, change"
      };
    }
    const config = resolvePlanningConfig(ctx.effectiveConfig as Record<string, unknown> | undefined);
    const rulePack = resolvePlanningRulePack(
      planningType as PlanningWorkflowType,
      ctx.effectiveConfig as Record<string, unknown> | undefined
    );
    return {
      ok: true,
      code: "planning-rules-explained",
      message: `Effective planning rules for ${planningType}`,
      data: {
        responseSchemaVersion: 1,
        planningType,
        defaultQuestionDepth: config.depth,
        hardBlockCriticalUnknowns: config.hardBlockCriticalUnknowns,
        adaptiveFinalizePolicy: config.adaptiveFinalizePolicy,
        baseQuestions: rulePack.baseQuestions,
        adaptiveQuestions: rulePack.adaptiveQuestions
      }
    };
  }

  if (isIdeaCrudCommand(command.name)) {
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
      manifestInstructionPath("start-idea-planning")
    );
  }

  if (command.name === "update-idea-planning-session") {
    return runUpdateIdeaPlanningSession(
      args as Record<string, unknown>,
      ctx,
      manifestInstructionPath("update-idea-planning-session")
    );
  }

  if (command.name === "check-delivery-status") {
    return runCheckDeliveryStatus(
      args as Record<string, unknown>,
      ctx,
      manifestInstructionPath("check-delivery-status")
    );
  }

  if (command.name === "cancel-plan-artifact") {
    return runCancelPlanArtifact(
      args as Record<string, unknown>,
      ctx,
      manifestInstructionPath("cancel-plan-artifact")
    );
  }

  if (command.name === "delete-plan-artifact") {
    return runDeletePlanArtifact(
      args as Record<string, unknown>,
      ctx,
      manifestInstructionPath("delete-plan-artifact")
    );
  }

  if (command.name === "get-planner-flow-status") {
    return runGetPlannerFlowStatus(
      args as Record<string, unknown>,
      ctx,
      manifestInstructionPath("get-planner-flow-status")
    );
  }

  if (command.name === "start-brainstorm-session") {
    return runStartBrainstormSession(
      args as Record<string, unknown>,
      ctx,
      manifestInstructionPath("start-brainstorm-session")
    );
  }

  if (command.name === "update-brainstorm-session") {
    return runUpdateBrainstormSession(
      args as Record<string, unknown>,
      ctx,
      manifestInstructionPath("update-brainstorm-session")
    );
  }

  if (command.name === "complete-brainstorm") {
    return runCompleteBrainstorm(
      args as Record<string, unknown>,
      ctx,
      manifestInstructionPath("complete-brainstorm")
    );
  }

  if (command.name === "migrate-ideas-to-unified-document") {
    return runMigrateIdeasToUnifiedDocument(
      args as Record<string, unknown>,
      ctx,
      manifestInstructionPath("migrate-ideas-to-unified-document")
    );
  }

  return shellFallback(command.name, shell);
}
