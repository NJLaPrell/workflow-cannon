import crypto from "node:crypto";
import type { ModuleCommandResult, ModuleLifecycleContext } from "../../contracts/module-contract.js";
import { openPlanningStores } from "../../core/planning/index.js";
import { attachPolicyMeta } from "../task-engine/attach-planning-response-meta.js";
import { planningGenPolicyGate } from "../task-engine/planning-generation-gate.js";
import { digestPayload, readIdempotencyValue } from "../task-engine/mutation-utils.js";
import { TaskEngineError } from "../task-engine/transitions.js";
import {
  readIdeaPlanArtifact,
  writeNextIdeaPlanArtifactVersion
} from "./idea-plan-artifact-storage.js";
import { enforceIdeaPlanStatusTransition, IdeaPlanStatusTransitionError } from "./idea-plan-status-machine.js";
import { loadIdeaPlanStateSchema } from "./idea-plan-state-schema-loader.js";
import { guardIdeaPlanStateSchemaLoad } from "./idea-plan-state-schema-guard.js";
import type { BrainstormSession, IdeaPlanDocument } from "./idea-plan-types.js";

const IDEMPOTENCY_MODULE_PREFIX = "ideas-start-brainstorm-session-idempotency:";

export type StartBrainstormSessionResultV1 = {
  responseSchemaVersion: 1;
  planRef: string;
  planId: string;
  version: number;
  status: IdeaPlanDocument["status"];
  ideaId: string;
  sessionIndex: number;
  session: BrainstormSession;
  transitioned: boolean;
  replayed?: boolean;
};

type StartBrainstormSessionIdempotencyStateV1 = {
  schemaVersion: 1;
  payloadDigest: string;
  result: StartBrainstormSessionResultV1;
};

function cleanString(raw: unknown): string | undefined {
  return typeof raw === "string" && raw.trim() ? raw.trim() : undefined;
}

function startPayloadDigest(planRef: string): string {
  return digestPayload({ planRef });
}

function successResult(
  code: "brainstorm-session-started" | "brainstorm-session-idempotent-replay",
  message: string,
  result: StartBrainstormSessionResultV1,
  ctx: ModuleLifecycleContext,
  planningGeneration: number,
  warnings?: string[]
): ModuleCommandResult {
  const data: Record<string, unknown> = { ...result };
  attachPolicyMeta(data, ctx, planningGeneration, warnings);
  return { ok: true, code, message, data };
}

function ensureBrainstormSection(document: IdeaPlanDocument): IdeaPlanDocument {
  if (document.brainstorm?.sessions) {
    return document;
  }
  return {
    ...document,
    brainstorm: {
      sessions: []
    }
  };
}

export async function runStartBrainstormSession(
  args: Record<string, unknown>,
  ctx: ModuleLifecycleContext,
  instructionPath: string
): Promise<ModuleCommandResult> {
  const planRef = cleanString(args.planRef);
  if (!planRef) {
    return { ok: false, code: "invalid-args", message: "start-brainstorm-session requires planRef shaped like plan-artifact:<planId>" };
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
  const digest = startPayloadDigest(planRef);
  const db = planning.sqliteDual.getDatabase();

  if (clientMutationId) {
    const priorRow = db
      .prepare("SELECT state_json FROM workspace_module_state WHERE module_id = ?")
      .get(`${IDEMPOTENCY_MODULE_PREFIX}${clientMutationId}`) as { state_json: string } | undefined;
    if (priorRow?.state_json) {
      try {
        const prior = JSON.parse(priorRow.state_json) as StartBrainstormSessionIdempotencyStateV1;
        if (prior.schemaVersion === 1 && prior.payloadDigest === digest && prior.result) {
          return successResult(
            "brainstorm-session-idempotent-replay",
            `Brainstorm session idempotent replay for ${planRef}`,
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
            message: `clientMutationId '${clientMutationId}' was already used for a different start-brainstorm-session payload`
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
      message: `No IdeaPlan artifact found for ${planRef}. Create or link the unified document first.`,
      data: { responseSchemaVersion: 1, planRef }
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

  const nowIso = new Date().toISOString();
  const sessionId = `bsess-${crypto.randomUUID()}`;
  const session: BrainstormSession = {
    sessionId,
    startedAt: nowIso,
    updatedAt: nowIso
  };

  let transitioned = false;
  let nextStatus = existing.status;
  try {
    if (existing.status === "idea") {
      nextStatus = enforceIdeaPlanStatusTransition(existing.status, "brainstorming");
      transitioned = true;
    }
  } catch (err) {
    if (err instanceof IdeaPlanStatusTransitionError) {
      return {
        ok: false,
        code: err.code,
        message: err.message,
        data: { responseSchemaVersion: 1, planRef, fromStatus: existing.status, toStatus: "brainstorming" }
      };
    }
    throw err;
  }

  const schemaLoad = loadIdeaPlanStateSchema("brainstorming", workspacePath);
  const schemaGuard = guardIdeaPlanStateSchemaLoad(schemaLoad);
  if (!schemaGuard.ok) {
    return {
      ok: false,
      code: schemaGuard.code,
      message: schemaGuard.message,
      data: { responseSchemaVersion: 1, planRef, ...schemaGuard.data }
    };
  }
  const brainstormingDirective = schemaGuard.agentDirective;
  const withSection = ensureBrainstormSection(existing);
  const sessions = [...(withSection.brainstorm?.sessions ?? []), session];
  const sessionIndex = sessions.length - 1;

  const updated: IdeaPlanDocument = {
    ...withSection,
    status: nextStatus,
    updatedAt: nowIso,
    agentDirective: brainstormingDirective,
    brainstorm: {
      sessions,
      activeSessionId: sessionId
    }
  };

  const persisted = writeNextIdeaPlanArtifactVersion(workspacePath, updated, { sqliteDb: db });
  const result: StartBrainstormSessionResultV1 = {
    responseSchemaVersion: 1,
    planRef: persisted.planRef,
    planId: persisted.planId,
    version: persisted.version,
    status: persisted.status,
    ideaId: persisted.ideaId,
    sessionIndex,
    session,
    transitioned
  };

  if (clientMutationId) {
    const record: StartBrainstormSessionIdempotencyStateV1 = {
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
    "brainstorm-session-started",
    transitioned
      ? `Brainstorm session started and document transitioned to brainstorming (${planRef})`
      : `Brainstorm session appended without status change (${planRef})`,
    result,
    ctx,
    planningGeneration,
    pg.warnings
  );
}
