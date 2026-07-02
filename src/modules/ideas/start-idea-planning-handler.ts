import crypto from "node:crypto";
import type Database from "better-sqlite3";
import type { ModuleCommandResult, ModuleLifecycleContext } from "../../contracts/module-contract.js";
import { openPlanningStores } from "../../core/planning/index.js";
import { attachPolicyMeta } from "../task-engine/attach-planning-response-meta.js";
import { planningGenPolicyGate } from "../task-engine/planning-generation-gate.js";
import { digestPayload, readIdempotencyValue } from "../task-engine/mutation-utils.js";
import { TaskEngineError } from "../task-engine/transitions.js";
import { buildIdeaPlanningPrompt } from "./build-idea-planning-prompt.js";
import { initializeIdeaPlanPlanningSectionForStart } from "./idea-plan-planning-init.js";
import { getIdea, isIdeaId, updateIdea, type IdeaRecord } from "./idea-store.js";
import { readActiveDraftPlanArtifact } from "./idea-planning-metadata.js";
import {
  getPlanningChatSession,
  persistPlanningChatSession,
  toPlanningChatSessionResponse,
  type PlanningChatSessionRecord
} from "./planning-chat-session.js";

const IDEMPOTENCY_MODULE_PREFIX = "ideas-start-idea-planning-idempotency:";

export type StartIdeaPlanningResultV1 = {
  responseSchemaVersion: 1;
  ideaId: string;
  status: "planning";
  mode: "started" | "resumed";
  planningChatPrompt: string;
  planningChatSession: ReturnType<typeof toPlanningChatSessionResponse>;
  linkedPlanArtifact?: string;
  activeDraftPlanArtifact?: string;
  previousPlanArtifacts: string[];
  replayed?: boolean;
};

type StartIdeaPlanningIdempotencyStateV1 = {
  schemaVersion: 1;
  payloadDigest: string;
  result: StartIdeaPlanningResultV1;
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
): StartIdeaPlanningIdempotencyStateV1 | null {
  const raw = readModuleStateJson(db, idempotencyModuleId(clientMutationId));
  if (!raw) {
    return null;
  }
  const row = raw as unknown as StartIdeaPlanningIdempotencyStateV1;
  if (row.schemaVersion !== 1 || typeof row.payloadDigest !== "string" || !row.result) {
    return null;
  }
  return row;
}

function writeIdempotencyRecord(
  db: Database.Database,
  clientMutationId: string,
  record: StartIdeaPlanningIdempotencyStateV1,
  nowIso: string
): void {
  writeModuleStateJson(db, idempotencyModuleId(clientMutationId), 1, record as unknown as Record<string, unknown>, nowIso);
}

function startPayloadDigest(ideaId: string): string {
  return digestPayload({ ideaId });
}

function collectPlanLineage(
  db: Database.Database,
  idea: IdeaRecord
): {
  linkedPlanArtifact?: string;
  activeDraftPlanArtifact?: string;
  previousPlanArtifacts: string[];
} {
  const activeDraftPlanArtifact = readActiveDraftPlanArtifact(db, idea.id);
  return {
    ...(idea.linkedPlanArtifact ? { linkedPlanArtifact: idea.linkedPlanArtifact } : {}),
    ...(activeDraftPlanArtifact ? { activeDraftPlanArtifact } : {}),
    previousPlanArtifacts: [...idea.previousPlanArtifacts]
  };
}

function buildResult(args: {
  idea: IdeaRecord;
  mode: "started" | "resumed";
  prompt: string;
  session: PlanningChatSessionRecord;
  lineage: ReturnType<typeof collectPlanLineage>;
  replayed?: boolean;
}): StartIdeaPlanningResultV1 {
  return {
    responseSchemaVersion: 1,
    ideaId: args.idea.id,
    status: "planning",
    mode: args.mode,
    planningChatPrompt: args.prompt,
    planningChatSession: toPlanningChatSessionResponse(args.session),
    ...(args.lineage.linkedPlanArtifact ? { linkedPlanArtifact: args.lineage.linkedPlanArtifact } : {}),
    ...(args.lineage.activeDraftPlanArtifact ? { activeDraftPlanArtifact: args.lineage.activeDraftPlanArtifact } : {}),
    previousPlanArtifacts: args.lineage.previousPlanArtifacts,
    ...(args.replayed ? { replayed: true } : {})
  };
}

function successResult(
  code: "idea-planning-started" | "idea-planning-resumed" | "idea-planning-idempotent-replay",
  message: string,
  result: StartIdeaPlanningResultV1,
  ctx: ModuleLifecycleContext,
  planningGeneration: number,
  warnings?: string[]
): ModuleCommandResult {
  const data: Record<string, unknown> = { ...result };
  attachPolicyMeta(data, ctx, planningGeneration, warnings);
  return { ok: true, code, message, data };
}

export async function runStartIdeaPlanning(
  args: Record<string, unknown>,
  ctx: ModuleLifecycleContext,
  instructionPath: string
): Promise<ModuleCommandResult> {
  const ideaIdRaw = typeof args.ideaId === "string" ? args.ideaId.trim() : typeof args.id === "string" ? args.id.trim() : "";
  if (!ideaIdRaw || !isIdeaId(ideaIdRaw)) {
    return {
      ok: false,
      code: "invalid-args",
      message: "start-idea-planning requires ideaId shaped like I001"
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

  const planningGeneration = planning.sqliteDual.getPlanningGeneration();
  const pg = planningGenPolicyGate(ctx, args, instructionPath, planningGeneration);
  if (pg.block) {
    return pg.block;
  }

  const db = planning.sqliteDual.getDatabase();
  const clientMutationId = readIdempotencyValue(args);
  const digest = startPayloadDigest(ideaIdRaw);

  if (clientMutationId) {
    const prior = readIdempotencyRecord(db, clientMutationId);
    if (prior) {
      if (prior.payloadDigest !== digest) {
        return {
          ok: false,
          code: "idempotency-key-conflict",
          message: `clientMutationId '${clientMutationId}' was already used for a different start-idea-planning payload`
        };
      }
      return successResult(
        "idea-planning-idempotent-replay",
        `Idea ${ideaIdRaw} planning idempotent replay`,
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
      message: `Idea ${ideaIdRaw} was not found. Create it with create-idea or verify the id from list-ideas.`,
      data: { responseSchemaVersion: 1, ideaId: ideaIdRaw }
    };
  }

  const workspacePath = ctx.workspacePath ?? process.cwd();
  const nowIso = new Date().toISOString();
  const initialized = initializeIdeaPlanPlanningSectionForStart(workspacePath, db, idea, nowIso);
  const workingIdea = initialized.idea;
  const lineage = collectPlanLineage(db, workingIdea);
  const existingSession = getPlanningChatSession(db, ideaIdRaw);

  if (existingSession) {
    const prompt =
      existingSession.resumePrompt ??
      buildIdeaPlanningPrompt({
        ideaId: workingIdea.id,
        title: workingIdea.title,
        note: workingIdea.note,
        planningSessionId: existingSession.sessionId,
        ...lineage
      });
    let updatedIdea = workingIdea;
    let session = existingSession;
    db.transaction(() => {
      if (workingIdea.status !== "planning") {
        const next = updateIdea(db, workingIdea.id, { status: "planning" }, nowIso);
        if (next) {
          updatedIdea = next;
        }
      }
      session = persistPlanningChatSession(
        db,
        { ideaId: updatedIdea.id, title: updatedIdea.title, note: updatedIdea.note, resumePrompt: prompt },
        nowIso
      );
    })();
    const result = buildResult({
      idea: updatedIdea,
      mode: "resumed",
      prompt,
      session,
      lineage
    });
    if (clientMutationId) {
      writeIdempotencyRecord(
        db,
        clientMutationId,
        { schemaVersion: 1, payloadDigest: digest, result },
        nowIso
      );
    }
    return successResult(
      "idea-planning-resumed",
      `Idea ${workingIdea.id} planning resumed`,
      result,
      ctx,
      planningGeneration,
      pg.warnings
    );
  }

  const sessionId = `pcs-${crypto.randomUUID()}`;
  const prompt = buildIdeaPlanningPrompt({
    ideaId: workingIdea.id,
    title: workingIdea.title,
    note: workingIdea.note,
    planningSessionId: sessionId,
    ...lineage
  });

  let updatedIdea = workingIdea;
  db.transaction(() => {
    const next = updateIdea(db, workingIdea.id, { status: "planning" }, nowIso);
    if (next) {
      updatedIdea = next;
    }
    persistPlanningChatSession(
      db,
      {
        ideaId: updatedIdea.id,
        title: updatedIdea.title,
        note: updatedIdea.note,
        resumePrompt: prompt,
        sessionId
      },
      nowIso
    );
  })();

  const session = getPlanningChatSession(db, workingIdea.id);
  if (!session) {
    return {
      ok: false,
      code: "storage-read-error",
      message: "Planning session missing after start-idea-planning persist."
    };
  }

  const result = buildResult({
    idea: updatedIdea,
    mode: "started",
    prompt,
    session,
    lineage
  });

  if (clientMutationId) {
    writeIdempotencyRecord(
      db,
      clientMutationId,
      { schemaVersion: 1, payloadDigest: digest, result },
      nowIso
    );
  }

  return successResult(
    "idea-planning-started",
    `Idea ${workingIdea.id} planning started`,
    result,
    ctx,
    planning.sqliteDual.getPlanningGeneration(),
    pg.warnings
  );
}
