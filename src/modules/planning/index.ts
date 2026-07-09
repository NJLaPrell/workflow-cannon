import type { WorkflowModule } from "../../contracts/module-contract.js";
import {
  PLANNING_WORKFLOW_DESCRIPTORS,
  PLANNING_WORKFLOW_TYPES,
  type PlanningWorkflowType
} from "./types.js";
import { resolvePlanningConfig, resolvePlanningRulePack } from "./question-engine.js";
import { openPlanningStores } from "../../core/planning/index.js";
import { builtinInstructionEntriesForModule } from "../../contracts/builtin-run-command-manifest.js";
import { planningConcurrencySaveOpts, readIdempotencyValue } from "../task-engine/mutation-utils.js";
import { PlanArtifactVersionImmutableError } from "../../core/planning/plan-artifact-immutability.js";
import { validatePlanArtifactDraftInput } from "../../core/planning/validate-plan-artifact.js";
import {
  commitPlanArtifactDraftPersist,
  planArtifactDraftPersistSuccessResult,
  preludePlanArtifactDraftPersist
} from "./persist-plan-artifact-draft.js";
import { runReviewPlanArtifact } from "./review-plan-artifact-handler.js";
import { runAcceptPlanArtifact } from "./accept-plan-artifact-handler.js";
import { runFinalizePlanToPhase } from "./finalize-plan-to-phase-handler.js";
import { runGeneratePlanDocument } from "./generate-plan-document-handler.js";
import {
  attachGeneratedPlanDocPath,
  bestEffortGeneratePlanDocument
} from "./best-effort-generate-plan-document.js";
import { runGetPlanArtifact } from "./get-plan-artifact-handler.js";
import { runGetPlanArtifactTemplate } from "./get-plan-artifact-template-handler.js";
import { APPEND_WBS_ROW_INSTRUCTION, runAppendWbsRow } from "./append-wbs-row-handler.js";
import { PATCH_PLAN_ARTIFACT_INSTRUCTION, runPatchPlanArtifact } from "./patch-plan-artifact-handler.js";
import { runExecutePlanArtifact } from "./execute-plan-artifact-handler.js";
import { attachPolicyMeta } from "../task-engine/attach-planning-response-meta.js";
import { planningGenPolicyGate } from "../task-engine/planning-generation-gate.js";
import { TaskEngineError } from "../task-engine/transitions.js";

const DRAFT_PLAN_ARTIFACT_INSTRUCTION = "src/modules/planning/instructions/draft-plan-artifact.md";
const REVIEW_PLAN_ARTIFACT_INSTRUCTION = "src/modules/planning/instructions/review-plan-artifact.md";
const ACCEPT_PLAN_ARTIFACT_INSTRUCTION = "src/modules/planning/instructions/accept-plan-artifact.md";
const FINALIZE_PLAN_TO_PHASE_INSTRUCTION =
  "src/modules/planning/instructions/finalize-plan-to-phase.md";
const GENERATE_PLAN_DOCUMENT_INSTRUCTION = "src/modules/planning/instructions/generate-plan-document.md";
const EXECUTE_PLAN_ARTIFACT_INSTRUCTION = "src/modules/planning/instructions/execute-plan-artifact.md";

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
    if (command.name === "review-plan-artifact") {
      return runReviewPlanArtifact(
        (command.args ?? {}) as Record<string, unknown>,
        ctx,
        REVIEW_PLAN_ARTIFACT_INSTRUCTION
      );
    }

    if (command.name === "accept-plan-artifact") {
      return runAcceptPlanArtifact(
        (command.args ?? {}) as Record<string, unknown>,
        ctx,
        ACCEPT_PLAN_ARTIFACT_INSTRUCTION
      );
    }

    if (command.name === "finalize-plan-to-phase") {
      return runFinalizePlanToPhase(
        (command.args ?? {}) as Record<string, unknown>,
        ctx,
        FINALIZE_PLAN_TO_PHASE_INSTRUCTION
      );
    }

    if (command.name === "execute-plan-artifact") {
      return runExecutePlanArtifact((command.args ?? {}) as Record<string, unknown>, ctx, EXECUTE_PLAN_ARTIFACT_INSTRUCTION);
    }

    if (command.name === "get-plan-artifact") {
      return runGetPlanArtifact((command.args ?? {}) as Record<string, unknown>, ctx);
    }

    if (command.name === "get-plan-artifact-template") {
      return runGetPlanArtifactTemplate((command.args ?? {}) as Record<string, unknown>, ctx);
    }

    if (command.name === "append-wbs-row") {
      return runAppendWbsRow((command.args ?? {}) as Record<string, unknown>, ctx, APPEND_WBS_ROW_INSTRUCTION);
    }

    if (command.name === "patch-plan-artifact") {
      return runPatchPlanArtifact(
        (command.args ?? {}) as Record<string, unknown>,
        ctx,
        PATCH_PLAN_ARTIFACT_INSTRUCTION
      );
    }

    if (command.name === "generate-plan-document") {
      return runGeneratePlanDocument((command.args ?? {}) as Record<string, unknown>, ctx);
    }

    if (command.name === "draft-plan-artifact") {
      const args = command.args ?? {};
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
        const pg = planningGenPolicyGate(
          ctx,
          args as Record<string, unknown>,
          DRAFT_PLAN_ARTIFACT_INSTRUCTION,
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
          return { ok: false, code: prelude.code, message: prelude.message, ...(prelude.data ? { data: prelude.data } : {}) };
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
          if (err instanceof PlanArtifactVersionImmutableError) { return { ok: false, code: err.code, message: err.message, data: { schemaVersion: 1, responseSchemaVersion: 1, planId: err.planId, version: err.version, status: err.status } }; }
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
      const args = command.args ?? {};
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

    return {
      ok: false,
      code: "unsupported-command",
      message: `Planning module does not support command '${command.name}'`
    };
  }
};
