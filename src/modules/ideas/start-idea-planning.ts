import type Sqlite from "better-sqlite3";
import type { ModuleCommandResult, ModuleLifecycleContext } from "../../contracts/module-contract.js";
import type { OpenedPlanningStores } from "../task-engine/persistence/planning-open.js";
import type { TaskStore } from "../task-engine/persistence/store.js";
import { draftPlanningIdeaUpdatedEvent } from "../task-engine/persistence/planning-event-draft.js";
import { digestPayload, readIdempotencyValue } from "../task-engine/mutation-utils.js";
import { ideaRecordToEventSnapshot } from "../task-engine/task-state-events/planning-idea-event-utils.js";
import {
  getIdea,
  isIdeaId,
  updateIdea,
  type IdeaRecord
} from "./idea-store.js";
import { publishIdeasPlanningEvents } from "./ideas-planning-events-runtime.js";
import {
  getPlanningChatSession,
  persistPlanningChatSession,
  toPlanningChatSessionView,
  type PlanningChatSessionRecord
} from "./planning-chat-session.js";

const IDEMPOTENCY_MODULE_PREFIX = "ideas-start-idea-planning-idempotency:";

export type StartIdeaPlanningMode = "started" | "resumed";

export type StartIdeaPlanningResult = {
  responseSchemaVersion: 1;
  ideaId: string;
  status: "planning";
  mode: StartIdeaPlanningMode;
  planningChatPrompt: string;
  planningChatSession: {
    sessionId: string;
    status: "active";
    startedAt: string;
    updatedAt: string;
    resumePrompt: string;
  };
  linkedPlanArtifact?: string;
  activeDraftPlanArtifact?: string;
  previousPlanArtifacts: string[];
  replayed?: boolean;
};

type StartIdeaPlanningIdempotencyStateV1 = {
  schemaVersion: 1;
  payloadDigest: string;
  result: StartIdeaPlanningResult;
};

function idempotencyModuleId(clientMutationId: string): string {
  return `${IDEMPOTENCY_MODULE_PREFIX}${clientMutationId}`;
}

function readIdempotencyRecord(
  db: Sqlite.Database,
  clientMutationId: string
): StartIdeaPlanningIdempotencyStateV1 | null {
  const row = db
    .prepare("SELECT state_json FROM workspace_module_state WHERE module_id = ?")
    .get(idempotencyModuleId(clientMutationId)) as { state_json: string } | undefined;
  if (!row) {
    return null;
  }
  try {
    const parsed = JSON.parse(row.state_json) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    const record = parsed as Partial<StartIdeaPlanningIdempotencyStateV1>;
    if (record.schemaVersion !== 1 || typeof record.payloadDigest !== "string" || !record.result) {
      return null;
    }
    return record as StartIdeaPlanningIdempotencyStateV1;
  } catch {
    return null;
  }
}

function writeIdempotencyRecord(
  db: Sqlite.Database,
  clientMutationId: string,
  record: StartIdeaPlanningIdempotencyStateV1,
  nowIso: string
): void {
  db.prepare(
    `INSERT INTO workspace_module_state (module_id, state_schema_version, state_json, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(module_id) DO UPDATE SET
       state_schema_version=excluded.state_schema_version,
       state_json=excluded.state_json,
       updated_at=excluded.updated_at`
  ).run(idempotencyModuleId(clientMutationId), 1, JSON.stringify(record), nowIso);
}

function startPayloadDigest(ideaId: string): string {
  return digestPayload({ ideaId });
}

export function buildPlanningChatPrompt(input: {
  idea: IdeaRecord;
  linkedPlanArtifact?: string;
  activeDraftPlanArtifact?: string;
  previousPlanArtifacts: string[];
  mode: StartIdeaPlanningMode;
  sessionSummary?: string;
}): string {
  const lines = [
    `Plan this idea (${input.idea.id}): **${input.idea.title}**.`,
    ...(input.idea.note ? [`Note: ${input.idea.note}`] : []),
    `Follow .ai/playbooks/planner-chat.md. Preserve provenance sourceIdeaId=${input.idea.id}.`,
    "Target: accepted PlanArtifact v1 with complete WBS. Use command-layer transitions for draft, review, acceptance, and session updates."
  ];
  if (input.linkedPlanArtifact) {
    lines.push(`Linked accepted plan: ${input.linkedPlanArtifact}.`);
  }
  if (input.activeDraftPlanArtifact) {
    lines.push(`Active draft plan: ${input.activeDraftPlanArtifact}.`);
  }
  if (input.previousPlanArtifacts.length > 0) {
    lines.push(`Previous plans: ${input.previousPlanArtifacts.join(", ")}.`);
  }
  if (input.mode === "resumed") {
    lines.push("Resume the existing planning session; do not start a parallel session.");
  }
  if (input.sessionSummary) {
    lines.push(`Session summary: ${input.sessionSummary}`);
  }
  lines.push("Ask one useful clarifying question at a time.");
  return lines.join("\n");
}

function resolvePlanLineage(idea: IdeaRecord): {
  linkedPlanArtifact?: string;
  activeDraftPlanArtifact?: string;
  previousPlanArtifacts: string[];
} {
  return {
    ...(idea.linkedPlanArtifact ? { linkedPlanArtifact: idea.linkedPlanArtifact } : {}),
    previousPlanArtifacts: [...idea.previousPlanArtifacts]
  };
}

function buildResult(input: {
  idea: IdeaRecord;
  mode: StartIdeaPlanningMode;
  session: PlanningChatSessionRecord;
  prompt: string;
  activeDraftPlanArtifact?: string;
  replayed?: boolean;
}): StartIdeaPlanningResult {
  const lineage = resolvePlanLineage(input.idea);
  return {
    responseSchemaVersion: 1,
    ideaId: input.idea.id,
    status: "planning",
    mode: input.mode,
    planningChatPrompt: input.prompt,
    planningChatSession: toPlanningChatSessionView(input.session, input.prompt),
    ...(lineage.linkedPlanArtifact ? { linkedPlanArtifact: lineage.linkedPlanArtifact } : {}),
    ...(input.activeDraftPlanArtifact ? { activeDraftPlanArtifact: input.activeDraftPlanArtifact } : {}),
    previousPlanArtifacts: lineage.previousPlanArtifacts,
    ...(input.replayed ? { replayed: true } : {})
  };
}

function ideaDraftCtx(commandName: string, clientMutationId?: string) {
  return {
    commandName,
    moduleId: "ideas",
    clientMutationId
  };
}

async function persistIdeaPlanningStart(input: {
  db: Sqlite.Database;
  idea: IdeaRecord;
  prompt: string;
  nowIso: string;
  gitCanonical: boolean;
  ctx: ModuleLifecycleContext;
  store: TaskStore;
  planning: OpenedPlanningStores;
  clientMutationId?: string;
  policyApproval?: { confirmed: boolean; rationale: string };
}): Promise<{ idea: IdeaRecord; session: PlanningChatSessionRecord } | ModuleCommandResult> {
  const { db, idea, prompt, nowIso, gitCanonical, ctx, store, planning, clientMutationId, policyApproval } = input;

  if (gitCanonical) {
    const nextRecord =
      idea.status === "planning"
        ? idea
        : {
            ...idea,
            status: "planning" as const,
            updatedAt: nowIso
          };
    if (nextRecord !== idea) {
      const publishErr = await publishIdeasPlanningEvents({
        ctx,
        store,
        planning,
        events: [
          draftPlanningIdeaUpdatedEvent({
            idea: ideaRecordToEventSnapshot(nextRecord),
            ctx: ideaDraftCtx("start-idea-planning", clientMutationId)
          })
        ],
        policyApproval
      });
      if (publishErr) {
        return publishErr;
      }
    }
    const refreshed = getIdea(db, idea.id);
    if (!refreshed) {
      return { ok: false, code: "storage-read-error", message: "Idea missing after canonical publish." };
    }
    const session = persistPlanningChatSession(
      db,
      { ideaId: refreshed.id, title: refreshed.title, note: refreshed.note, resumePrompt: prompt },
      nowIso
    );
    return { idea: refreshed.status === "planning" ? refreshed : { ...refreshed, status: "planning" }, session };
  }

  let nextIdea = idea;
  db.transaction(() => {
    if (idea.status !== "planning") {
      const updated = updateIdea(db, idea.id, { status: "planning" }, nowIso);
      if (updated) {
        nextIdea = updated;
      }
    }
  })();
  const session = persistPlanningChatSession(
    db,
    { ideaId: nextIdea.id, title: nextIdea.title, note: nextIdea.note, resumePrompt: prompt },
    nowIso
  );
  return { idea: nextIdea.status === "planning" ? nextIdea : { ...nextIdea, status: "planning" }, session };
}

export async function runStartIdeaPlanning(input: {
  db: Sqlite.Database;
  args: Record<string, unknown>;
  ctx: ModuleLifecycleContext;
  store: TaskStore;
  planning: OpenedPlanningStores;
  gitCanonical: boolean;
  policyApproval?: { confirmed: boolean; rationale: string };
}): Promise<ModuleCommandResult> {
  const ideaIdRaw = input.args.ideaId ?? input.args.id;
  const ideaId = typeof ideaIdRaw === "string" ? ideaIdRaw.trim() : "";
  if (!ideaId || !isIdeaId(ideaId)) {
    return { ok: false, code: "invalid-args", message: "start-idea-planning requires ideaId shaped like I001" };
  }

  const clientMutationId = readIdempotencyValue(input.args);
  const digest = startPayloadDigest(ideaId);
  if (clientMutationId) {
    const prior = readIdempotencyRecord(input.db, clientMutationId);
    if (prior) {
      if (prior.payloadDigest !== digest) {
        return {
          ok: false,
          code: "idempotency-key-conflict",
          message: `clientMutationId '${clientMutationId}' was already used for a different start-idea-planning payload`
        };
      }
      return {
        ok: true,
        code: "start-idea-planning-idempotent-replay",
        message: `Planning session for ${ideaId} idempotent replay`,
        data: { ...prior.result, replayed: true }
      };
    }
  }

  const idea = getIdea(input.db, ideaId);
  if (!idea) {
    return { ok: false, code: "idea-not-found", message: `Idea ${ideaId} was not found` };
  }

  const lineage = resolvePlanLineage(idea);
  const nowIso = new Date().toISOString();
  const existingSession = getPlanningChatSession(input.db, ideaId);

  if (existingSession?.status === "active") {
    const prompt = buildPlanningChatPrompt({
      idea,
      ...lineage,
      mode: "resumed",
      sessionSummary: existingSession.resumePrompt
    });
    const result = buildResult({
      idea: idea.status === "planning" ? idea : { ...idea, status: "planning" },
      mode: "resumed",
      session: existingSession,
      prompt
    });
    if (clientMutationId) {
      writeIdempotencyRecord(
        input.db,
        clientMutationId,
        { schemaVersion: 1, payloadDigest: digest, result },
        nowIso
      );
    }
    return {
      ok: true,
      code: "idea-planning-resumed",
      message: `Planning session resumed for ${ideaId}`,
      data: result
    };
  }

  const startedPrompt = buildPlanningChatPrompt({
    idea,
    ...lineage,
    mode: "started"
  });
  const persisted = await persistIdeaPlanningStart({
    db: input.db,
    idea,
    prompt: startedPrompt,
    nowIso,
    gitCanonical: input.gitCanonical,
    ctx: input.ctx,
    store: input.store,
    planning: input.planning,
    clientMutationId,
    policyApproval: input.policyApproval
  });
  if ("ok" in persisted) {
    return persisted;
  }
  const { idea: nextIdea, session } = persisted;
  const result = buildResult({
    idea: nextIdea,
    mode: "started",
    session,
    prompt: startedPrompt
  });
  if (clientMutationId) {
    writeIdempotencyRecord(
      input.db,
      clientMutationId,
      { schemaVersion: 1, payloadDigest: digest, result },
      nowIso
    );
  }
  return {
    ok: true,
    code: "idea-planning-started",
    message: `Planning session started for ${ideaId}`,
    data: result
  };
}
