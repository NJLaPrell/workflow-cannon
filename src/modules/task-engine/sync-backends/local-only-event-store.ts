import { CANONICAL_STATE_SYNC_BACKEND_CONTRACT_VERSION } from "../../../contracts/canonical-state-sync-backend.js";
import type { CanonicalStateHead } from "../../../contracts/canonical-state-sync-backend.js";
import type { CanonicalStateEventV1 } from "../task-state-events/canonical-state-events.js";

export type LocalOnlySnapshotRecord = {
  snapshotId: string;
  throughSequence: number;
  throughEventId: string;
  contentDigest: string;
  createdAt: string;
};

export type LocalOnlyEventStore = {
  head: CanonicalStateHead;
  events: CanonicalStateEventV1[];
  snapshots: Map<string, LocalOnlySnapshotRecord>;
};

export function createEmptyLocalOnlyHead(now?: string): CanonicalStateHead {
  const recordedAt = now ?? new Date().toISOString();
  return {
    contractVersion: CANONICAL_STATE_SYNC_BACKEND_CONTRACT_VERSION,
    latestSequence: 0,
    latestEventId: null,
    backendRevision: "local-genesis",
    latestSnapshotId: null,
    recordedAt
  };
}

export function createLocalOnlyEventStore(now?: string): LocalOnlyEventStore {
  return {
    head: createEmptyLocalOnlyHead(now),
    events: [],
    snapshots: new Map()
  };
}

export function localOnlyRevisionForSequence(sequence: number): string {
  return `local-rev-${sequence}`;
}

export function updateLocalOnlyHead(
  head: CanonicalStateHead,
  next: { latestSequence: number; latestEventId: string | null; recordedAt?: string }
): CanonicalStateHead {
  const recordedAt = next.recordedAt ?? new Date().toISOString();
  return {
    ...head,
    latestSequence: next.latestSequence,
    latestEventId: next.latestEventId,
    backendRevision: localOnlyRevisionForSequence(next.latestSequence),
    recordedAt
  };
}
