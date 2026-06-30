import type Database from "better-sqlite3";
import type { ModuleCommandResult, ModuleLifecycleContext } from "../../contracts/module-contract.js";
import { openPlanningStores } from "../../core/planning/index.js";
import { attachPolicyMeta } from "../task-engine/attach-planning-response-meta.js";
import { planningGenPolicyGate } from "../task-engine/planning-generation-gate.js";
import { digestPayload, readIdempotencyValue } from "../task-engine/mutation-utils.js";
import { TaskEngineError } from "../task-engine/transitions.js";
import { getIdea, isIdeaId } from "./idea-store.js";
import {
  getPlanningChatSession,
  isPlanningChatSessionStatus,
  toPlanningChatSessionResponse,
  updatePlanningChatSession,
  type PlanningChatSessionStatus
} from "./planning-chat-session.js";

const IDEMPOTENCY_MODULE_PREFIX = "ideas-update-idea-planning-session-idempotency:";

const VALID_TRANSITIONS: Record<PlanningChatSessionStatus, PlanningChatSessionStatus[]> = {
  active: ["draft_ready", "needs_revision", "approval_ready", "abandoned", "superseded"],
  draft_ready: ["draft_ready", "needs_revision", "approval_ready", "abandoned", "superseded"],
  needs_revision: ["draft_ready", "needs_revision", "approval_ready", "abandoned", "superseded"],
  approval_ready: ["completed", "needs_revision", "abandoned", "superseded"],
  completed: ["completed"],
  abandoned: ["abandoned"],
  superseded: ["superseded"]
};

export type UpdateIdeaPlanningSessionResultV1 = {
  responseSchemaVersion: 1;
  ideaId: string;
  planningChatSession: ReturnType<typeof toPlanningChatSessionResponse>;
  replayed?: boolean;
};

type UpdateIdeaPlanningSessionIdempotencyStateV1 = {
  schemaVersion: 1;
  payloadDigest: string;
  result: UpdateIdeaPlanningSessionResultV1;
};

function idempotencyModuleId(clientMutationId: string): string {
  return `${IDEMPOTENCY_MODULE_PREFIX}${clientMutationId}`;
}

function readModuleStateJson(db: Database.Database, moduleId: string): Record<string, unknown> | null {
  const row = db
    .prepare("SELECT state_json FROM workspace_module_state WHERE module_id = ?")
    .get(moduleId) as { state_json: string } | undefined;
  if (!row?.state_json) {
    return null;
  }
  try {
    const parsed = JSON.parse(row.state_json) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function writeModuleStateJson(
  db: Database.Database,
  moduleId: string,
  stateSchemaVersion: number,
  state: Record<string, unknown>,
  nowIso: string
): void {
  db.prepare(
    `INSERT INTO workspace_module_state (module_id, state_schema_version, state_json, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(module_id) DO UPDATE SET
       state_schema_version=excluded.state_schema_version,
       state_json=excluded.state_json,
       updated_at=excluded.updated_at`
  ).run(moduleId, stateSchemaVersion, JSON.stringify(state), nowIso);
}

function readIdempotencyRecord(
  db: Database.Database,
  clientMutationId: string
): UpdateIdeaPlanningSessionIdempotencyStateV1 | null {
  const raw = readModuleStateJson(db, idempotencyModuleId(clientMutationId));
  if (!raw) {
    return null;
  }
  const row = raw as unknown as UpdateIdeaPlanningSessionIdempotencyStateV1;
  if (row.schemaVersion !== 1 || typeof row.payloadDigest !== "string" || !row.result) {
    return null;
  }
  return row;
}

function writeIdempotencyRecord(
  db: Database.Database,
  clientMutationId: string,
  record: UpdateIdeaPlanningSessionIdempotencyStateV1,
  nowIso: string
): void {
  writeModuleStateJson(db, idempotencyModuleId(clientMutationId), 1, record as unknown as Record<string, unknown>, nowIso);
}

function cleanString(raw: unknown): string | undefined {
  return typeof raw === "string" && raw.trim() ? raw.trim() : undefined;
}

function cleanPlanRef(raw: unknown): string | undefined {
  const value = cleanString(raw);
  if (!value?.startsWith("plan-artifact:")) {
    return undefined;
  }
  return value;
}

function cleanPlanVersion(raw: unknown): number | undefined {
  if (typeof raw !== "number" || !Number.isInteger(raw) || raw < 1) {
    return undefined;
  }
  return raw;
}

function updatePayloadDigest(input: {
  ideaId: string;
  sessionId: string;
  status: PlanningChatSessionStatus;
  summary?: string;
  currentPlanRef?: string;
  currentPlanVersion?: number;
}): string {
  return digestPayload(input);
}

function isTransitionAllowed(from: PlanningChatSessionStatus, to: PlanningChatSessionStatus): boolean {
  return VALID_TRANSITIONS[from].includes(to);
}

function buildResult(
  ideaId: string,
  session: NonNullable<ReturnType<typeof updatePlanningChatSession>>,
  replayed?: boolean
): UpdateIdeaPlanningSessionResultV1 {
  return {
    responseSchemaVersion: 1,
    ideaId,
    planningChatSession: toPlanningChatSessionResponse(session),
    ...(replayed ? { replayed: true } : {})
  };
}

function successResult(
  code: "idea-planning-session-updated" | "idea-planning-session-idempotent-replay",
  message: string,
  result: UpdateIdeaPlanningSessionResultV1,
  ctx: ModuleLifecycleContext,
  planningGeneration: number,
  warnings?: string[]
): ModuleCommandResult {
  const data: Record<string, unknown> = { ...result };
  attachPolicyMeta(data, ctx, planningGeneration, warnings);
  return { ok: true, code, message, data };
}

export async function runUpdateIdeaPlanningSession(
  args: Record<string, unknown>,
  ctx: ModuleLifecycleContext,
  instructionPath: string
): Promise<ModuleCommandResult> {
  const ideaIdRaw = cleanString(args.ideaId) ?? cleanString(args.id);
  const sessionId = cleanString(args.sessionId);
  const statusRaw = cleanString(args.status);
  const summary = cleanString(args.summary);
  const currentPlanRef = cleanPlanRef(args.currentPlanRef);
  const currentPlanVersion = cleanPlanVersion(args.currentPlanVersion);

  if (!ideaIdRaw || !isIdeaId(ideaIdRaw)) {
    return { ok: false, code: "invalid-args", message: "update-idea-planning-session requires ideaId shaped like I001" };
  }
  if (!sessionId) {
    return {
      ok: false,
      code: "invalid-args",
      message: "update-idea-planning-session requires sessionId from the active planning session"
    };
  }
  if (!statusRaw || !isPlanningChatSessionStatus(statusRaw)) {
    return {
      ok: false,
      code: "invalid-args",
      message:
        "update-idea-planning-session requires status: active, draft_ready, needs_revision, approval_ready, completed, abandoned, or superseded"
    };
  }
  if (args.currentPlanRef !== undefined && currentPlanRef === undefined) {
    return { ok: false, code: "invalid-args", message: "currentPlanRef must be shaped like plan-artifact:<planId>" };
  }
  if (args.currentPlanVersion !== undefined && currentPlanVersion === undefined) {
    return { ok: false, code: "invalid-args", message: "currentPlanVersion must be a positive integer" };
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

  const planningGeneration = planning.sqliteDual.getPlanningGeneration();
  const pg = planningGenPolicyGate(ctx, args, instructionPath, planningGeneration);
  if (pg.block) {
    return pg.block;
  }

  const db = planning.sqliteDual.getDatabase();
  const clientMutationId = readIdempotencyValue(args);
  const digest = updatePayloadDigest({
    ideaId: ideaIdRaw,
    sessionId,
    status: statusRaw,
    ...(summary !== undefined ? { summary } : {}),
    ...(currentPlanRef !== undefined ? { currentPlanRef } : {}),
    ...(currentPlanVersion !== undefined ? { currentPlanVersion } : {})
  });

  if (clientMutationId) {
    const prior = readIdempotencyRecord(db, clientMutationId);
    if (prior) {
      if (prior.payloadDigest !== digest) {
        return {
          ok: false,
          code: "idempotency-key-conflict",
          message: `clientMutationId '${clientMutationId}' was already used for a different update-idea-planning-session payload`
        };
      }
      return successResult(
        "idea-planning-session-idempotent-replay",
        `Idea ${ideaIdRaw} planning session idempotent replay`,
        { ...prior.result, replayed: true },
        ctx,
        planningGeneration,
        pg.warnings
      );
    }
  }

  const idea = getIdea(db, ideaIdRaw);
  if (!idea) {
    return {
      ok: false,
      code: "idea-not-found",
      message: `Idea ${ideaIdRaw} was not found. Verify the id from list-ideas or create-idea.`,
      data: { responseSchemaVersion: 1, ideaId: ideaIdRaw }
    };
  }

  const existingSession = getPlanningChatSession(db, ideaIdRaw);
  if (!existingSession) {
    return {
      ok: false,
      code: "planning-session-not-found",
      message: `No planning session exists for idea ${ideaIdRaw}. Start one with start-idea-planning first.`,
      data: { responseSchemaVersion: 1, ideaId: ideaIdRaw, sessionId }
    };
  }
  if (existingSession.sessionId !== sessionId) {
    return {
      ok: false,
      code: "planning-session-mismatch",
      message: `sessionId '${sessionId}' does not match the active planning session for idea ${ideaIdRaw}. Use sessionId '${existingSession.sessionId}' from start-idea-planning.`,
      data: {
        responseSchemaVersion: 1,
        ideaId: ideaIdRaw,
        sessionId,
        expectedSessionId: existingSession.sessionId
      }
    };
  }

  if (!isTransitionAllowed(existingSession.status, statusRaw)) {
    return {
      ok: false,
      code: "planning-session-transition-invalid",
      message: `Cannot transition planning session from '${existingSession.status}' to '${statusRaw}'.`,
      data: {
        responseSchemaVersion: 1,
        ideaId: ideaIdRaw,
        sessionId,
        fromStatus: existingSession.status,
        toStatus: statusRaw
      }
    };
  }

  const nowIso = new Date().toISOString();
  const updated = updatePlanningChatSession(
    db,
    {
      ideaId: ideaIdRaw,
      sessionId,
      status: statusRaw,
      ...(summary !== undefined ? { summary } : {}),
      ...(currentPlanRef !== undefined ? { currentPlanRef } : {}),
      ...(currentPlanVersion !== undefined ? { currentPlanVersion } : {})
    },
    nowIso
  );
  if (!updated) {
    return { ok: false, code: "storage-write-error", message: "Failed to update planning session state." };
  }

  const result = buildResult(ideaIdRaw, updated);
  if (clientMutationId) {
    writeIdempotencyRecord(db, clientMutationId, { schemaVersion: 1, payloadDigest: digest, result }, nowIso);
  }

  return successResult(
    "idea-planning-session-updated",
    `Idea ${ideaIdRaw} planning session updated to ${statusRaw}`,
    result,
    ctx,
    planning.sqliteDual.getPlanningGeneration(),
    pg.warnings
  );
}
