import type { WorkflowModule } from "../../contracts/module-contract.js";
import { builtinInstructionEntriesForModule } from "../../contracts/builtin-run-command-manifest.js";
import { openPlanningStores } from "../../core/planning/index.js";
import { readIdempotencyValue } from "../task-engine/mutation-utils.js";
import { getPlanningGenerationPolicy } from "../task-engine/planning-config.js";
import {
  draftPlanningIdeaCreatedEvent,
  draftPlanningIdeaUpdatedEvent
} from "../task-engine/persistence/planning-event-draft.js";
import { isGitTaskStateCanonicalAuthority } from "../task-engine/persistence/task-state-canonical-authority.js";
import { ideaRecordToEventSnapshot } from "../task-engine/task-state-events/planning-idea-event-utils.js";
import { TaskEngineError } from "../task-engine/transitions.js";
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
import { publishIdeasPlanningEvents } from "./ideas-planning-events-runtime.js";
import { persistPlanningChatSession } from "./planning-chat-session.js";

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

export const ideasModule: WorkflowModule = {
  registration: {
    id: "ideas",
    version: "0.1.0",
    contractVersion: "1",
    stateSchema: 1,
    capabilities: ["ideas"],
    dependsOn: [],
    optionalPeers: ["planning"],
    enabledByDefault: true,
    config: {
      path: "src/modules/ideas/config.md",
      format: "md",
      description: "Lightweight idea capture records in kit SQLite for planner-chat workflows."
    },
    instructions: {
      directory: "src/modules/ideas/instructions",
      entries: builtinInstructionEntriesForModule("ideas")
    }
  },
  async onCommand(command, ctx) {
    const args = command.args ?? {};
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
    const store = planning.taskStore;
    const gitCanonical = isGitTaskStateCanonicalAuthority(ctx);
    const schemaOk = assertIdeasKitSchema(planning.sqliteDual.dbPath);
    if (!schemaOk.ok) {
      return { ok: false, code: "invalid-task-schema", message: schemaOk.message };
    }
    const planningGeneration = planning.sqliteDual.getPlanningGeneration();
    const policyApproval = args.policyApproval as { confirmed: boolean; rationale: string } | undefined;

    if (command.name === "create-idea") {
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

      if (gitCanonical) {
        const id = allocateNextIdeaId(db);
        const sortOrder = nextIdeaSortOrder(db);
        const ideaRecord = buildCreateIdeaRecord({
          title,
          note,
          status,
          linkedPlanArtifact,
          previousPlanArtifacts,
          id,
          sortOrder,
          nowIso
        });
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

      const idea = createIdea(
        db,
        { title, note, status, linkedPlanArtifact, previousPlanArtifacts },
        nowIso
      );
      const data: Record<string, unknown> = { responseSchemaVersion: 1, idea };
      attachPlanningMeta(data, ctx, planningGeneration);
      return { ok: true, code: "idea-created", message: `Idea ${idea.id} created`, data };
    }

    if (command.name === "get-idea") {
      const ideaId = cleanString(args.ideaId ?? args.id);
      if (!ideaId || !isIdeaId(ideaId)) {
        return { ok: false, code: "invalid-args", message: "get-idea requires ideaId shaped like I001" };
      }
      const idea = getIdea(db, ideaId);
      if (!idea) {
        return { ok: false, code: "idea-not-found", message: `Idea ${ideaId} was not found` };
      }
      const data: Record<string, unknown> = { responseSchemaVersion: 1, idea };
      attachPlanningMeta(data, ctx, planningGeneration);
      return { ok: true, code: "idea-retrieved", message: `Idea ${idea.id}`, data };
    }

    if (command.name === "list-ideas") {
      const status = args.status === undefined ? undefined : parseIdeaStatus(args.status);
      if (args.status !== undefined && !status) {
        return { ok: false, code: "invalid-args", message: "list-ideas status must be one of open | planning | planned" };
      }
      const ideas = listIdeas(db, status);
      const data: Record<string, unknown> = { responseSchemaVersion: 1, ideas, count: ideas.length };
      attachPlanningMeta(data, ctx, planningGeneration);
      return { ok: true, code: "ideas-listed", message: `${ideas.length} idea(s)`, data };
    }

    if (command.name === "update-idea") {
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

    if (command.name === "delete-idea") {
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

    if (command.name === "reorder-ideas") {
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

    return { ok: false, code: "unknown-command", message: `ideas does not implement ${command.name}` };
  }
};
