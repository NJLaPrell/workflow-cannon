import type { ModuleCommandResult, ModuleLifecycleContext } from "../../contracts/module-contract.js";
import { openPlanningStores } from "../../core/planning/index.js";
import { attachPolicyMeta } from "../task-engine/attach-planning-response-meta.js";
import { planningGenPolicyGate } from "../task-engine/planning-generation-gate.js";
import { digestPayload, readIdempotencyValue } from "../task-engine/mutation-utils.js";
import { TaskEngineError } from "../task-engine/transitions.js";
import { applyBrainstormSectionSynthesis } from "./brainstorm-section-synthesis.js";
import { enforceIdeaPlanStatusTransition, IdeaPlanStatusTransitionError } from "./idea-plan-status-machine.js";
import {
  readIdeaPlanArtifact,
  writeNextIdeaPlanArtifactVersion
} from "./idea-plan-artifact-storage.js";
import { loadIdeaPlanStateSchema } from "./idea-plan-state-schema-loader.js";
import { guardIdeaPlanStateSchemaLoad } from "./idea-plan-state-schema-guard.js";
import type { IdeaPlanDocument } from "./idea-plan-types.js";
import { getIdea } from "./idea-store.js";
import { validateBrainstormSectionForPlanning } from "./validate-brainstorm-section.js";

const IDEMPOTENCY_MODULE_PREFIX = "ideas-complete-brainstorm-idempotency:";

export type CompleteBrainstormResultV1 = {
  responseSchemaVersion: 1;
  planRef: string;
  planId: string;
  version: number;
  status: IdeaPlanDocument["status"];
  ideaId: string;
  brainstorm: NonNullable<IdeaPlanDocument["brainstorm"]>;
  plan: NonNullable<IdeaPlanDocument["plan"]>;
  replayed?: boolean;
};

type CompleteBrainstormIdempotencyStateV1 = {
  schemaVersion: 1;
  payloadDigest: string;
  result: CompleteBrainstormResultV1;
};

function cleanString(raw: unknown): string | undefined {
  return typeof raw === "string" && raw.trim() ? raw.trim() : undefined;
}

function completePayloadDigest(planRef: string): string {
  return digestPayload({ planRef });
}

function successResult(
  code: "brainstorm-completed" | "brainstorm-complete-idempotent-replay",
  message: string,
  result: CompleteBrainstormResultV1,
  ctx: ModuleLifecycleContext,
  planningGeneration: number,
  warnings?: string[]
): ModuleCommandResult {
  const data: Record<string, unknown> = { ...result };
  attachPolicyMeta(data, ctx, planningGeneration, warnings);
  return { ok: true, code, message, data };
}

export async function runCompleteBrainstorm(
  args: Record<string, unknown>,
  ctx: ModuleLifecycleContext,
  instructionPath: string
): Promise<ModuleCommandResult> {
  const planRef = cleanString(args.planRef);
  if (!planRef) {
    return {
      ok: false,
      code: "invalid-args",
      message: "complete-brainstorm requires planRef shaped like plan-artifact:<planId>"
    };
  }

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

  const workspacePath = ctx.workspacePath ?? process.cwd();
  const planningGeneration = planning.sqliteDual.getPlanningGeneration();
  const pg = planningGenPolicyGate(ctx, args, instructionPath, planningGeneration);
  if (pg.block) {
    return pg.block;
  }

  const clientMutationId = readIdempotencyValue(args);
  const digest = completePayloadDigest(planRef);
  const db = planning.sqliteDual.getDatabase();

  if (clientMutationId) {
    const priorRow = db
      .prepare("SELECT state_json FROM workspace_module_state WHERE module_id = ?")
      .get(`${IDEMPOTENCY_MODULE_PREFIX}${clientMutationId}`) as { state_json: string } | undefined;
    if (priorRow?.state_json) {
      try {
        const prior = JSON.parse(priorRow.state_json) as CompleteBrainstormIdempotencyStateV1;
        if (prior.schemaVersion === 1 && prior.payloadDigest === digest && prior.result) {
          return successResult(
            "brainstorm-complete-idempotent-replay",
            `complete-brainstorm idempotent replay for ${planRef}`,
            { ...prior.result, replayed: true },
            ctx,
            planningGeneration,
            pg.warnings
          );
        }
        if (prior.payloadDigest !== digest) {
          return {
            ok: false,
            code: "idempotency-key-conflict",
            message: `clientMutationId '${clientMutationId}' was already used for a different complete-brainstorm payload`
          };
        }
      } catch {
        // ignore malformed idempotency row
      }
    }
  }

  const existing = readIdeaPlanArtifact(workspacePath, planRef);
  if (!existing) {
    return {
      ok: false,
      code: "idea-plan-not-found",
      message: `No IdeaPlan artifact found for ${planRef}.`,
      data: { responseSchemaVersion: 1, planRef }
    };
  }

  if (existing.status !== "brainstorming") {
    return {
      ok: false,
      code: "idea-plan-status-invalid",
      message: `complete-brainstorm requires status brainstorming (current: ${existing.status})`,
      data: { responseSchemaVersion: 1, planRef, status: existing.status }
    };
  }

  const ideaId = cleanString(args.ideaId);
  if (ideaId && ideaId !== existing.ideaId) {
    return {
      ok: false,
      code: "idea-plan-mismatch",
      message: `ideaId '${ideaId}' does not match IdeaPlan document ideaId '${existing.ideaId}'.`,
      data: { responseSchemaVersion: 1, planRef, ideaId, documentIdeaId: existing.ideaId }
    };
  }

  const validation = validateBrainstormSectionForPlanning(existing.brainstorm);
  if (!validation.ok) {
    return {
      ok: false,
      code: validation.code,
      message: validation.message,
      data: {
        responseSchemaVersion: 1,
        planRef,
        ...(validation.field ? { field: validation.field } : {}),
        ...(validation.sessionIndex !== undefined ? { sessionIndex: validation.sessionIndex } : {})
      }
    };
  }

  const idea = getIdea(db, existing.ideaId);
  const planTitle = cleanString(args.planTitle) ?? idea?.title ?? "Idea plan";
  const planSummary =
    cleanString(args.planSummary) ?? "Author structured plan sections from brainstorm synthesis.";
  const planningType = cleanString(args.planningType);

  const nowIso = new Date().toISOString();
  let nextStatus: IdeaPlanDocument["status"];
  try {
    nextStatus = enforceIdeaPlanStatusTransition(existing.status, "planning");
  } catch (err) {
    if (err instanceof IdeaPlanStatusTransitionError) {
      return {
        ok: false,
        code: err.code,
        message: err.message,
        data: { responseSchemaVersion: 1, planRef, fromStatus: existing.status, toStatus: "planning" }
      };
    }
    throw err;
  }

  const brainstorm = applyBrainstormSectionSynthesis(existing.brainstorm!);
  const schemaLoad = loadIdeaPlanStateSchema("planning", workspacePath);
  const schemaGuard = guardIdeaPlanStateSchemaLoad(schemaLoad);
  if (!schemaGuard.ok) {
    return {
      ok: false,
      code: schemaGuard.code,
      message: schemaGuard.message,
      data: { responseSchemaVersion: 1, planRef, ...schemaGuard.data }
    };
  }
  const planningDirective = schemaGuard.agentDirective;

  const updated: IdeaPlanDocument = {
    ...existing,
    status: nextStatus,
    updatedAt: nowIso,
    agentDirective: planningDirective,
    brainstorm,
    plan: {
      title: planTitle,
      summary: planSummary,
      ...(planningType ? { planningType } : {}),
      wbsRowCount: 0
    }
  };

  const persisted = writeNextIdeaPlanArtifactVersion(workspacePath, updated, { sqliteDb: db });
  const result: CompleteBrainstormResultV1 = {
    responseSchemaVersion: 1,
    planRef: persisted.planRef,
    planId: persisted.planId,
    version: persisted.version,
    status: persisted.status,
    ideaId: persisted.ideaId,
    brainstorm: persisted.brainstorm!,
    plan: persisted.plan!
  };

  if (clientMutationId) {
    const record: CompleteBrainstormIdempotencyStateV1 = {
      schemaVersion: 1,
      payloadDigest: digest,
      result
    };
    db.prepare(
      `INSERT INTO workspace_module_state (module_id, state_schema_version, state_json, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(module_id) DO UPDATE SET
         state_schema_version=excluded.state_schema_version,
         state_json=excluded.state_json,
         updated_at=excluded.updated_at`
    ).run(`${IDEMPOTENCY_MODULE_PREFIX}${clientMutationId}`, 1, JSON.stringify(record), nowIso);
  }

  return successResult(
    "brainstorm-completed",
    `Brainstorm completed; document transitioned to planning (${planRef})`,
    result,
    ctx,
    planningGeneration,
    pg.warnings
  );
}
