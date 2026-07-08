import type { ModuleCommandResult, ModuleLifecycleContext } from "../../contracts/module-contract.js";
import { openPlanningStores } from "../../core/planning/index.js";
import { attachPolicyMeta } from "../task-engine/attach-planning-response-meta.js";
import { planningGenPolicyGate } from "../task-engine/planning-generation-gate.js";
import { digestPayload, readIdempotencyValue } from "../task-engine/mutation-utils.js";
import { TaskEngineError } from "../task-engine/transitions.js";
import {
  computeBrainstormSessionScores,
  hasCompleteBrainstormScoringInputs,
  synthesizeBrainstormScores
} from "./brainstorm-scoring.js";
import { mergeBrainstormSessionIdeation, parseBrainstormSessionIdeationPatch } from "./brainstorm-ideation.js";
import { applyBrainstormSectionSynthesis } from "./brainstorm-section-synthesis.js";
import { readIdeaPlanArtifact, writeNextIdeaPlanArtifactVersion } from "./idea-plan-artifact-storage.js";
import type {
  BrainstormSession,
  BrainstormSessionIdeation,
  BrainstormSessionInputs,
  IdeaPlanDocument
} from "./idea-plan-types.js";

const IDEMPOTENCY_MODULE_PREFIX = "ideas-update-brainstorm-session-idempotency:";

const SESSION_INPUT_FIELDS = [
  "valueImpact",
  "valueReach",
  "valueUrgency",
  "valueStrategicFit",
  "riskTechnical",
  "riskOperational",
  "riskUnknowns",
  "riskReversibility",
  "tShirtSize",
  "complexity",
  "confidenceEvidence",
  "confidenceExpertise",
  "confidenceClarity",
  "contextProblem",
  "contextAudience",
  "unknownsNotes",
  "alternativesConsidered",
  "sessionNotes"
] as const;

export type UpdateBrainstormSessionResultV1 = {
  responseSchemaVersion: 1;
  planRef: string;
  planId: string;
  version: number;
  status: IdeaPlanDocument["status"];
  ideaId: string;
  sessionIndex: number;
  session: BrainstormSession;
  scoresComputed: boolean;
  replayed?: boolean;
};

type UpdateBrainstormSessionIdempotencyStateV1 = {
  schemaVersion: 1;
  payloadDigest: string;
  result: UpdateBrainstormSessionResultV1;
};

function cleanString(raw: unknown): string | undefined {
  return typeof raw === "string" && raw.trim() ? raw.trim() : undefined;
}

function cleanSessionIndex(raw: unknown): number | undefined {
  if (typeof raw !== "number" || !Number.isInteger(raw) || raw < 0) {
    return undefined;
  }
  return raw;
}

function cleanScore(raw: unknown): number | undefined {
  if (typeof raw !== "number" || !Number.isFinite(raw)) {
    return undefined;
  }
  return raw;
}

function cleanTShirtSize(raw: unknown): BrainstormSessionInputs["tShirtSize"] | undefined {
  if (raw === "XS" || raw === "S" || raw === "M" || raw === "L" || raw === "XL") {
    return raw;
  }
  return undefined;
}

function parseSessionInputsPatch(raw: unknown): Partial<BrainstormSessionInputs> | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return undefined;
  }
  const source = raw as Record<string, unknown>;
  const patch: Partial<BrainstormSessionInputs> = {};
  for (const field of SESSION_INPUT_FIELDS) {
    if (!(field in source)) {
      continue;
    }
    const value = source[field];
    if (field === "tShirtSize") {
      const size = cleanTShirtSize(value);
      if (size) {
        patch.tShirtSize = size;
      }
      continue;
    }
    if (
      field === "contextProblem" ||
      field === "contextAudience" ||
      field === "unknownsNotes" ||
      field === "alternativesConsidered" ||
      field === "sessionNotes"
    ) {
      const text = cleanString(value);
      if (text !== undefined) {
        patch[field] = text;
      }
      continue;
    }
    const score = cleanScore(value);
    if (score !== undefined) {
      patch[field as keyof BrainstormSessionInputs] = score as never;
    }
  }
  return patch;
}

function updatePayloadDigest(input: {
  planRef: string;
  sessionIndex: number;
  inputs?: Partial<BrainstormSessionInputs>;
  ideation?: Partial<BrainstormSessionIdeation>;
  completedAt?: string;
  notes?: string;
}): string {
  return digestPayload(input);
}

function mergeSession(
  existing: BrainstormSession,
  patch: {
    inputs?: Partial<BrainstormSessionInputs>;
    ideation?: Partial<BrainstormSessionIdeation>;
    completedAt?: string;
    notes?: string;
  },
  nowIso: string
): { session: BrainstormSession; scoresComputed: boolean } {
  const mergedInputs = {
    ...(existing.inputs ?? {}),
    ...(patch.inputs ?? {})
  };
  const session: BrainstormSession = {
    ...existing,
    updatedAt: nowIso,
    ...(patch.completedAt ? { completedAt: patch.completedAt } : {}),
    ...(patch.notes !== undefined ? { notes: patch.notes } : {})
  };
  if (patch.inputs) {
    session.inputs = mergedInputs;
  }
  if (patch.ideation) {
    session.ideation = mergeBrainstormSessionIdeation(existing.ideation, patch.ideation);
  }

  let scoresComputed = false;
  if (hasCompleteBrainstormScoringInputs(session.inputs)) {
    session.scores = computeBrainstormSessionScores(session.inputs);
    scoresComputed = true;
  }
  return { session, scoresComputed };
}

function successResult(
  code: "brainstorm-session-updated" | "brainstorm-session-idempotent-replay",
  message: string,
  result: UpdateBrainstormSessionResultV1,
  ctx: ModuleLifecycleContext,
  planningGeneration: number,
  warnings?: string[]
): ModuleCommandResult {
  const data: Record<string, unknown> = { ...result };
  attachPolicyMeta(data, ctx, planningGeneration, warnings);
  return { ok: true, code, message, data };
}

export async function runUpdateBrainstormSession(
  args: Record<string, unknown>,
  ctx: ModuleLifecycleContext,
  instructionPath: string
): Promise<ModuleCommandResult> {
  const planRef = cleanString(args.planRef);
  const sessionIndex = cleanSessionIndex(args.sessionIndex);
  const inputsPatch = parseSessionInputsPatch(args.inputs);
  const ideationPatch = parseBrainstormSessionIdeationPatch(args.ideation);
  const completedAt = cleanString(args.completedAt);
  const notes = args.notes === undefined ? undefined : cleanString(args.notes);

  if (!planRef) {
    return { ok: false, code: "invalid-args", message: "update-brainstorm-session requires planRef shaped like plan-artifact:<planId>" };
  }
  if (sessionIndex === undefined) {
    return { ok: false, code: "invalid-args", message: "update-brainstorm-session requires non-negative integer sessionIndex" };
  }
  if (args.inputs !== undefined && !inputsPatch) {
    return { ok: false, code: "invalid-args", message: "update-brainstorm-session inputs must be an object with recognized session fields" };
  }
  if (args.ideation !== undefined && !ideationPatch) {
    return { ok: false, code: "invalid-args", message: "update-brainstorm-session ideation must be an object with recognized ideation fields" };
  }
  if (!inputsPatch && !ideationPatch && completedAt === undefined && notes === undefined) {
    return {
      ok: false,
      code: "invalid-args",
      message: "update-brainstorm-session requires at least one of inputs, ideation, completedAt, or notes"
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
  const digest = updatePayloadDigest({
    planRef,
    sessionIndex,
    ...(inputsPatch ? { inputs: inputsPatch } : {}),
    ...(ideationPatch ? { ideation: ideationPatch } : {}),
    ...(completedAt ? { completedAt } : {}),
    ...(notes !== undefined ? { notes } : {})
  });
  const db = planning.sqliteDual.getDatabase();

  if (clientMutationId) {
    const priorRow = db
      .prepare("SELECT state_json FROM workspace_module_state WHERE module_id = ?")
      .get(`${IDEMPOTENCY_MODULE_PREFIX}${clientMutationId}`) as { state_json: string } | undefined;
    if (priorRow?.state_json) {
      try {
        const prior = JSON.parse(priorRow.state_json) as UpdateBrainstormSessionIdempotencyStateV1;
        if (prior.schemaVersion === 1 && prior.payloadDigest === digest && prior.result) {
          return successResult(
            "brainstorm-session-idempotent-replay",
            `Brainstorm session update idempotent replay for ${planRef}`,
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
            message: `clientMutationId '${clientMutationId}' was already used for a different update-brainstorm-session payload`
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

  const sessions = existing.brainstorm?.sessions ?? [];
  if (sessionIndex >= sessions.length) {
    return {
      ok: false,
      code: "brainstorm-session-not-found",
      message: `sessionIndex ${sessionIndex} is out of range for ${planRef} (${sessions.length} session(s)). Run start-brainstorm-session first.`,
      data: { responseSchemaVersion: 1, planRef, sessionIndex, sessionCount: sessions.length }
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
  const currentSession = sessions[sessionIndex]!;
  const { session: updatedSession, scoresComputed } = mergeSession(
    currentSession,
    {
      ...(inputsPatch ? { inputs: inputsPatch } : {}),
      ...(ideationPatch ? { ideation: ideationPatch } : {}),
      ...(completedAt ? { completedAt } : {}),
      ...(notes !== undefined ? { notes } : {})
    },
    nowIso
  );

  const nextSessions = sessions.map((entry, index) => (index === sessionIndex ? updatedSession : entry));
  const synthesized = synthesizeBrainstormScores(nextSessions);
  if (synthesized && updatedSession.completedAt) {
    updatedSession.synthesized = synthesized;
    nextSessions[sessionIndex] = updatedSession;
  }

  const updated: IdeaPlanDocument = {
    ...existing,
    updatedAt: nowIso,
    brainstorm: applyBrainstormSectionSynthesis({
      ...(existing.brainstorm ?? { sessions: [] }),
      sessions: nextSessions,
      activeSessionId: updatedSession.sessionId
    })
  };

  const persisted = writeNextIdeaPlanArtifactVersion(workspacePath, updated, { sqliteDb: db });
  const result: UpdateBrainstormSessionResultV1 = {
    responseSchemaVersion: 1,
    planRef: persisted.planRef,
    planId: persisted.planId,
    version: persisted.version,
    status: persisted.status,
    ideaId: persisted.ideaId,
    sessionIndex,
    session: persisted.brainstorm!.sessions[sessionIndex]!,
    scoresComputed
  };

  if (clientMutationId) {
    const record: UpdateBrainstormSessionIdempotencyStateV1 = {
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
    "brainstorm-session-updated",
    `Brainstorm session ${sessionIndex} updated for ${planRef}`,
    result,
    ctx,
    planningGeneration,
    pg.warnings
  );
}
