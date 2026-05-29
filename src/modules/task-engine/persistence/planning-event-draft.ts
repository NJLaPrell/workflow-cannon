import crypto from "node:crypto";
import type { KitWorkspaceStatusPublic, WorkspaceStatusUpdatePatch } from "../persistence/workspace-status-store.js";
import type {
  PlanningIdeaSnapshotV1,
  PlanningPhaseNoteSnapshotV1,
  PlanningPhaseNoteSuggestionSnapshotV1,
  PlanningStateEventKindV1,
  PlanningStateEventV1
} from "../task-state-events/planning-event-payloads.js";
import { TASK_STATE_EVENT_ENVELOPE_SCHEMA_VERSION } from "../task-state-events/types.js";
import type { DraftEventContext } from "./task-state-event-draft.js";

function baseActor(ctx: DraftEventContext): PlanningStateEventV1["actor"] {
  return { id: ctx.actorId?.trim() || "workspace-kit", source: "system" };
}

function draftPlanningEnvelope(
  kind: PlanningStateEventKindV1,
  payload: PlanningStateEventV1["payload"],
  ctx: DraftEventContext,
  options?: { expectedWorkspaceRevision?: number }
): PlanningStateEventV1 {
  const event: PlanningStateEventV1 = {
    schemaVersion: TASK_STATE_EVENT_ENVELOPE_SCHEMA_VERSION,
    eventId: `evt-${crypto.randomUUID()}`,
    sequence: 0,
    parentEventId: null,
    recordedAt: new Date().toISOString(),
    actor: baseActor(ctx),
    command: {
      name: ctx.commandName,
      moduleId: ctx.moduleId ?? "task-engine",
      invocationId: ctx.invocationId
    },
    kind,
    payload
  };
  if (ctx.clientMutationId?.trim()) {
    event.clientMutationId = ctx.clientMutationId.trim();
  }
  if (ctx.phaseKey?.trim() || ctx.gitHeadSha?.trim()) {
    event.workspace = {
      ...(ctx.gitHeadSha ? { gitHeadSha: ctx.gitHeadSha } : {}),
      ...(ctx.phaseKey ? { phaseKey: ctx.phaseKey } : {})
    };
  }
  if (options?.expectedWorkspaceRevision !== undefined) {
    event.expectedWorkspaceRevision = options.expectedWorkspaceRevision;
  }
  return event;
}

export function draftPlanningPhaseCatalogUpsertedEvent(args: {
  phaseKey: string;
  shortDescription: string | null;
  updatedAt: string;
  ctx: DraftEventContext;
}): PlanningStateEventV1 {
  return draftPlanningEnvelope(
    "planning.phase_catalog.upserted",
    {
      phaseKey: args.phaseKey,
      shortDescription: args.shortDescription,
      updatedAt: args.updatedAt
    },
    args.ctx
  );
}

export function draftPlanningPhaseCatalogRemovedEvent(args: {
  phaseKey: string;
  ctx: DraftEventContext;
}): PlanningStateEventV1 {
  return draftPlanningEnvelope(
    "planning.phase_catalog.removed",
    { phaseKey: args.phaseKey },
    args.ctx
  );
}

export function draftPlanningWorkspaceStatusUpdatedEvent(args: {
  patch: WorkspaceStatusUpdatePatch;
  before: KitWorkspaceStatusPublic;
  after: KitWorkspaceStatusPublic;
  payloadDigest?: string;
  ctx: DraftEventContext;
}): PlanningStateEventV1 {
  return draftPlanningEnvelope(
    "planning.workspace_status.updated",
    {
      patch: args.patch,
      after: {
        workspaceRevision: args.after.workspaceRevision,
        currentKitPhase: args.after.currentKitPhase,
        nextKitPhase: args.after.nextKitPhase,
        activeFocus: args.after.activeFocus,
        lastUpdated: args.after.lastUpdated,
        blockers: [...args.after.blockers],
        pendingDecisions: [...args.after.pendingDecisions],
        nextAgentActions: [...args.after.nextAgentActions],
        updatedAt: args.after.updatedAt
      },
      payloadDigest: args.payloadDigest
    },
    args.ctx,
    { expectedWorkspaceRevision: args.before.workspaceRevision }
  );
}

export function draftPlanningPhaseNoteCreatedEvent(args: {
  note: PlanningPhaseNoteSnapshotV1;
  ctx: DraftEventContext;
}): PlanningStateEventV1 {
  return draftPlanningEnvelope("planning.phase_note.created", { note: args.note }, args.ctx);
}

export function draftPlanningPhaseNoteUpdatedEvent(args: {
  note: PlanningPhaseNoteSnapshotV1;
  ctx: DraftEventContext;
}): PlanningStateEventV1 {
  return draftPlanningEnvelope("planning.phase_note.updated", { note: args.note }, args.ctx);
}

export function draftPlanningPhaseNoteArchivedEvent(args: {
  note: PlanningPhaseNoteSnapshotV1;
  ctx: DraftEventContext;
}): PlanningStateEventV1 {
  return draftPlanningEnvelope("planning.phase_note.archived", { note: args.note }, args.ctx);
}

export function draftPlanningPhaseNoteSuggestionCreatedEvent(args: {
  suggestion: PlanningPhaseNoteSuggestionSnapshotV1;
  ctx: DraftEventContext;
}): PlanningStateEventV1 {
  return draftPlanningEnvelope(
    "planning.phase_note_suggestion.created",
    { suggestion: args.suggestion },
    args.ctx
  );
}

export function draftPlanningPhaseNoteSuggestionUpdatedEvent(args: {
  suggestion: PlanningPhaseNoteSuggestionSnapshotV1;
  ctx: DraftEventContext;
}): PlanningStateEventV1 {
  return draftPlanningEnvelope(
    "planning.phase_note_suggestion.updated",
    { suggestion: args.suggestion },
    args.ctx
  );
}

export function draftPlanningPhaseNoteSuggestionRemovedEvent(args: {
  suggestionId: string;
  noteId: string;
  ctx: DraftEventContext;
}): PlanningStateEventV1 {
  return draftPlanningEnvelope(
    "planning.phase_note_suggestion.removed",
    { suggestionId: args.suggestionId, noteId: args.noteId },
    args.ctx
  );
}

export function draftPlanningIdeaCreatedEvent(args: {
  idea: PlanningIdeaSnapshotV1;
  ctx: DraftEventContext;
}): PlanningStateEventV1 {
  return draftPlanningEnvelope("planning.idea.created", { idea: args.idea }, args.ctx);
}

export function draftPlanningIdeaUpdatedEvent(args: {
  idea: PlanningIdeaSnapshotV1;
  removed?: boolean;
  ctx: DraftEventContext;
}): PlanningStateEventV1 {
  return draftPlanningEnvelope(
    "planning.idea.updated",
    { idea: args.idea, ...(args.removed ? { removed: true } : {}) },
    args.ctx
  );
}
