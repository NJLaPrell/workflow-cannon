import type { WorkflowModule } from "../../contracts/module-contract.js";
import {
  PLANNING_WORKFLOW_DESCRIPTORS,
  PLANNING_WORKFLOW_TYPES,
  type PlanningWorkflowType
} from "./types.js";
import {
  nextPlanningQuestions,
  resolvePlanningConfig,
  resolvePlanningRulePack
} from "./question-engine.js";
import { composePlanningWishlistArtifact } from "./artifact.js";
import {
  openPlanningStores,
  validateKnownTaskTypeRequirements,
  type TaskEntity,
  type TaskPriority
} from "../../core/planning/index.js";
import { builtinInstructionEntriesForModule } from "../../contracts/builtin-run-command-manifest.js";
import {
  enforcePlanningGenerationPolicy,
  getPlanningGenerationPolicy,
  planningStrictValidationEnabled
} from "../task-engine/planning-config.js";
import { planningConcurrencySaveOpts, readIdempotencyValue } from "../task-engine/mutation-utils.js";
import {
  clearAgentActivityBestEffort,
  recordAgentActivityBestEffort
} from "../task-engine/agent-activity-recorder.js";
import { validateTaskSetForStrictMode } from "../task-engine/strict-task-validation.js";
import {
  buildScoringHints,
  buildPlanArtifactRecommendedNextCommands,
  findMissingAnsweredQuestions,
  persistInterviewSnapshot,
  resolveOutputMode,
  toCliGuidance,
  type PlanningOutputMode
} from "./build-plan-output-helpers.js";
import { clearBuildPlanSessionWithPlanningSync } from "./build-plan-session-persist.js";
import { buildTasksFromExecutionDrafts, nextTaskId } from "./build-plan-execution-drafts.js";
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

async function recordBuildPlanActivity(
  ctx: Parameters<NonNullable<WorkflowModule["onCommand"]>>[1],
  planningType: string,
  outputMode: string
): Promise<void> {
  try {
    const stores = await openPlanningStores(ctx);
    recordAgentActivityBestEffort(ctx, stores, {
      kind: "planning",
      command: "build-plan",
      details: { planningType, outputMode }
    });
  } catch {
    // Activity is a UI hint; build-plan must remain authoritative if recording is unavailable.
  }
}

async function clearBuildPlanActivity(ctx: Parameters<NonNullable<WorkflowModule["onCommand"]>>[1]): Promise<void> {
  try {
    const stores = await openPlanningStores(ctx);
    clearAgentActivityBestEffort(ctx, stores);
  } catch {
    // Activity is a UI hint; build-plan must remain authoritative if recording is unavailable.
  }
}

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

    if (command.name === "build-plan") {
      const args = command.args ?? {};
      if (args.action === "discard") {
        await clearBuildPlanSessionWithPlanningSync(ctx, { commandName: "build-plan" });
        await clearBuildPlanActivity(ctx);
        return {
          ok: true,
          code: "planning-session-discarded",
          message: "Planning interview session discarded",
          data: { responseSchemaVersion: 1 }
        };
      }
      const outputModeResolved = resolveOutputMode(args);
      if (!outputModeResolved.ok) {
        return {
          ok: false,
          code: "invalid-planning-output-mode",
          message: outputModeResolved.message
        };
      }
      const outputMode = outputModeResolved.mode;
      if ("createWishlist" in args) {
        return {
          ok: false,
          code: "invalid-planning-args",
          message:
            "build-plan no longer accepts createWishlist; use outputMode \"tasks\" (default) with finalize:true"
        };
      }
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
      await recordBuildPlanActivity(ctx, planningType, outputMode);
      const resolvedRulePack = resolvePlanningRulePack(
        planningType as PlanningWorkflowType,
        ctx.effectiveConfig as Record<string, unknown> | undefined
      );
      const totalCriticalCount = resolvedRulePack.baseQuestions.length;
      const answers =
        typeof args.answers === "object" && args.answers !== null && !Array.isArray(args.answers)
          ? (args.answers as Record<string, unknown>)
          : {};
      const finalize = args.finalize === true;
      const { missingCritical, adaptiveFollowups } = nextPlanningQuestions(
        planningType as PlanningWorkflowType,
        answers,
        ctx.effectiveConfig as Record<string, unknown> | undefined
      );
      const config = resolvePlanningConfig(ctx.effectiveConfig as Record<string, unknown> | undefined);
      const unresolvedAdaptive = findMissingAnsweredQuestions(adaptiveFollowups, answers);
      const scoringHints = buildScoringHints({
        planningType,
        answers,
        unresolvedCriticalCount: missingCritical.length,
        unresolvedAdaptiveCount: unresolvedAdaptive.length
      });
      if (finalize && missingCritical.length > 0) {
        if (!config.hardBlockCriticalUnknowns) {
          const cliGuidance = toCliGuidance({
            planningType,
            answers,
            unresolvedCriticalCount: missingCritical.length,
            totalCriticalCount,
            outputMode
          });
          await persistInterviewSnapshot(ctx, {
            planningType,
            outputMode,
            status: "ready-with-warnings",
            answers,
            cliGuidance
          });
          return {
            ok: true,
            code: "planning-ready-with-warnings",
            message: `Finalize allowed with unresolved critical questions because planning.hardBlockCriticalUnknowns=false`,
            data: {
              responseSchemaVersion: 1,
              planningType,
              outputMode,
              status: "ready-with-warnings",
              unresolvedCritical: missingCritical,
              finalizeWarnings: {
                kind: "unresolved-critical-soft-finalize",
                unresolvedCritical: missingCritical
              },
              nextQuestions: [...missingCritical, ...adaptiveFollowups],
              scoringHints,
              capturedAnswers: answers,
              cliGuidance
            }
          };
        }
        const cliGuidanceBlocked = toCliGuidance({
          planningType,
          answers,
          unresolvedCriticalCount: missingCritical.length,
          totalCriticalCount,
          finalize: true,
          outputMode
        });
        await persistInterviewSnapshot(ctx, {
          planningType,
          outputMode,
          status: "blocked-critical-unknowns",
          answers,
          cliGuidance: cliGuidanceBlocked
        });
        return {
          ok: false,
          code: "planning-critical-unknowns",
          message: `Cannot finalize ${planningType}: unresolved critical questions (${missingCritical.map((q) => q.id).join(", ")})`,
          data: {
            responseSchemaVersion: 1,
            planningType,
            outputMode,
            unresolvedCritical: missingCritical,
            nextQuestions: [...missingCritical, ...adaptiveFollowups],
            scoringHints,
            cliGuidance: cliGuidanceBlocked
          }
        };
      }
      if (finalize && unresolvedAdaptive.length > 0 && config.adaptiveFinalizePolicy === "block") {
        const cliGuidanceAdaptive = toCliGuidance({
          planningType,
          answers,
          unresolvedCriticalCount: 0,
          totalCriticalCount,
          finalize: true,
          outputMode
        });
        await persistInterviewSnapshot(ctx, {
          planningType,
          outputMode,
          status: "blocked-adaptive-unknowns",
          answers,
          cliGuidance: cliGuidanceAdaptive
        });
        return {
          ok: false,
          code: "planning-adaptive-unknowns",
          message: `Cannot finalize ${planningType}: unresolved adaptive follow-ups (${unresolvedAdaptive
            .map((q) => q.id)
            .join(", ")})`,
          data: {
            responseSchemaVersion: 1,
            planningType,
            outputMode,
            unresolvedAdaptive,
            unresolvedCritical: [],
            nextQuestions: unresolvedAdaptive,
            scoringHints,
            cliGuidance: cliGuidanceAdaptive
          }
        };
      }
      const adaptiveWarnings =
        finalize && unresolvedAdaptive.length > 0 && config.adaptiveFinalizePolicy === "warn"
          ? unresolvedAdaptive
          : [];
      if (missingCritical.length > 0) {
        const cliGuidanceQuestions = toCliGuidance({
          planningType,
          answers,
          unresolvedCriticalCount: missingCritical.length,
          totalCriticalCount,
          outputMode
        });
        await persistInterviewSnapshot(ctx, {
          planningType,
          outputMode,
          status: "needs-input",
          answers,
          cliGuidance: cliGuidanceQuestions
        });
        return {
          ok: true,
          code: "planning-questions",
          message: `${missingCritical.length} critical planning questions require answers before finalize`,
          data: {
            responseSchemaVersion: 1,
            planningType,
            outputMode,
            status: "needs-input",
            unresolvedCritical: missingCritical,
            nextQuestions: [...missingCritical, ...adaptiveFollowups],
            scoringHints,
            cliGuidance: cliGuidanceQuestions
          }
        };
      }
      const unresolvedIds = missingCritical.map((q) => q.id);
      const artifact = composePlanningWishlistArtifact({
        planningType: planningType as PlanningWorkflowType,
        answers,
        unresolvedCriticalQuestionIds: unresolvedIds
      });
      if (outputMode === "response") {
        await clearBuildPlanSessionWithPlanningSync(ctx, { commandName: "build-plan" });
        await clearBuildPlanActivity(ctx);
        return {
          ok: true,
          code: "planning-response-ready",
          message: `Planning interview complete for ${planningType}; returning response-only artifact`,
          data: {
            responseSchemaVersion: 1,
            planningType,
            descriptor,
            outputMode,
            scaffoldVersion: 3,
            status: "ready-for-response",
            unresolvedCritical: [],
            adaptiveWarnings,
            adaptiveFollowups,
            scoringHints,
            capturedAnswers: answers,
            artifact,
            cliGuidance: toCliGuidance({
              planningType,
              answers,
              unresolvedCriticalCount: 0,
              totalCriticalCount,
              finalize,
              outputMode
            })
          }
        };
      }

      if (outputMode === "tasks") {
        const persistTasks = args.persistTasks === true;
        const executionDraftsRaw = args.executionTaskDrafts;
        const recommendedNextCommands = buildPlanArtifactRecommendedNextCommands({ outputMode });
        const useDraftDecomposition =
          finalize === true &&
          Array.isArray(executionDraftsRaw) &&
          executionDraftsRaw.length > 0;

        if (Array.isArray(executionDraftsRaw) && executionDraftsRaw.length > 0 && !finalize) {
          return {
            ok: false,
            code: "planning-execution-drafts-require-finalize",
            message:
              "executionTaskDrafts is only honored when finalize=true (multi-task decomposition finalize path)"
          };
        }

        const stores = await openPlanningStores(ctx);
        const store = stores.taskStore;
        const existing = store.getAllTasks();
        const planRef = `planning:${planningType}:${new Date().toISOString()}`;
        const capturedKeys = Object.keys(artifact.sourceAnswers).sort();

        if (useDraftDecomposition) {
          const ts = new Date().toISOString();
          const built = buildTasksFromExecutionDrafts({
            drafts: executionDraftsRaw,
            existingTasks: existing,
            planningType,
            planRef,
            capturedAnswerKeys: capturedKeys,
            timestamp: ts
          });
          if (!built.ok) {
            return { ok: false, code: built.code, message: built.message };
          }
          if (
            planningStrictValidationEnabled({
              effectiveConfig: ctx.effectiveConfig as Record<string, unknown> | undefined
            })
          ) {
            const strictIssue = validateTaskSetForStrictMode([...existing, ...built.tasks]);
            if (strictIssue) {
              return { ok: false, code: "strict-task-validation-failed", message: strictIssue };
            }
          }
          if (persistTasks) {
            return {
              ok: false,
              code: "planning-multi-task-persist-delegated",
              message:
                "When executionTaskDrafts is set, build-plan stays in legacy preview mode and does not persist tasks (persistTasks must be false); materialize drafts with workspace-kit run persist-planning-execution-drafts (include expectedPlanningGeneration when policy requires it)."
            };
          }
          await clearBuildPlanSessionWithPlanningSync(ctx, { commandName: "build-plan" });
          await clearBuildPlanActivity(ctx);
          return {
            ok: true,
            code: "planning-multi-task-decomposition-preview",
            message: `Legacy build-plan finalize preview produced ${built.tasks.length} convert-wishlist-compatible execution task draft(s) (preview only)`,
            data: {
              responseSchemaVersion: 1,
              planningType,
              descriptor,
              outputMode,
              persistTasks: false,
              scaffoldVersion: 3,
              status: "multi-task-decomposition-preview",
              unresolvedCritical: [],
              adaptiveWarnings,
              adaptiveFollowups,
              scoringHints,
              capturedAnswers: answers,
              artifact,
              recommendedNextCommands,
              taskOutputs: built.tasks,
              planningDecomposition: {
                schemaVersion: 1,
                kind: "execution-task-drafts",
                planningType,
                planRef,
                convertWishlistTaskRowCompatible: true,
                taskCount: built.tasks.length
              },
              provenance: {
                planRef,
                outputMode,
                persistedTaskIds: [],
                suggestedTaskIds: built.tasks.map((t) => t.id)
              },
              cliGuidance: toCliGuidance({
                planningType,
                answers,
                unresolvedCriticalCount: 0,
                totalCriticalCount,
                finalize: true,
                outputMode
              })
            }
          };
        }

        const taskType =
          typeof args.taskType === "string" && args.taskType.trim().length > 0
            ? args.taskType.trim()
            : "task";
        const taskPriority =
          typeof args.taskPriority === "string" && ["P1", "P2", "P3"].includes(args.taskPriority)
            ? (args.taskPriority as TaskPriority)
            : undefined;
        const plannedTaskId = nextTaskId(existing);
        const scopeFromArtifact =
          artifact.candidateFeaturesOrChanges.length > 0
            ? artifact.candidateFeaturesOrChanges
            : artifact.goals;
        const criteriaFromSignals =
          typeof answers.successSignals === "string" && answers.successSignals.trim().length > 0
            ? [answers.successSignals.trim()]
            : [];
        const task: TaskEntity = {
          id: plannedTaskId,
          title:
            artifact.goals[0] && artifact.goals[0].trim().length > 0
              ? artifact.goals[0].trim()
              : `${descriptor?.title ?? planningType} task output`,
          type: taskType,
          status: "proposed",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          priority: taskPriority,
          phase: typeof args.taskPhase === "string" ? args.taskPhase : undefined,
          approach:
            typeof answers.approach === "string" && answers.approach.trim().length > 0
              ? answers.approach
              : artifact.approach,
          technicalScope: scopeFromArtifact.length > 0 ? scopeFromArtifact : undefined,
          acceptanceCriteria:
            criteriaFromSignals.length > 0
              ? criteriaFromSignals
              : ["Task output reviewed and refined from planning artifact."],
          metadata: {
            planRef,
            planningProvenance: {
              planningType,
              outputMode,
              capturedAnswerKeys: Object.keys(artifact.sourceAnswers).sort()
            }
          }
        };
        const knownTypeValidationError = validateKnownTaskTypeRequirements(task);
        if (knownTypeValidationError) {
          return {
            ok: false,
            code: knownTypeValidationError.code,
            message: knownTypeValidationError.message
          };
        }
        if (persistTasks) {
          if (store.getTask(task.id)) {
            return {
              ok: false,
              code: "duplicate-task-id",
              message: `Task '${task.id}' already exists`
            };
          }
          const bpGate = enforcePlanningGenerationPolicy(
            getPlanningGenerationPolicy({
              effectiveConfig: ctx.effectiveConfig as Record<string, unknown> | undefined
            }),
            args as Record<string, unknown>
          );
          if (!bpGate.ok) {
            return { ok: false, code: bpGate.code, message: bpGate.message };
          }
          stores.sqliteDual.withTransaction(
            () => {
              stores.taskStore.addTask(task);
            },
            planningConcurrencySaveOpts(args as Record<string, unknown>)
          );
        }
        await clearBuildPlanSessionWithPlanningSync(ctx, { commandName: "build-plan" });
        await clearBuildPlanActivity(ctx);
        return {
          ok: true,
          code: persistTasks ? "planning-task-output-created" : "planning-task-output-preview",
          message: persistTasks
            ? `Legacy build-plan task output persisted as '${task.id}'`
            : "Legacy build-plan task output prepared (preview only; prefer PlanArtifact draft/finalize for the primary flow)",
          data: {
            responseSchemaVersion: 1,
            planningType,
            descriptor,
            outputMode,
            persistTasks,
            scaffoldVersion: 3,
            status: persistTasks ? "task-output-created" : "task-output-preview",
            unresolvedCritical: [],
            adaptiveWarnings,
            adaptiveFollowups,
            scoringHints,
            capturedAnswers: answers,
            artifact,
            recommendedNextCommands,
            taskOutputs: [task],
            provenance: {
              planRef,
              outputMode,
              persistedTaskIds: persistTasks ? [task.id] : [],
              suggestedTaskIds: [task.id]
            },
            cliGuidance: toCliGuidance({
              planningType,
              answers,
              unresolvedCriticalCount: 0,
              totalCriticalCount,
              finalize: true,
              outputMode
            })
          }
        };
      }

      return {
        ok: false,
        code: "invalid-planning-output-mode",
        message: `build-plan reached an unsupported outputMode branch: ${outputMode}`
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
