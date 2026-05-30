import type {
  CanonicalStateCompactResult,
  CanonicalStateEventEnvelopeV1,
  CanonicalStateHead,
  CanonicalStateSnapshotResult,
  CanonicalStateVerifyResult,
  FetchEventsInput,
  FetchEventsResult,
  PublishEventsInput,
  PublishEventsResult
} from "../../../contracts/canonical-state-sync-backend.js";
import type { CanonicalStateEventV1 } from "../task-state-events/canonical-state-events.js";

/** Event type accepted by backends — superset of contract envelope for typed publish/fetch. */
export type CanonicalStateSyncEvent = CanonicalStateEventV1;

export type CanonicalStateSyncBackend = {
  readonly backendId: string;

  readHead(): Promise<CanonicalStateHead | CanonicalSyncHeadFailure>;
  fetchEvents(input: FetchEventsInput): Promise<FetchEventsResult>;
  publishEvents(input: PublishEventsInput): Promise<PublishEventsResult>;
  verify?(): Promise<CanonicalStateVerifyResult>;
  compact?(input?: CanonicalStateCompactInput): Promise<CanonicalStateCompactResult>;
  snapshot?(input?: CanonicalStateSnapshotInput): Promise<CanonicalStateSnapshotResult>;
};

export type CanonicalSyncHeadFailure = {
  ok: false;
  code: string;
  message: string;
  retryable: boolean;
};

export type CanonicalStateCompactInput = {
  dryRun?: boolean;
};

export type CanonicalStateSnapshotInput = {
  dryRun?: boolean;
  snapshotId?: string;
};

/** Narrows publish input events to typed canonical events for backend implementations. */
export type PublishCanonicalEventsInput = Omit<PublishEventsInput, "events"> & {
  events: CanonicalStateSyncEvent[];
};

/** Runtime guard for pluggable backend registration and contract tests. */
export function assertCanonicalStateSyncBackend(value: unknown): asserts value is CanonicalStateSyncBackend {
  if (!value || typeof value !== "object") {
    throw new TypeError("CanonicalStateSyncBackend must be an object");
  }
  const backend = value as Partial<CanonicalStateSyncBackend>;
  if (typeof backend.backendId !== "string" || !backend.backendId.trim()) {
    throw new TypeError("CanonicalStateSyncBackend.backendId must be a non-empty string");
  }
  for (const method of ["readHead", "fetchEvents", "publishEvents"] as const) {
    if (typeof backend[method] !== "function") {
      throw new TypeError(`CanonicalStateSyncBackend.${method} must be a function`);
    }
  }
  for (const optional of ["verify", "compact", "snapshot"] as const) {
    if (backend[optional] !== undefined && typeof backend[optional] !== "function") {
      throw new TypeError(`CanonicalStateSyncBackend.${optional} must be a function when provided`);
    }
  }
}

/** Maps typed events to contract envelopes for wire serialization. */
export function toCanonicalStateEventEnvelope(event: CanonicalStateSyncEvent): CanonicalStateEventEnvelopeV1 {
  return {
    schemaVersion: event.schemaVersion,
    eventId: event.eventId,
    sequence: event.sequence,
    parentEventId: event.parentEventId,
    recordedAt: event.recordedAt,
    kind: event.kind,
    payload: "payload" in event ? event.payload : undefined
  };
}
