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
  buildWishlistItemFromIntake,
  validateWishlistIntakePayload,
  type WishlistItem,
  type TaskEntity,
  type TaskPriority
} from "../../core/planning/index.js";

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

function nextWishlistId(items: WishlistItem[]): string {
  let max = 0;
  for (const item of items) {
    const match = /^W(\d+)$/.exec(item.id);
    if (!match) continue;
    const parsed = Number(match[1]);
    if (Number.isFinite(parsed)) {
      max = Math.max(max, parsed);
    }
  }
  return `W${max + 1}`;
}

function nextTaskId(tasks: TaskEntity[]): string {
  let max = 0;
  for (const task of tasks) {
    const match = /^T(\d+)$/.exec(task.id);
    if (!match) continue;
    const parsed = Number(match[1]);
    if (Number.isFinite(parsed)) {
      max = Math.max(max, parsed);
    }
  }
  return `T${max + 1}`;
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
    version: "0.1.0",
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
        },
        {
          name: "explain-planning-rules",
          file: "explain-planning-rules.md",
          description: "Explain effective planning defaults and rule packs for a workflow type."
        }
      ]
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
              nextQuestions: [...missingCritical, ...adaptiveFollowups],
              scoringHints,
              capturedAnswers: answers,
              cliGuidance: toCliGuidance({
                planningType,
                answers,
                unresolvedCriticalCount: missingCritical.length,
                totalCriticalCount,
                outputMode
              })
            }
          };
        }
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
            cliGuidance: toCliGuidance({
              planningType,
              answers,
              unresolvedCriticalCount: missingCritical.length,
              totalCriticalCount,
              finalize: true,
              outputMode
            })
          }
        };
      }
      if (finalize && unresolvedAdaptive.length > 0 && config.adaptiveFinalizePolicy === "block") {
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
      const adaptiveWarnings =
        finalize && unresolvedAdaptive.length > 0 && config.adaptiveFinalizePolicy === "warn"
          ? unresolvedAdaptive
          : [];
      if (missingCritical.length > 0) {
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
            cliGuidance: toCliGuidance({
              planningType,
              answers,
              unresolvedCriticalCount: missingCritical.length,
              totalCriticalCount,
              outputMode
            })
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
        const taskType = typeof args.taskType === "string" && args.taskType.trim().length > 0
          ? args.taskType.trim()
          : "task";
        const taskPriority =
          typeof args.taskPriority === "string" && ["P1", "P2", "P3"].includes(args.taskPriority)
            ? args.taskPriority as TaskPriority
            : undefined;
        const stores = await openPlanningStores(ctx);
        const store = stores.taskStore;
        const plannedTaskId = nextTaskId(store.getAllTasks());
        const planRef = `planning:${planningType}:${new Date().toISOString()}`;
        const scopeFromArtifact = artifact.candidateFeaturesOrChanges.length > 0
          ? artifact.candidateFeaturesOrChanges
          : artifact.goals;
        const criteriaFromSignals = typeof answers.successSignals === "string" && answers.successSignals.trim().length > 0
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
          store.addTask(task);
          await store.save();
        }
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
      const wishlist = await stores.openWishlist();
      const wishlistId = nextWishlistId(wishlist.getAllItems());
      const now = new Date().toISOString();
      const intake = {
        id: wishlistId,
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
      const valid = validateWishlistIntakePayload(intake);
      if (!valid.ok) {
        return {
          ok: false,
          code: "invalid-planning-artifact",
          message: valid.errors.join("; ")
        };
      }

      const item = buildWishlistItemFromIntake(intake, now);
      item.updatedAt = now;
      (item as WishlistItem & { metadata?: Record<string, unknown> }).metadata = {
        planningType,
        artifactSchemaVersion: artifact.schemaVersion,
        artifact
      };
      wishlist.addItem(item);
      await wishlist.save();
      return {
        ok: true,
        code: "planning-artifact-created",
        message: `Planning artifact created as wishlist item ${wishlistId}`,
        data: {
          responseSchemaVersion: 1,
          planningType,
          descriptor,
          outputMode,
          scaffoldVersion: 3,
          status: "artifact-created",
          wishlistId,
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
