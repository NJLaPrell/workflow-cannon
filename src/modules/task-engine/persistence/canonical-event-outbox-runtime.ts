import type { ModuleLifecycleContext } from "../../../contracts/module-contract.js";
import type { OpenedPlanningStores } from "./planning-open.js";
import { openPlanningStores } from "./planning-open.js";
import {
  canonicalEventOutboxTableAvailable,
  enqueueCanonicalEvent,
  getOutboxStatus,
  listPendingCanonicalEvents,
  markConflict,
  markFailed,
  markPublished,
  markPublishing,
  resetStalePublishing,
  type CanonicalEventOutboxRow,
  type CanonicalEventOutboxStatusSnapshot,
  type CanonicalPublishResult,
  type EnqueueCanonicalEventMetadata,
  type EnqueueCanonicalEventResult
} from "./canonical-event-outbox-store.js";
import type { CanonicalStateEventV1 } from "../task-state-events/canonical-state-events.js";

export type CanonicalEventOutboxRepository = {
  enqueueCanonicalEvent: (
    event: CanonicalStateEventV1,
    metadata?: EnqueueCanonicalEventMetadata
  ) => EnqueueCanonicalEventResult;
  listPendingCanonicalEvents: (limit: number) => CanonicalEventOutboxRow[];
  markPublishing: (ids: readonly string[]) => number;
  markPublished: (ids: readonly string[], publishResult: CanonicalPublishResult) => number;
  markFailed: (ids: readonly string[], error: string) => number;
  markConflict: (ids: readonly string[], conflict: string) => number;
  resetStalePublishing: (thresholdMs: number) => number;
  getOutboxStatus: () => CanonicalEventOutboxStatusSnapshot;
};

export type CanonicalEventOutboxRuntime = {
  planning: OpenedPlanningStores;
  repository: CanonicalEventOutboxRepository;
  close: () => void;
};

export function createCanonicalEventOutboxRepository(
  planning: OpenedPlanningStores
): CanonicalEventOutboxRepository {
  const db = planning.sqliteDual.getDatabase();
  if (!canonicalEventOutboxTableAvailable(db)) {
    throw new Error("Canonical event outbox table is unavailable (requires kit SQLite user_version 30+)");
  }
  return {
    enqueueCanonicalEvent: (event, metadata) => enqueueCanonicalEvent(db, event, metadata),
    listPendingCanonicalEvents: (limit) => listPendingCanonicalEvents(db, limit),
    markPublishing: (ids) => markPublishing(db, ids),
    markPublished: (ids, publishResult) => markPublished(db, ids, publishResult),
    markFailed: (ids, error) => markFailed(db, ids, error),
    markConflict: (ids, conflict) => markConflict(db, ids, conflict),
    resetStalePublishing: (thresholdMs) => resetStalePublishing(db, thresholdMs),
    getOutboxStatus: () => getOutboxStatus(db)
  };
}

export async function openCanonicalEventOutboxRuntime(
  ctx: ModuleLifecycleContext
): Promise<CanonicalEventOutboxRuntime> {
  const planning = await openPlanningStores(ctx);
  return {
    planning,
    repository: createCanonicalEventOutboxRepository(planning),
    close: () => planning.sqliteDual.closeDatabase()
  };
}
