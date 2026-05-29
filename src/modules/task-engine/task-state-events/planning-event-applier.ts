import { validatePhaseCatalogKey } from "../persistence/phase-catalog-store.js";
import type { KitWorkspaceStatusPublic } from "../persistence/workspace-status-store.js";
import type { PlanningStateEventV1 } from "./planning-event-payloads.js";
import type {
  PlanningPhaseCatalogRemovedPayloadV1,
  PlanningPhaseCatalogUpsertedPayloadV1,
  PlanningWorkspaceStatusUpdatedPayloadV1
} from "./planning-event-payloads.js";
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
    workspaceStatus: null,
    workspaceStatusAudits: [],
    appliedWorkspaceMutationIds: new Set<string>(),
    lastEventSequence: 0,
    lastUpdated
  };
}

function bumpSequence(projection: PlanningStateProjectionV1, event: PlanningStateEventV1): void {
  projection.lastEventSequence = Math.max(projection.lastEventSequence, event.sequence);
  projection.lastUpdated = event.recordedAt;
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
    workspaceStatus: projection.workspaceStatus ? { ...projection.workspaceStatus } : null,
    workspaceStatusAudits: [...projection.workspaceStatusAudits],
    appliedWorkspaceMutationIds: new Set(projection.appliedWorkspaceMutationIds)
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
