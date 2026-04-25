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
  validateWishlistContentFields,
  allocateNextTaskNumericId,
  taskEntityFromNewIntake,
  clearBuildPlanSession,
  persistBuildPlanSession,
  type TaskEntity,
  type TaskPriority
} from "../../core/planning/index.js";
import { builtinInstructionEntriesForModule } from "../../contracts/builtin-run-command-manifest.js";
import {
  enforcePlanningGenerationPolicy,
  getPlanningGenerationPolicy,
  planningStrictValidationEnabled
} from "../task-engine/planning-config.js";
import {
  buildTaskFromConversionPayload,
  planningConcurrencySaveOpts,
  TASK_ID_RE
} from "../task-engine/mutation-utils.js";
import { validateTaskSetForStrictMode } from "../task-engine/strict-task-validation.js";

type PlanningOutputMode = "wishlist" | "tasks" | "response";

function resolveOutputMode(args: Record<string, unknown>): {
  ok: true;
  mode: PlanningOutputMode;
} | {
  ok: false;
  message: string;
} {
  const raw = typeof args.outputMode === "string" ? args.outputMode.trim() : "";
  if (raw === "") {
    return { ok: true, mode: "wishlist" };
  }
  if (raw === "wishlist" || raw === "tasks" || raw === "response") {
    return { ok: true, mode: raw };
  }
  return {
    ok: false,
    message: "build-plan outputMode must be one of: wishlist, tasks, response"
  };
}

function maxNumericTaskIdFromIds(ids: Iterable<string>): number {
  let max = 0;
  for (const id of ids) {
    const match = /^T(\d+)$/.exec(id);
    if (!match) continue;
    const parsed = Number(match[1]);
    if (Number.isFinite(parsed)) {
      max = Math.max(max, parsed);
    }
  }
  return max;
}

function nextTaskId(tasks: TaskEntity[]): string {
  return `T${maxNumericTaskIdFromIds(tasks.map((t) => t.id)) + 1}`;
}

/**
 * Build execution tasks from operator-supplied drafts (convert-wishlist-compatible rows).
 * Allocates T### ids for rows missing or holding invalid ids; rejects duplicates against the store and within the batch.
 */
function buildTasksFromExecutionDrafts(args: {
  drafts: unknown;
  existingTasks: TaskEntity[];
  planningType: string;
  planRef: string;
  capturedAnswerKeys: string[];
  timestamp: string;
}):
  | { ok: true; tasks: TaskEntity[] }
  | { ok: false; code: string; message: string } {
  if (!Array.isArray(args.drafts) || args.drafts.length === 0) {
    return {
      ok: false,
      code: "invalid-execution-task-drafts",
      message: "executionTaskDrafts must be a non-empty array of task objects"
    };
  }
  const existingIds = new Set(args.existingTasks.map((t) => t.id));
  let nextAlloc = maxNumericTaskIdFromIds(existingIds);
  const assignedIds: string[] = [];
  const normalizedRows: Record<string, unknown>[] = [];

  for (const raw of args.drafts) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      return {
        ok: false,
        code: "invalid-execution-task-drafts",
        message: "Each executionTaskDrafts entry must be an object"
      };
    }
    const row = { ...(raw as Record<string, unknown>) };
    const idRaw = typeof row.id === "string" ? row.id.trim() : "";
    let id = idRaw;
    if (!TASK_ID_RE.test(id)) {
      nextAlloc += 1;
      id = `T${nextAlloc}`;
      row.id = id;
    }
    if (existingIds.has(id) || assignedIds.includes(id)) {
      return {
        ok: false,
        code: "duplicate-task-id",
        message: `executionTaskDrafts references duplicate or existing task id '${id}'`
      };
    }
    assignedIds.push(id);
    normalizedRows.push(row);
  }

  const built: TaskEntity[] = [];
  for (const row of normalizedRows) {
    const bt = buildTaskFromConversionPayload(row, args.timestamp);
    if (!bt.ok) {
      return { ok: false, code: "invalid-execution-task-drafts", message: bt.message };
    }
    const knownTypeValidationError = validateKnownTaskTypeRequirements(bt.task);
    if (knownTypeValidationError) {
      return {
        ok: false,
        code: knownTypeValidationError.code,
        message: knownTypeValidationError.message
      };
    }
    const withProv: TaskEntity = {
      ...bt.task,
      metadata: {
        ...(bt.task.metadata ?? {}),
        planRef: args.planRef,
        planningProvenance: {
          planningType: args.planningType,
          outputMode: "tasks",
          source: "build-plan-execution-drafts",
          capturedAnswerKeys: args.capturedAnswerKeys
        }
      }
    };
    built.push(withProv);
  }

  return { ok: true, tasks: built };
}

function findMissingAnsweredQuestions(
  questions: { id: string }[],
  answers: Record<string, unknown>
): { id: string }[] {
  return questions.filter((q) => {
    const value = answers[q.id];
    return !(typeof value === "string" && value.trim().length > 0);
  });
}

function toNormalizedText(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function buildScoringHints(args: {
  planningType: string;
  answers: Record<string, unknown>;
  unresolvedCriticalCount: number;
  unresolvedAdaptiveCount: number;
}): Record<string, unknown> | null {
  const { planningType, answers, unresolvedCriticalCount, unresolvedAdaptiveCount } = args;
  const signals = [
    toNormalizedText(answers.complexity),
    toNormalizedText(answers.riskPriority),
    toNormalizedText(answers.timeline),
    toNormalizedText(answers.compatibilityRisk)
  ];
  const hasSignal = signals.some((s) => s.length > 0) || unresolvedCriticalCount > 0 || unresolvedAdaptiveCount > 0;
  if (!hasSignal) {
    return null;
  }

  let riskScore = Math.min(100, unresolvedCriticalCount * 20 + unresolvedAdaptiveCount * 10);
  if (signals.some((s) => s.includes("high") || s.includes("critical"))) {
    riskScore = Math.min(100, riskScore + 20);
  }
  const effortScore = Math.min(
    100,
    30 +
      unresolvedCriticalCount * 10 +
      unresolvedAdaptiveCount * 5 +
      (signals.some((s) => s.includes("high")) ? 15 : 0)
  );
  const orderingScore = Math.min(
    100,
    40 + unresolvedCriticalCount * 8 + (planningType === "task-ordering" ? 15 : 0) + (planningType === "sprint-phase" ? 10 : 0)
  );
  const classify = (score: number): "low" | "medium" | "high" => {
    if (score >= 70) return "high";
    if (score >= 40) return "medium";
    return "low";
  };
  return {
    schemaVersion: 1,
    effort: { score: effortScore, level: classify(effortScore) },
    risk: { score: riskScore, level: classify(riskScore) },
    ordering: {
      score: orderingScore,
      level: classify(orderingScore),
      recommendedStrategy:
        riskScore >= 70 ? "risk-first" : orderingScore >= 60 ? "dependency-first" : "balanced"
    }
  };
}

async function persistInterviewSnapshot(
  workspacePath: string,
  args: {
    planningType: string;
    outputMode: PlanningOutputMode;
    status: string;
    answers: Record<string, unknown>;
    cliGuidance: Record<string, unknown>;
  }
): Promise<void> {
  const cg = args.cliGuidance;
  const completionPct = typeof cg.completionPct === "number" ? cg.completionPct : 0;
  const answeredCritical = typeof cg.answeredCritical === "number" ? cg.answeredCritical : 0;
  const totalCritical = typeof cg.totalCritical === "number" ? cg.totalCritical : 0;
  const resumeCli =
    typeof cg.suggestedNextCommand === "string" ? cg.suggestedNextCommand : "";
  await persistBuildPlanSession(workspacePath, {
    planningType: args.planningType,
    outputMode: args.outputMode,
    status: args.status,
    completionPct,
    answeredCritical,
    totalCritical,
    answers: args.answers,
    resumeCli
  });
}

function toCliGuidance(args: {
  planningType: string;
  answers: Record<string, unknown>;
  unresolvedCriticalCount: number;
  totalCriticalCount: number;
  finalize?: boolean;
  outputMode?: PlanningOutputMode;
}): Record<string, unknown> {
  const { planningType, answers, unresolvedCriticalCount, totalCriticalCount, finalize, outputMode } = args;
  const answeredCritical = Math.max(0, totalCriticalCount - unresolvedCriticalCount);
  const completionPct = totalCriticalCount > 0 ? Math.round((answeredCritical / totalCriticalCount) * 100) : 100;
  return {
    answeredCritical,
    totalCritical: totalCriticalCount,
    completionPct,
    suggestedNextCommand: `workspace-kit run build-plan '${JSON.stringify({
      planningType,
      answers,
      finalize: finalize === true,
      outputMode: outputMode ?? "wishlist"
    })}'`
  };
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
        await clearBuildPlanSession(ctx.workspacePath);
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
      const resolvedRulePack = resolvePlanningRulePack(
        planningType as PlanningWorkflowType,
        ctx.effectiveConfig as Record<string, unknown> | undefined
      );
      const totalCriticalCount = resolvedRulePack.baseQuestions.length;
      const answers =
        typeof args.answers === "object" && args.answers !== null && !Array.isArray(args.answers)
          ? (args.answers as Record<string, unknown>)
          : {};
      const createWishlist = args.createWishlist !== false;
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
          await persistInterviewSnapshot(ctx.workspacePath, {
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
        await persistInterviewSnapshot(ctx.workspacePath, {
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
        await persistInterviewSnapshot(ctx.workspacePath, {
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
        await persistInterviewSnapshot(ctx.workspacePath, {
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
        await clearBuildPlanSession(ctx.workspacePath);
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
                "When executionTaskDrafts is set, build-plan does not persist tasks (persistTasks must be false); materialize drafts with workspace-kit run persist-planning-execution-drafts (include expectedPlanningGeneration when policy requires it)."
            };
          }
          await clearBuildPlanSession(ctx.workspacePath);
          return {
            ok: true,
            code: "planning-multi-task-decomposition-preview",
            message: `Planning finalize produced ${built.tasks.length} convert-wishlist-compatible execution task draft(s) (preview only)`,
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
        await clearBuildPlanSession(ctx.workspacePath);
        return {
          ok: true,
          code: persistTasks ? "planning-task-output-created" : "planning-task-output-preview",
          message: persistTasks
            ? `Planning task output persisted as '${task.id}'`
            : "Planning task output prepared (preview only; set persistTasks=true to write)",
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

      if (!finalize || !createWishlist) {
        await clearBuildPlanSession(ctx.workspacePath);
        return {
          ok: true,
          code: "planning-wishlist-ready",
          message: `Planning interview complete for ${planningType}; wishlist artifact ready`,
          data: {
            responseSchemaVersion: 1,
            planningType,
            descriptor,
            outputMode,
            scaffoldVersion: 3,
            status: "ready-for-wishlist",
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
              finalize: createWishlist,
              outputMode
            })
          }
        };
      }

      const stores = await openPlanningStores(ctx);
      const now = new Date().toISOString();
      const intake = {
        title:
          typeof args.title === "string" && args.title.trim().length > 0
            ? args.title.trim()
            : `${descriptor?.title ?? planningType} plan artifact`,
        problemStatement:
          typeof answers.problemStatement === "string"
            ? answers.problemStatement
            : typeof answers.featureGoal === "string"
              ? answers.featureGoal
              : "Planning artifact generated from guided workflow.",
        expectedOutcome:
          typeof answers.expectedOutcome === "string"
            ? answers.expectedOutcome
            : "Clear, reviewable planning artifact for execution decomposition.",
        impact:
          typeof answers.impact === "string" ? answers.impact : "Improved planning quality and delivery confidence.",
        constraints:
          typeof answers.constraints === "string"
            ? answers.constraints
            : artifact.risksAndConstraints.join("; ") || "None explicitly provided.",
        successSignals:
          typeof answers.successSignals === "string"
            ? answers.successSignals
            : "Critical questions answered and artifact accepted by operators.",
        requestor:
          typeof args.requestor === "string" && args.requestor.trim().length > 0
            ? args.requestor.trim()
            : ctx.resolvedActor ?? "planning-module",
        evidenceRef:
          typeof args.evidenceRef === "string" && args.evidenceRef.trim().length > 0
            ? args.evidenceRef.trim()
            : `planning:${planningType}:${now}`
      };
      const valid = validateWishlistContentFields(intake);
      if (!valid.ok) {
        return {
          ok: false,
          code: "invalid-planning-artifact",
          message: valid.errors.join("; ")
        };
      }

      const taskId = allocateNextTaskNumericId(stores.taskStore.getAllTasks());
      const task = taskEntityFromNewIntake(intake, taskId, now, {
        planningType,
        artifactSchemaVersion: artifact.schemaVersion,
        artifact
      });
      const typeErr = validateKnownTaskTypeRequirements(task);
      if (typeErr) {
        return { ok: false, code: typeErr.code, message: typeErr.message };
      }
      if (planningStrictValidationEnabled({ effectiveConfig: ctx.effectiveConfig as Record<string, unknown> | undefined })) {
        const strictIssue = validateTaskSetForStrictMode([...stores.taskStore.getAllTasks(), task]);
        if (strictIssue) {
          return { ok: false, code: "strict-task-validation-failed", message: strictIssue };
        }
      }
      const bpWishGate = enforcePlanningGenerationPolicy(
        getPlanningGenerationPolicy({
          effectiveConfig: ctx.effectiveConfig as Record<string, unknown> | undefined
        }),
        args as Record<string, unknown>
      );
      if (!bpWishGate.ok) {
        return { ok: false, code: bpWishGate.code, message: bpWishGate.message };
      }
      try {
        stores.sqliteDual.withTransaction(
          () => {
            stores.taskStore.addTask(task);
          },
          planningConcurrencySaveOpts(args as Record<string, unknown>)
        );
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return { ok: false, code: "invalid-planning-artifact", message: msg };
      }
      await clearBuildPlanSession(ctx.workspacePath);
      return {
        ok: true,
        code: "planning-artifact-created",
        message: `Planning artifact created as wishlist intake task ${taskId}`,
        data: {
          responseSchemaVersion: 1,
          planningType,
          descriptor,
          outputMode,
          scaffoldVersion: 3,
          status: "artifact-created",
          wishlistId: taskId,
          taskId,
          adaptiveWarnings,
          artifact,
          unresolvedCritical: [],
          adaptiveFollowups,
          scoringHints,
          capturedAnswers: answers,
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
