import crypto from "node:crypto";
import type {
  CanonicalStateCompactResult,
  CanonicalStateEventEnvelopeV1,
  CanonicalStateHead,
  CanonicalStateSnapshotResult,
  CanonicalStateVerifyFinding,
  CanonicalStateVerifyResult,
  FetchEventsInput,
  FetchEventsResult,
  PublishEventsInput,
  PublishEventsResult
} from "../../../contracts/canonical-state-sync-backend.js";
import {
  assignEventSequences,
  detectTaskVersionConflict,
  taskVersionMapFromProjection
} from "../task-state-git/publish-task-state-events.js";
import type { CanonicalStateEventV1 } from "../task-state-events/canonical-state-events.js";
import { isPlanningStateEvent, isTaskStateEvent } from "../task-state-events/canonical-state-events.js";
import type { CanonicalStateSyncBackend } from "./canonical-state-sync-backend.js";
import { toCanonicalStateEventEnvelope } from "./canonical-state-sync-backend.js";
import {
  createLocalOnlyEventStore,
  localOnlyRevisionForSequence,
  updateLocalOnlyHead,
  type LocalOnlyEventStore
} from "./local-only-event-store.js";
import { projectionRowsForEvents, replayLocalOnlyEvents } from "./local-only-projection.js";

export const LOCAL_ONLY_BACKEND_ID = "local-only" as const;

export type LocalOnlyBackendDiagnostics = {
  mode: typeof LOCAL_ONLY_BACKEND_ID;
  remotePublication: false;
  gitRequired: false;
};

export function localOnlyDiagnostics(
  extra?: Record<string, unknown>
): LocalOnlyBackendDiagnostics & Record<string, unknown> {
  return {
    mode: LOCAL_ONLY_BACKEND_ID,
    remotePublication: false,
    gitRequired: false,
    ...extra
  };
}

export type CreateLocalOnlyBackendOptions = {
  store?: LocalOnlyEventStore;
};

function envelopeEvents(events: readonly CanonicalStateEventV1[]): CanonicalStateEventEnvelopeV1[] {
  return events.map((event) => toCanonicalStateEventEnvelope(event));
}

function filterEventsAfterSequence(
  events: readonly CanonicalStateEventV1[],
  afterSequence: number,
  throughSequence?: number,
  limit?: number
): CanonicalStateEventV1[] {
  let filtered = events.filter((event) => event.sequence > afterSequence);
  if (typeof throughSequence === "number" && Number.isFinite(throughSequence)) {
    filtered = filtered.filter((event) => event.sequence <= throughSequence);
  }
  if (typeof limit === "number" && Number.isFinite(limit) && limit > 0) {
    filtered = filtered.slice(0, Math.trunc(limit));
  }
  return filtered;
}

function headRevisionMatches(head: CanonicalStateHead, expectedRevision: string, expectedSequence: number): boolean {
  return head.backendRevision === expectedRevision && head.latestSequence === expectedSequence;
}

function verifyEventChain(events: readonly CanonicalStateEventV1[]): CanonicalStateVerifyFinding[] {
  const findings: CanonicalStateVerifyFinding[] = [];
  let expectedSequence = 0;
  let expectedParent: string | null = null;
  for (const event of events) {
    expectedSequence += 1;
    if (event.sequence !== expectedSequence) {
      findings.push({
        code: "sequence-gap",
        message: `Expected sequence ${expectedSequence}, found ${event.sequence}`,
        path: event.eventId
      });
    }
    if (event.parentEventId !== expectedParent) {
      findings.push({
        code: "parent-mismatch",
        message: `Expected parent ${expectedParent ?? "null"}, found ${event.parentEventId ?? "null"}`,
        path: event.eventId
      });
    }
    expectedParent = event.eventId;
  }
  return findings;
}

export function createLocalOnlyBackend(options: CreateLocalOnlyBackendOptions = {}): CanonicalStateSyncBackend {
  const store = options.store ?? createLocalOnlyEventStore();

  const backend: CanonicalStateSyncBackend = {
    backendId: LOCAL_ONLY_BACKEND_ID,

    async readHead() {
      return {
        ...store.head,
        recordedAt: store.head.recordedAt
      };
    },

    async fetchEvents(input: FetchEventsInput): Promise<FetchEventsResult> {
      const afterSequence = typeof input.afterSequence === "number" ? input.afterSequence : 0;
      const events = filterEventsAfterSequence(
        store.events,
        afterSequence,
        input.throughSequence,
        input.limit
      );
      const rows = projectionRowsForEvents(store.events);
      return {
        ok: true,
        head: { ...store.head },
        events: envelopeEvents(events),
        taskVersions: rows.taskVersions,
        planningVersions: rows.planningVersions,
        diagnostics: localOnlyDiagnostics({ refresh: input.refresh === true })
      };
    },

    async publishEvents(input: PublishEventsInput): Promise<PublishEventsResult> {
      if (!Array.isArray(input.events) || input.events.length === 0) {
        return {
          ok: false,
          code: "publish-empty-batch",
          message: "publishEvents requires at least one event",
          retryable: false,
          diagnostics: localOnlyDiagnostics()
        };
      }

      const expectedHead = input.expectedHead;
      if (
        !headRevisionMatches(store.head, expectedHead.backendRevision, expectedHead.latestSequence)
      ) {
        return {
          ok: false,
          code: "head-conflict",
          message: "Local-only head revision does not match expectedHead",
          retryable: true,
          conflict: {
            code: "head-conflict",
            message: "Stale expectedHead for local-only backend",
            retryable: true,
            diagnostics: localOnlyDiagnostics({
              expectedHead,
              actualHead: store.head
            })
          },
          diagnostics: localOnlyDiagnostics({ expectedHead, actualHead: store.head })
        };
      }

      const replay = replayLocalOnlyEvents(store.events);
      const remoteVersions = taskVersionMapFromProjection(replay.taskProjection);
      const conflict = detectTaskVersionConflict({
        expectedTaskVersions: input.expectedTaskVersions,
        remoteVersions,
        events: input.events as CanonicalStateEventV1[]
      });
      if (conflict) {
        return {
          ok: false,
          code: "task-version-conflict",
          message: `Task ${conflict.taskId} version conflict: expected ${conflict.expected}, actual ${conflict.actual}`,
          retryable: true,
          conflict: {
            code: "task-version-conflict",
            message: `Task ${conflict.taskId} version conflict`,
            retryable: true,
            taskId: conflict.taskId,
            expectedVersion: conflict.expected,
            actualVersion: conflict.actual,
            diagnostics: localOnlyDiagnostics()
          },
          diagnostics: localOnlyDiagnostics({ conflict })
        };
      }

      const published = assignEventSequences(input.events as CanonicalStateEventV1[], {
        latestSequence: store.head.latestSequence,
        latestEventId: store.head.latestEventId
      });

      const merged = [...store.events, ...published];
      try {
        replayLocalOnlyEvents(merged);
      } catch (error) {
        return {
          ok: false,
          code: "event-admission-rejected",
          message: (error as Error).message,
          retryable: false,
          diagnostics: localOnlyDiagnostics()
        };
      }

      store.events.push(...published);
      const last = published.at(-1)!;
      store.head = updateLocalOnlyHead(store.head, {
        latestSequence: last.sequence,
        latestEventId: last.eventId
      });

      return {
        ok: true,
        head: { ...store.head },
        publishedEvents: envelopeEvents(published),
        attempts: 1,
        diagnostics: localOnlyDiagnostics({ publishedCount: published.length })
      };
    },

    async verify(): Promise<CanonicalStateVerifyResult> {
      const findings = verifyEventChain(store.events);
      if (store.head.latestSequence !== store.events.length) {
        findings.push({
          code: "head-sequence-mismatch",
          message: `Head latestSequence ${store.head.latestSequence} != event count ${store.events.length}`
        });
      }
      const lastEvent = store.events.at(-1);
      if (lastEvent && store.head.latestEventId !== lastEvent.eventId) {
        findings.push({
          code: "head-event-id-mismatch",
          message: `Head latestEventId does not match tail event`
        });
      }
      if (store.head.backendRevision !== localOnlyRevisionForSequence(store.head.latestSequence)) {
        findings.push({
          code: "head-revision-mismatch",
          message: `Head backendRevision ${store.head.backendRevision} != ${localOnlyRevisionForSequence(store.head.latestSequence)}`
        });
      }
      return {
        passed: findings.length === 0,
        findingCount: findings.length,
        findings,
        diagnostics: localOnlyDiagnostics({ eventCount: store.events.length })
      };
    },

    async compact(input = {}) {
      const dryRun = input.dryRun !== false;
      const retainedEventSegmentCount = store.events.length > 0 ? 1 : 0;
      return {
        ok: true,
        code: dryRun ? "compact-dry-run" : "compact-not-supported",
        message: dryRun
          ? "Local-only backend retains all events in memory (dry-run)"
          : "Local-only backend does not trim events; use snapshot for checkpoints",
        dryRun,
        latestSequence: store.head.latestSequence,
        latestSnapshotId: store.head.latestSnapshotId,
        retainedEventSegmentCount,
        diagnostics: localOnlyDiagnostics()
      } satisfies CanonicalStateCompactResult;
    },

    async snapshot(input = {}) {
      const dryRun = input.dryRun !== false;
      const snapshotId =
        typeof input.snapshotId === "string" && input.snapshotId.trim()
          ? input.snapshotId.trim()
          : `snap-local-${store.head.latestSequence || "genesis"}`;
      const throughSequence = store.head.latestSequence;
      const throughEventId = store.head.latestEventId ?? "none";
      const contentDigest = crypto
        .createHash("sha256")
        .update(JSON.stringify(store.events))
        .digest("hex");
      const taskCount = replayLocalOnlyEvents(store.events).taskProjection.taskVersions.length;

      if (!dryRun) {
        store.snapshots.set(snapshotId, {
          snapshotId,
          throughSequence,
          throughEventId,
          contentDigest,
          createdAt: new Date().toISOString()
        });
        store.head = {
          ...store.head,
          latestSnapshotId: snapshotId,
          recordedAt: new Date().toISOString()
        };
      }

      return {
        ok: true,
        code: dryRun ? "snapshot-dry-run" : "snapshot-created",
        message: dryRun ? "Local-only snapshot dry-run" : "Local-only snapshot recorded",
        dryRun,
        snapshotId,
        throughSequence,
        throughEventId,
        contentDigest,
        taskCount,
        head: { ...store.head },
        diagnostics: localOnlyDiagnostics({ snapshotId })
      } satisfies CanonicalStateSnapshotResult;
    }
  };

  return backend;
}

export function isLocalOnlyBackend(backend: CanonicalStateSyncBackend): boolean {
  return backend.backendId === LOCAL_ONLY_BACKEND_ID;
}

/** True when an event batch only contains planning.* kinds (no task.*). */
export function isPlanningOnlyEventBatch(events: readonly CanonicalStateEventEnvelopeV1[]): boolean {
  return events.length > 0 && events.every((event) => event.kind.startsWith("planning."));
}

/** Exported for tests — detect mixed task/planning publish batches. */
export function classifyLocalOnlyEventBatch(events: readonly CanonicalStateEventEnvelopeV1[]): {
  taskEvents: number;
  planningEvents: number;
} {
  let taskEvents = 0;
  let planningEvents = 0;
  for (const event of events) {
    if (isTaskStateEvent(event as CanonicalStateEventV1)) {
      taskEvents += 1;
    } else if (isPlanningStateEvent(event as CanonicalStateEventV1)) {
      planningEvents += 1;
    }
  }
  return { taskEvents, planningEvents };
}
