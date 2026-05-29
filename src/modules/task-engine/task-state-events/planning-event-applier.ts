import { validatePhaseCatalogKey } from "../persistence/phase-catalog-store.js";
import type { KitWorkspaceStatusPublic } from "../persistence/workspace-status-store.js";
import type { PlanningStateEventV1 } from "./planning-event-payloads.js";
import type {
  PlanningPhaseCatalogRemovedPayloadV1,
  PlanningPhaseCatalogUpsertedPayloadV1,
  PlanningPhaseNoteArchivedPayloadV1,
  PlanningPhaseNoteCreatedPayloadV1,
  PlanningPhaseNoteSnapshotV1,
  PlanningPhaseNoteSuggestionCreatedPayloadV1,
  PlanningPhaseNoteSuggestionRemovedPayloadV1,
  PlanningPhaseNoteSuggestionUpdatedPayloadV1,
  PlanningPhaseNoteUpdatedPayloadV1,
  PlanningIdeaCreatedPayloadV1,
  PlanningIdeaUpdatedPayloadV1,
  PlanningWorkspaceStatusUpdatedPayloadV1
} from "./planning-event-payloads.js";
import {
  eventSnapshotToPhaseNoteRow,
  eventSnapshotToPhaseNoteSuggestionRow
} from "./planning-phase-note-event-utils.js";
import { eventSnapshotToWorkflowIdeaRow } from "./planning-idea-event-utils.js";
import type {
  PlanningStateApplierError,
  PlanningStateProjectionV1
} from "./planning-projection-types.js";

export function createEmptyPlanningStateProjection(
  lastUpdated = "1970-01-01T00:00:00.000Z"
): PlanningStateProjectionV1 {
  return {
    schemaVersion: 1,
    phaseCatalogByKey: {},
    phaseNotesById: {},
    phaseNoteSuggestionsById: {},
    ideasById: {},
    workspaceStatus: null,
    workspaceStatusAudits: [],
    appliedWorkspaceMutationIds: new Set<string>(),
    appliedNoteIdempotencyKeys: new Set<string>(),
    appliedSuggestionMutationIds: new Set<string>(),
    appliedIdeaMutationIds: new Set<string>(),
    lastEventSequence: 0,
    lastUpdated
  };
}

function bumpSequence(projection: PlanningStateProjectionV1, event: PlanningStateEventV1): void {
  projection.lastEventSequence = Math.max(projection.lastEventSequence, event.sequence);
  projection.lastUpdated = event.recordedAt;
}

function noteIdempotencyKey(
  event: PlanningStateEventV1,
  note: PlanningPhaseNoteSnapshotV1
): string | null {
  const fromNote = note.idempotencyKey?.trim();
  if (fromNote) {
    return fromNote;
  }
  const fromEvent = event.clientMutationId?.trim();
  return fromEvent && fromEvent.length > 0 ? fromEvent : null;
}

function cloneNoteRow(note: PlanningStateProjectionV1["phaseNotesById"][string]) {
  return { ...note, refs: note.refs.map((r) => ({ ...r })) };
}

function applyCatalogUpsert(
  projection: PlanningStateProjectionV1,
  event: PlanningStateEventV1,
  payload: PlanningPhaseCatalogUpsertedPayloadV1
): PlanningStateApplierError | null {
  const key = validatePhaseCatalogKey(payload.phaseKey);
  if (!key) {
    return {
      code: "phase-catalog-key-invalid",
      message: `invalid phaseKey '${payload.phaseKey}'`,
      eventId: event.eventId
    };
  }
  projection.phaseCatalogByKey[key] = {
    phaseKey: key,
    shortDescription: payload.shortDescription,
    updatedAt: payload.updatedAt
  };
  bumpSequence(projection, event);
  return null;
}

function applyCatalogRemoved(
  projection: PlanningStateProjectionV1,
  event: PlanningStateEventV1,
  payload: PlanningPhaseCatalogRemovedPayloadV1
): PlanningStateApplierError | null {
  const key = validatePhaseCatalogKey(payload.phaseKey);
  if (!key) {
    return {
      code: "phase-catalog-key-invalid",
      message: `invalid phaseKey '${payload.phaseKey}'`,
      eventId: event.eventId
    };
  }
  delete projection.phaseCatalogByKey[key];
  bumpSequence(projection, event);
  return null;
}

function applyPhaseNoteCreated(
  projection: PlanningStateProjectionV1,
  event: PlanningStateEventV1,
  payload: PlanningPhaseNoteCreatedPayloadV1
): PlanningStateApplierError | null {
  const idemKey = noteIdempotencyKey(event, payload.note);
  if (idemKey && projection.appliedNoteIdempotencyKeys.has(idemKey)) {
    bumpSequence(projection, event);
    return null;
  }
  if (projection.phaseNotesById[payload.note.id]) {
    bumpSequence(projection, event);
    return null;
  }
  projection.phaseNotesById[payload.note.id] = eventSnapshotToPhaseNoteRow(payload.note);
  if (idemKey) {
    projection.appliedNoteIdempotencyKeys.add(idemKey);
  }
  bumpSequence(projection, event);
  return null;
}

function applyPhaseNoteUpdated(
  projection: PlanningStateProjectionV1,
  event: PlanningStateEventV1,
  payload: PlanningPhaseNoteUpdatedPayloadV1
): PlanningStateApplierError | null {
  const mutationKey = event.clientMutationId?.trim();
  if (mutationKey && projection.appliedNoteIdempotencyKeys.has(`update:${mutationKey}`)) {
    bumpSequence(projection, event);
    return null;
  }
  projection.phaseNotesById[payload.note.id] = eventSnapshotToPhaseNoteRow(payload.note);
  if (mutationKey) {
    projection.appliedNoteIdempotencyKeys.add(`update:${mutationKey}`);
  }
  bumpSequence(projection, event);
  return null;
}

function applyPhaseNoteArchived(
  projection: PlanningStateProjectionV1,
  event: PlanningStateEventV1,
  payload: PlanningPhaseNoteArchivedPayloadV1
): PlanningStateApplierError | null {
  const mutationKey = event.clientMutationId?.trim();
  if (mutationKey && projection.appliedNoteIdempotencyKeys.has(`archive:${mutationKey}`)) {
    bumpSequence(projection, event);
    return null;
  }
  projection.phaseNotesById[payload.note.id] = eventSnapshotToPhaseNoteRow(payload.note);
  if (mutationKey) {
    projection.appliedNoteIdempotencyKeys.add(`archive:${mutationKey}`);
  }
  bumpSequence(projection, event);
  return null;
}

function applySuggestionCreated(
  projection: PlanningStateProjectionV1,
  event: PlanningStateEventV1,
  payload: PlanningPhaseNoteSuggestionCreatedPayloadV1
): PlanningStateApplierError | null {
  const mutationKey = event.clientMutationId?.trim();
  if (mutationKey && projection.appliedSuggestionMutationIds.has(mutationKey)) {
    bumpSequence(projection, event);
    return null;
  }
  const row = eventSnapshotToPhaseNoteSuggestionRow(payload.suggestion);
  projection.phaseNoteSuggestionsById[row.id] = row;
  if (mutationKey) {
    projection.appliedSuggestionMutationIds.add(mutationKey);
  }
  bumpSequence(projection, event);
  return null;
}

function applySuggestionUpdated(
  projection: PlanningStateProjectionV1,
  event: PlanningStateEventV1,
  payload: PlanningPhaseNoteSuggestionUpdatedPayloadV1
): PlanningStateApplierError | null {
  const mutationKey = event.clientMutationId?.trim();
  if (mutationKey && projection.appliedSuggestionMutationIds.has(mutationKey)) {
    bumpSequence(projection, event);
    return null;
  }
  const row = eventSnapshotToPhaseNoteSuggestionRow(payload.suggestion);
  projection.phaseNoteSuggestionsById[row.id] = row;
  if (mutationKey) {
    projection.appliedSuggestionMutationIds.add(mutationKey);
  }
  bumpSequence(projection, event);
  return null;
}

function applySuggestionRemoved(
  projection: PlanningStateProjectionV1,
  event: PlanningStateEventV1,
  payload: PlanningPhaseNoteSuggestionRemovedPayloadV1
): PlanningStateApplierError | null {
  const mutationKey = event.clientMutationId?.trim();
  if (mutationKey && projection.appliedSuggestionMutationIds.has(mutationKey)) {
    bumpSequence(projection, event);
    return null;
  }
  delete projection.phaseNoteSuggestionsById[payload.suggestionId];
  for (const [id, row] of Object.entries(projection.phaseNoteSuggestionsById)) {
    if (row.noteId === payload.noteId && id !== payload.suggestionId) {
      delete projection.phaseNoteSuggestionsById[id];
    }
  }
  if (mutationKey) {
    projection.appliedSuggestionMutationIds.add(mutationKey);
  }
  bumpSequence(projection, event);
  return null;
}

function applyIdeaCreated(
  projection: PlanningStateProjectionV1,
  event: PlanningStateEventV1,
  payload: PlanningIdeaCreatedPayloadV1
): PlanningStateApplierError | null {
  const mutationKey = event.clientMutationId?.trim();
  if (mutationKey && projection.appliedIdeaMutationIds.has(mutationKey)) {
    bumpSequence(projection, event);
    return null;
  }
  if (projection.ideasById[payload.idea.id]) {
    bumpSequence(projection, event);
    return null;
  }
  projection.ideasById[payload.idea.id] = eventSnapshotToWorkflowIdeaRow(payload.idea);
  if (mutationKey) {
    projection.appliedIdeaMutationIds.add(mutationKey);
  }
  bumpSequence(projection, event);
  return null;
}

function applyIdeaUpdated(
  projection: PlanningStateProjectionV1,
  event: PlanningStateEventV1,
  payload: PlanningIdeaUpdatedPayloadV1
): PlanningStateApplierError | null {
  const mutationKey = event.clientMutationId?.trim();
  if (mutationKey && projection.appliedIdeaMutationIds.has(`update:${mutationKey}`)) {
    bumpSequence(projection, event);
    return null;
  }
  if (payload.removed) {
    delete projection.ideasById[payload.idea.id];
  } else {
    projection.ideasById[payload.idea.id] = eventSnapshotToWorkflowIdeaRow(payload.idea);
  }
  if (mutationKey) {
    projection.appliedIdeaMutationIds.add(`update:${mutationKey}`);
  }
  bumpSequence(projection, event);
  return null;
}

function applyWorkspaceStatusUpdated(
  projection: PlanningStateProjectionV1,
  event: PlanningStateEventV1,
  payload: PlanningWorkspaceStatusUpdatedPayloadV1
): PlanningStateApplierError | null {
  const expected =
    event.expectedWorkspaceRevision ??
    (projection.workspaceStatus?.workspaceRevision ?? 0);
  const currentRevision = projection.workspaceStatus?.workspaceRevision ?? 0;
  if (currentRevision !== expected) {
    return {
      code: "workspace-revision-mismatch",
      message: `expectedWorkspaceRevision ${expected} does not match replayed revision ${currentRevision}`,
      eventId: event.eventId
    };
  }

  const mutationKey = event.clientMutationId?.trim();
  if (mutationKey && projection.appliedWorkspaceMutationIds.has(mutationKey)) {
    bumpSequence(projection, event);
    return null;
  }

  const beforeRevision = currentRevision;
  const after = payload.after;
  if (after.workspaceRevision !== beforeRevision + 1) {
    return {
      code: "replay-conflict",
      message: `after.workspaceRevision ${after.workspaceRevision} is not beforeRevision + 1`,
      eventId: event.eventId
    };
  }

  const next: KitWorkspaceStatusPublic = {
    workspaceRevision: after.workspaceRevision,
    currentKitPhase: after.currentKitPhase,
    nextKitPhase: after.nextKitPhase,
    activeFocus: after.activeFocus,
    lastUpdated: after.lastUpdated,
    blockers: [...after.blockers],
    pendingDecisions: [...after.pendingDecisions],
    nextAgentActions: [...after.nextAgentActions],
    updatedAt: after.updatedAt
  };
  projection.workspaceStatus = next;

  const details = JSON.stringify({
    patchKeys: Object.keys(payload.patch),
    clientMutationId: mutationKey ?? undefined,
    payloadDigest: payload.payloadDigest
  });
  projection.workspaceStatusAudits.push({
    eventKind: event.command.name,
    actor: event.actor?.id ?? null,
    command: event.command.name,
    revisionBefore: beforeRevision,
    revisionAfter: after.workspaceRevision,
    detailsJson: details,
    createdAt: event.recordedAt,
    clientMutationId: mutationKey
  });
  if (mutationKey) {
    projection.appliedWorkspaceMutationIds.add(mutationKey);
  }
  bumpSequence(projection, event);
  return null;
}

export function applyPlanningStateEvent(
  projection: PlanningStateProjectionV1,
  event: PlanningStateEventV1
): { ok: true; projection: PlanningStateProjectionV1 } | { ok: false; error: PlanningStateApplierError } {
  const next = {
    ...projection,
    phaseCatalogByKey: { ...projection.phaseCatalogByKey },
    phaseNotesById: Object.fromEntries(
      Object.entries(projection.phaseNotesById).map(([id, note]) => [id, cloneNoteRow(note)])
    ),
    phaseNoteSuggestionsById: { ...projection.phaseNoteSuggestionsById },
    ideasById: { ...projection.ideasById },
    workspaceStatus: projection.workspaceStatus ? { ...projection.workspaceStatus } : null,
    workspaceStatusAudits: [...projection.workspaceStatusAudits],
    appliedWorkspaceMutationIds: new Set(projection.appliedWorkspaceMutationIds),
    appliedNoteIdempotencyKeys: new Set(projection.appliedNoteIdempotencyKeys),
    appliedSuggestionMutationIds: new Set(projection.appliedSuggestionMutationIds),
    appliedIdeaMutationIds: new Set(projection.appliedIdeaMutationIds)
  };

  let err: PlanningStateApplierError | null = null;
  switch (event.kind) {
    case "planning.phase_catalog.upserted":
      err = applyCatalogUpsert(next, event, event.payload as PlanningPhaseCatalogUpsertedPayloadV1);
      break;
    case "planning.phase_catalog.removed":
      err = applyCatalogRemoved(next, event, event.payload as PlanningPhaseCatalogRemovedPayloadV1);
      break;
    case "planning.workspace_status.updated":
      err = applyWorkspaceStatusUpdated(next, event, event.payload as PlanningWorkspaceStatusUpdatedPayloadV1);
      break;
    case "planning.phase_note.created":
      err = applyPhaseNoteCreated(next, event, event.payload as PlanningPhaseNoteCreatedPayloadV1);
      break;
    case "planning.phase_note.updated":
      err = applyPhaseNoteUpdated(next, event, event.payload as PlanningPhaseNoteUpdatedPayloadV1);
      break;
    case "planning.phase_note.archived":
      err = applyPhaseNoteArchived(next, event, event.payload as PlanningPhaseNoteArchivedPayloadV1);
      break;
    case "planning.phase_note_suggestion.created":
      err = applySuggestionCreated(next, event, event.payload as PlanningPhaseNoteSuggestionCreatedPayloadV1);
      break;
    case "planning.phase_note_suggestion.updated":
      err = applySuggestionUpdated(next, event, event.payload as PlanningPhaseNoteSuggestionUpdatedPayloadV1);
      break;
    case "planning.phase_note_suggestion.removed":
      err = applySuggestionRemoved(next, event, event.payload as PlanningPhaseNoteSuggestionRemovedPayloadV1);
      break;
    case "planning.idea.created":
      err = applyIdeaCreated(next, event, event.payload as PlanningIdeaCreatedPayloadV1);
      break;
    case "planning.idea.updated":
      err = applyIdeaUpdated(next, event, event.payload as PlanningIdeaUpdatedPayloadV1);
      break;
    default:
      err = {
        code: "replay-conflict",
        message: `unknown planning kind ${(event as PlanningStateEventV1).kind}`,
        eventId: event.eventId
      };
  }

  if (err) {
    return { ok: false, error: err };
  }
  return { ok: true, projection: next };
}

export function replayPlanningStateEvents(events: PlanningStateEventV1[]): {
  ok: true;
  projection: PlanningStateProjectionV1;
} | {
  ok: false;
  error: PlanningStateApplierError;
} {
  let projection = createEmptyPlanningStateProjection();
  for (const event of events) {
    const applied = applyPlanningStateEvent(projection, event);
    if (!applied.ok) {
      return applied;
    }
    projection = applied.projection;
  }
  return { ok: true, projection };
}
