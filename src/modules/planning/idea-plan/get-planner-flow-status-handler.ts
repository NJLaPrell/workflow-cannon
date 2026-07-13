import type { ModuleCommandResult, ModuleLifecycleContext } from "../../../contracts/module-contract.js";
import { openPlanningStores } from "../../../core/planning/index.js";
import { attachPolicyMeta } from "../../task-engine/attach-planning-response-meta.js";
import { getPlanningGenerationPolicy } from "../../task-engine/planning-config.js";
import { TaskEngineError } from "../../task-engine/transitions.js";
import { readIdeaPlanArtifact } from "./idea-plan-artifact-storage.js";
import { readActiveDraftPlanArtifact } from "./idea-planning-metadata.js";
import { getIdea, isIdeaId, listIdeas } from "../idea-row/idea-store.js";
import {
  buildPlannerFlowStatusSnapshot,
  type PlannerFlowStatusSnapshot
} from "./planner-flow-status.js";
import { getPlanningChatSession } from "./planning-chat-session.js";

function cleanString(raw: unknown): string | undefined {
  return typeof raw === "string" && raw.trim() ? raw.trim() : undefined;
}

function successResult(
  snapshot: PlannerFlowStatusSnapshot,
  ctx: ModuleLifecycleContext,
  planningGeneration: number
): ModuleCommandResult {
  const data: Record<string, unknown> = { ...snapshot };
  attachPolicyMeta(data, ctx, planningGeneration);
  return {
    ok: true,
    code: "planner-flow-status",
    message: `Planner golden-path stage: ${snapshot.goldenPathStage}`,
    data
  };
}

export async function runGetPlannerFlowStatus(
  args: Record<string, unknown>,
  ctx: ModuleLifecycleContext,
  _instructionPath: string
): Promise<ModuleCommandResult> {
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
  const workspacePath = ctx.workspacePath ?? process.cwd();
  const planningGeneration = planning.sqliteDual.getPlanningGeneration();
  const planningPolicy = getPlanningGenerationPolicy({
    effectiveConfig: ctx.effectiveConfig as Record<string, unknown> | undefined
  });

  const ideas = listIdeas(db);
  const ideaCount = ideas.length;
  const requestedIdeaId = cleanString(args.ideaId ?? args.id);

  if (requestedIdeaId && !isIdeaId(requestedIdeaId)) {
    return {
      ok: false,
      code: "invalid-args",
      message: "get-planner-flow-status ideaId must be shaped like I001 when provided."
    };
  }

  if (ideaCount === 0) {
    return successResult(
      buildPlannerFlowStatusSnapshot({
        ideaCount: 0,
        planningGeneration,
        planningPolicy
      }),
      ctx,
      planningGeneration
    );
  }

  if (requestedIdeaId) {
    const idea = getIdea(db, requestedIdeaId);
    if (!idea) {
      return {
        ok: false,
        code: "idea-not-found",
        message: `Idea ${requestedIdeaId} was not found.`,
        data: { responseSchemaVersion: 1, ideaId: requestedIdeaId, ideaCount }
      };
    }
    const planRef = idea.linkedPlanArtifact ?? readActiveDraftPlanArtifact(db, idea.id);
    const document = planRef ? readIdeaPlanArtifact(workspacePath, planRef) : null;
    const session = getPlanningChatSession(db, idea.id);

    return successResult(
      buildPlannerFlowStatusSnapshot({
        ideaCount,
        ideaId: idea.id,
        planRef,
        planId: document?.planId,
        document,
        sessionStatus: session?.status,
        planningGeneration,
        planningPolicy
      }),
      ctx,
      planningGeneration
    );
  }

  const idea = ideas[0];
  if (!idea) {
    return successResult(
      buildPlannerFlowStatusSnapshot({
        ideaCount,
        planningGeneration,
        planningPolicy
      }),
      ctx,
      planningGeneration
    );
  }

  const planRef = idea.linkedPlanArtifact ?? readActiveDraftPlanArtifact(db, idea.id);
  const document = planRef ? readIdeaPlanArtifact(workspacePath, planRef) : null;
  const session = getPlanningChatSession(db, idea.id);

  return successResult(
    buildPlannerFlowStatusSnapshot({
      ideaCount,
      ideaId: idea.id,
      planRef,
      planId: document?.planId,
      document,
      sessionStatus: session?.status,
      planningGeneration,
      planningPolicy
    }),
    ctx,
    planningGeneration
  );
}
