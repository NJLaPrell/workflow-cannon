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
import { openPlanningStores } from "../task-engine/planning-open.js";
import {
  buildWishlistItemFromIntake,
  validateWishlistIntakePayload
} from "../task-engine/wishlist-validation.js";
import type { WishlistItem } from "../task-engine/wishlist-types.js";

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
      if (finalize && missingCritical.length > 0) {
        if (!config.hardBlockCriticalUnknowns) {
          return {
            ok: true,
            code: "planning-ready-with-warnings",
            message: `Finalize allowed with unresolved critical questions because planning.hardBlockCriticalUnknowns=false`,
            data: {
              planningType,
              status: "ready-with-warnings",
              unresolvedCritical: missingCritical,
              nextQuestions: [...missingCritical, ...adaptiveFollowups],
              capturedAnswers: answers
            }
          };
        }
        return {
          ok: false,
          code: "planning-critical-unknowns",
          message: `Cannot finalize ${planningType}: unresolved critical questions (${missingCritical.map((q) => q.id).join(", ")})`,
          data: {
            planningType,
            unresolvedCritical: missingCritical,
            nextQuestions: [...missingCritical, ...adaptiveFollowups]
          }
        };
      }
      if (missingCritical.length > 0) {
        return {
          ok: true,
          code: "planning-questions",
          message: `${missingCritical.length} critical planning questions require answers before finalize`,
          data: {
            planningType,
            status: "needs-input",
            unresolvedCritical: missingCritical,
            nextQuestions: [...missingCritical, ...adaptiveFollowups]
          }
        };
      }
      const unresolvedIds = missingCritical.map((q) => q.id);
      const artifact = composePlanningWishlistArtifact({
        planningType: planningType as PlanningWorkflowType,
        answers,
        unresolvedCriticalQuestionIds: unresolvedIds
      });
      if (!finalize || !createWishlist) {
        return {
          ok: true,
          code: "planning-ready",
          message: `Planning interview complete for ${planningType}; artifact ready`,
          data: {
            planningType,
            descriptor,
            scaffoldVersion: 3,
            status: "ready-for-artifact",
            unresolvedCritical: [],
            adaptiveFollowups,
            capturedAnswers: answers,
            artifact
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
          planningType,
          descriptor,
          scaffoldVersion: 3,
          status: "artifact-created",
          wishlistId,
          artifact,
          unresolvedCritical: [],
          adaptiveFollowups,
          capturedAnswers: answers
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
          planningType,
          defaultQuestionDepth: config.depth,
          hardBlockCriticalUnknowns: config.hardBlockCriticalUnknowns,
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
