import type Sqlite from "better-sqlite3";
import type { ModuleCommandResult, ModuleLifecycleContext } from "../../../contracts/module-contract.js";
import type { OpenedPlanningStores } from "../../task-engine/persistence/planning-open.js";
import { readIdempotencyValue } from "../../task-engine/mutation-utils.js";
import { getPlanningGenerationPolicy } from "../../task-engine/planning-config.js";
import {
  draftPlanningIdeaCreatedEvent,
  draftPlanningIdeaUpdatedEvent
} from "../../task-engine/persistence/planning-event-draft.js";
import { isPlanningGitSyncPublishActive } from "../../task-engine/persistence/planning-canonical-sync-domains.js";
import { ideaRecordToEventSnapshot } from "../../task-engine/task-state-events/planning-idea-event-utils.js";
import type { TaskStore } from "../../task-engine/persistence/store.js";
import { readActiveDraftPlanArtifact } from "../../ideas/idea-planning-metadata.js";
import { publishIdeasPlanningEvents } from "../../ideas/ideas-planning-events-runtime.js";
import { readIdeaPlanArtifact } from "../../ideas/idea-plan-artifact-storage.js";
import { createUnifiedIdeaPlanDocumentForIdea } from "./migrate-ideas-to-unified-document.js";
import { persistPlanningChatSession } from "../../ideas/planning-chat-session.js";
import {
  assertIdeasKitSchema,
  allocateNextIdeaId,
  createIdea,
  deleteIdea,
  getIdea,
  isIdeaId,
  listIdeas,
  nextIdeaSortOrder,
  reorderIdeas,
  updateIdea,
  parseIdeaStatus,
  type IdeaRecord,
  type IdeaStatus
} from "./idea-store.js";

const CRUD_COMMANDS = new Set([
  "create-idea",
  "get-idea",
  "list-ideas",
  "update-idea",
  "delete-idea",
  "reorder-ideas"
]);

export function isIdeaCrudCommand(commandName: string): boolean {
  return CRUD_COMMANDS.has(commandName);
}

function attachPlanningMeta(
  data: Record<string, unknown>,
  ctx: { effectiveConfig?: Record<string, unknown> },
  planningGeneration: number
): void {
  data.planningGeneration = planningGeneration;
  data.planningGenerationPolicy = getPlanningGenerationPolicy({
    effectiveConfig: ctx.effectiveConfig as Record<string, unknown> | undefined
  });
}

function cleanString(raw: unknown): string | undefined {
  return typeof raw === "string" && raw.trim() ? raw.trim() : undefined;
}

function cleanStringArray(raw: unknown): string[] | undefined {
  if (raw === undefined) {
    return undefined;
  }
  if (!Array.isArray(raw) || !raw.every((value) => typeof value === "string" && value.trim())) {
    return undefined;
  }
  return raw.map((value) => value.trim());
}

function cleanNullableString(raw: unknown): string | null | undefined {
  if (raw === null) {
    return null;
  }
  return cleanString(raw);
}

function ideaDraftCtx(commandName: string, clientMutationId?: string) {
  return {
    commandName,
    moduleId: "ideas",
    clientMutationId
  };
}

function buildCreateIdeaRecord(input: {
  title: string;
  note?: string;
  status?: IdeaStatus;
  linkedPlanArtifact?: string;
  previousPlanArtifacts?: string[];
  id: string;
  sortOrder: number;
  nowIso: string;
}): IdeaRecord {
  const status = input.status ?? "open";
  const previousPlanArtifacts = input.previousPlanArtifacts ?? [];
  return {
    id: input.id,
    title: input.title,
    ...(input.note ? { note: input.note } : {}),
    status,
    sortOrder: input.sortOrder,
    ...(input.linkedPlanArtifact ? { linkedPlanArtifact: input.linkedPlanArtifact } : {}),
    previousPlanArtifacts,
    createdAt: input.nowIso,
    updatedAt: input.nowIso
  };
}

function buildUpdatedIdeaRecord(
  existing: IdeaRecord,
  input: {
    title?: string;
    note?: string | null;
    status?: IdeaStatus;
    linkedPlanArtifact?: string | null;
    previousPlanArtifacts?: string[];
  },
  nowIso: string
): IdeaRecord {
  return {
    id: existing.id,
    title: input.title ?? existing.title,
    note:
      input.note === undefined
        ? existing.note
        : input.note === null
          ? undefined
          : input.note,
    status: input.status ?? existing.status,
    sortOrder: existing.sortOrder,
    linkedPlanArtifact:
      input.linkedPlanArtifact === undefined
        ? existing.linkedPlanArtifact
        : input.linkedPlanArtifact === null
          ? undefined
          : input.linkedPlanArtifact,
    previousPlanArtifacts: input.previousPlanArtifacts ?? existing.previousPlanArtifacts,
    createdAt: existing.createdAt,
    updatedAt: nowIso
  };
}

export type IdeaCrudCommandContext = {
  db: Sqlite.Database;
  store: TaskStore;
  planning: OpenedPlanningStores;
  planningGeneration: number;
  gitCanonical: boolean;
  policyApproval?: { confirmed: boolean; rationale: string };
};

export async function runIdeaCrudCommand(
  commandName: string,
  args: Record<string, unknown>,
  ctx: ModuleLifecycleContext,
  crudCtx: IdeaCrudCommandContext
): Promise<ModuleCommandResult | null> {
  if (!isIdeaCrudCommand(commandName)) {
    return null;
  }

  const { db, store, planning, planningGeneration, gitCanonical, policyApproval } = crudCtx;
  const schemaOk = assertIdeasKitSchema(planning.sqliteDual.dbPath);
  if (!schemaOk.ok) {
    return { ok: false, code: "invalid-task-schema", message: schemaOk.message };
  }

  if (commandName === "create-idea") {
    const title = cleanString(args.title);
    if (!title) {
      return { ok: false, code: "invalid-args", message: "create-idea requires non-empty title" };
    }
    const note = cleanString(args.note);
    const status = args.status === undefined ? undefined : parseIdeaStatus(args.status);
    if (args.status !== undefined && !status) {
      return {
        ok: false,
        code: "invalid-args",
        message: "create-idea status must be one of open | planning | planned"
      };
    }
    const linkedPlanArtifact = cleanString(args.linkedPlanArtifact);
    const previousPlanArtifacts = cleanStringArray(args.previousPlanArtifacts);
    if (args.previousPlanArtifacts !== undefined && !previousPlanArtifacts) {
      return {
        ok: false,
        code: "invalid-args",
        message: "create-idea previousPlanArtifacts must be an array of non-empty strings"
      };
    }
    const clientMutationId = readIdempotencyValue(args);
    const nowIso = new Date().toISOString();
    const workspacePath = ctx.workspacePath ?? process.cwd();

    if (gitCanonical) {
      const id = allocateNextIdeaId(db);
      const sortOrder = nextIdeaSortOrder(db);
      let ideaRecord = buildCreateIdeaRecord({
        title,
        note,
        status,
        linkedPlanArtifact,
        previousPlanArtifacts,
        id,
        sortOrder,
        nowIso
      });
      if (!linkedPlanArtifact) {
        ideaRecord = createUnifiedIdeaPlanDocumentForIdea(workspacePath, db, ideaRecord, nowIso).idea;
      }
      const publishErr = await publishIdeasPlanningEvents({
        ctx,
        store,
        planning,
        events: [
          draftPlanningIdeaCreatedEvent({
            idea: ideaRecordToEventSnapshot(ideaRecord),
            ctx: ideaDraftCtx("create-idea", clientMutationId)
          })
        ],
        policyApproval
      });
      if (publishErr) {
        return publishErr;
      }
      const idea = getIdea(db, id);
      if (!idea) {
        return { ok: false, code: "storage-read-error", message: "Idea missing after canonical publish." };
      }
      const data: Record<string, unknown> = { responseSchemaVersion: 1, idea };
      attachPlanningMeta(data, ctx, planningGeneration);
      return { ok: true, code: "idea-created", message: `Idea ${idea.id} created`, data };
    }

    let idea = createIdea(
      db,
      { title, note, status, linkedPlanArtifact, previousPlanArtifacts },
      nowIso
    );
    if (!linkedPlanArtifact) {
      idea = createUnifiedIdeaPlanDocumentForIdea(workspacePath, db, idea, nowIso).idea;
    }
    const data: Record<string, unknown> = { responseSchemaVersion: 1, idea };
    attachPlanningMeta(data, ctx, planningGeneration);
    return { ok: true, code: "idea-created", message: `Idea ${idea.id} created`, data };
  }

  if (commandName === "get-idea") {
    const ideaId = cleanString(args.ideaId ?? args.id);
    if (!ideaId || !isIdeaId(ideaId)) {
      return { ok: false, code: "invalid-args", message: "get-idea requires ideaId shaped like I001" };
    }
    const idea = getIdea(db, ideaId);
    if (!idea) {
      return { ok: false, code: "idea-not-found", message: `Idea ${ideaId} was not found` };
    }
    const planRef = idea.linkedPlanArtifact ?? readActiveDraftPlanArtifact(db, ideaId);
    const ideaPlan = planRef ? readIdeaPlanArtifact(ctx.workspacePath ?? process.cwd(), planRef) : null;
    const data: Record<string, unknown> = {
      responseSchemaVersion: 1,
      idea,
      ...(ideaPlan ? { ideaPlan } : {})
    };
    attachPlanningMeta(data, ctx, planningGeneration);
    return { ok: true, code: "idea-retrieved", message: `Idea ${idea.id}`, data };
  }

  if (commandName === "list-ideas") {
    const status = args.status === undefined ? undefined : parseIdeaStatus(args.status);
    if (args.status !== undefined && !status) {
      return { ok: false, code: "invalid-args", message: "list-ideas status must be one of open | planning | planned" };
    }
    const ideas = listIdeas(db, status);
    const data: Record<string, unknown> = { responseSchemaVersion: 1, ideas, count: ideas.length };
    attachPlanningMeta(data, ctx, planningGeneration);
    return { ok: true, code: "ideas-listed", message: `${ideas.length} idea(s)`, data };
  }

  if (commandName === "update-idea") {
    const ideaId = cleanString(args.ideaId ?? args.id);
    if (!ideaId || !isIdeaId(ideaId)) {
      return { ok: false, code: "invalid-args", message: "update-idea requires ideaId shaped like I001" };
    }
    const title = args.title === undefined ? undefined : cleanString(args.title);
    if (args.title !== undefined && !title) {
      return { ok: false, code: "invalid-args", message: "update-idea title must be a non-empty string" };
    }
    const note = args.note === undefined ? undefined : cleanNullableString(args.note);
    if (args.note !== undefined && note === undefined) {
      return { ok: false, code: "invalid-args", message: "update-idea note must be a non-empty string or null" };
    }
    const status = args.status === undefined ? undefined : parseIdeaStatus(args.status);
    if (args.status !== undefined && !status) {
      return { ok: false, code: "invalid-args", message: "update-idea status must be one of open | planning | planned" };
    }
    const linkedPlanArtifact =
      args.linkedPlanArtifact === undefined ? undefined : cleanNullableString(args.linkedPlanArtifact);
    if (args.linkedPlanArtifact !== undefined && linkedPlanArtifact === undefined) {
      return {
        ok: false,
        code: "invalid-args",
        message: "update-idea linkedPlanArtifact must be a non-empty string or null"
      };
    }
    const previousPlanArtifacts = cleanStringArray(args.previousPlanArtifacts);
    if (args.previousPlanArtifacts !== undefined && !previousPlanArtifacts) {
      return {
        ok: false,
        code: "invalid-args",
        message: "update-idea previousPlanArtifacts must be an array of non-empty strings"
      };
    }
    const nowIso = new Date().toISOString();
    const clientMutationId = readIdempotencyValue(args);
    const resumePrompt = cleanString(args.planningChatPrompt ?? args.resumePrompt);

    if (gitCanonical) {
      const existing = getIdea(db, ideaId);
      if (!existing) {
        return { ok: false, code: "idea-not-found", message: `Idea ${ideaId} was not found` };
      }
      const nextRecord = buildUpdatedIdeaRecord(
        existing,
        { title, note, status, linkedPlanArtifact, previousPlanArtifacts },
        nowIso
      );
      const publishErr = await publishIdeasPlanningEvents({
        ctx,
        store,
        planning,
        events: [
          draftPlanningIdeaUpdatedEvent({
            idea: ideaRecordToEventSnapshot(nextRecord),
            ctx: ideaDraftCtx("update-idea", clientMutationId)
          })
        ],
        policyApproval
      });
      if (publishErr) {
        return publishErr;
      }
      const idea = getIdea(db, ideaId);
      if (!idea) {
        return { ok: false, code: "storage-read-error", message: "Idea missing after canonical publish." };
      }
      if (status === "planning") {
        persistPlanningChatSession(
          db,
          { ideaId: idea.id, title: idea.title, note: idea.note, resumePrompt },
          nowIso
        );
      }
      const data: Record<string, unknown> = { responseSchemaVersion: 1, idea };
      attachPlanningMeta(data, ctx, planningGeneration);
      return { ok: true, code: "idea-updated", message: `Idea ${idea.id} updated`, data };
    }

    let idea = null as ReturnType<typeof updateIdea>;
    db.transaction(() => {
      idea = updateIdea(
        db,
        ideaId,
        { title, note, status, linkedPlanArtifact, previousPlanArtifacts },
        nowIso
      );
      if (idea && status === "planning") {
        persistPlanningChatSession(
          db,
          { ideaId: idea.id, title: idea.title, note: idea.note, resumePrompt },
          nowIso
        );
      }
    })();
    if (!idea) {
      return { ok: false, code: "idea-not-found", message: `Idea ${ideaId} was not found` };
    }
    const data: Record<string, unknown> = { responseSchemaVersion: 1, idea };
    attachPlanningMeta(data, ctx, planningGeneration);
    return { ok: true, code: "idea-updated", message: `Idea ${idea.id} updated`, data };
  }

  if (commandName === "delete-idea") {
    const ideaId = cleanString(args.ideaId ?? args.id);
    if (!ideaId || !isIdeaId(ideaId)) {
      return { ok: false, code: "invalid-args", message: "delete-idea requires ideaId shaped like I001" };
    }
    const clientMutationId = readIdempotencyValue(args);

    if (gitCanonical) {
      const existing = getIdea(db, ideaId);
      if (!existing) {
        return { ok: false, code: "idea-not-found", message: `Idea ${ideaId} was not found` };
      }
      const publishErr = await publishIdeasPlanningEvents({
        ctx,
        store,
        planning,
        events: [
          draftPlanningIdeaUpdatedEvent({
            idea: ideaRecordToEventSnapshot(existing),
            removed: true,
            ctx: ideaDraftCtx("delete-idea", clientMutationId)
          })
        ],
        policyApproval
      });
      if (publishErr) {
        return publishErr;
      }
      const data: Record<string, unknown> = { responseSchemaVersion: 1, idea: existing, deleted: true };
      attachPlanningMeta(data, ctx, planningGeneration);
      return { ok: true, code: "idea-deleted", message: `Idea ${existing.id} deleted`, data };
    }

    const idea = deleteIdea(db, ideaId);
    if (!idea) {
      return { ok: false, code: "idea-not-found", message: `Idea ${ideaId} was not found` };
    }
    const data: Record<string, unknown> = { responseSchemaVersion: 1, idea, deleted: true };
    attachPlanningMeta(data, ctx, planningGeneration);
    return { ok: true, code: "idea-deleted", message: `Idea ${idea.id} deleted`, data };
  }

  if (commandName === "reorder-ideas") {
    const ideaIds = cleanStringArray(args.ideaIds ?? args.ids);
    if (!ideaIds || ideaIds.length === 0 || ideaIds.some((id) => !isIdeaId(id))) {
      return { ok: false, code: "invalid-args", message: "reorder-ideas requires ideaIds shaped like I001" };
    }
    const nowIso = new Date().toISOString();
    const clientMutationId = readIdempotencyValue(args);

    if (gitCanonical) {
      const current = listIdeas(db);
      const currentIds = current.map((idea) => idea.id);
      if (ideaIds.length !== currentIds.length) {
        return {
          ok: false,
          code: "invalid-args",
          message: "reorder-ideas ideaIds must contain each existing idea exactly once"
        };
      }
      const currentSet = new Set(currentIds);
      const nextSet = new Set(ideaIds);
      if (
        nextSet.size !== ideaIds.length ||
        currentIds.some((id) => !nextSet.has(id)) ||
        ideaIds.some((id) => !currentSet.has(id))
      ) {
        return {
          ok: false,
          code: "invalid-args",
          message: "reorder-ideas ideaIds must contain each existing idea exactly once"
        };
      }
      const byId = new Map(current.map((idea) => [idea.id, idea]));
      const events = ideaIds
        .map((id, index) => {
          const existing = byId.get(id);
          if (!existing || existing.sortOrder === index) {
            return null;
          }
          const nextRecord: IdeaRecord = { ...existing, sortOrder: index, updatedAt: nowIso };
          return draftPlanningIdeaUpdatedEvent({
            idea: ideaRecordToEventSnapshot(nextRecord),
            ctx: ideaDraftCtx("reorder-ideas", clientMutationId ? `${clientMutationId}:${id}` : undefined)
          });
        })
        .filter((event): event is NonNullable<typeof event> => event !== null);
      if (events.length > 0) {
        const publishErr = await publishIdeasPlanningEvents({
          ctx,
          store,
          planning,
          events,
          policyApproval
        });
        if (publishErr) {
          return publishErr;
        }
      }
      const ideas = listIdeas(db);
      const data: Record<string, unknown> = { responseSchemaVersion: 1, ideas, count: ideas.length };
      attachPlanningMeta(data, ctx, planningGeneration);
      return { ok: true, code: "ideas-reordered", message: `${ideas.length} idea(s) reordered`, data };
    }

    const ideas = reorderIdeas(db, ideaIds, nowIso);
    if (!ideas) {
      return {
        ok: false,
        code: "invalid-args",
        message: "reorder-ideas ideaIds must contain each existing idea exactly once"
      };
    }
    const data: Record<string, unknown> = { responseSchemaVersion: 1, ideas, count: ideas.length };
    attachPlanningMeta(data, ctx, planningGeneration);
    return { ok: true, code: "ideas-reordered", message: `${ideas.length} idea(s) reordered`, data };
  }

  return null;
}
