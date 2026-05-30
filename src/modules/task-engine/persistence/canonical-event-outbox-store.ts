import crypto from "node:crypto";
import type Database from "better-sqlite3";
import {
  KIT_CANONICAL_EVENT_OUTBOX_TABLE,
  kitSqliteHasCanonicalEventOutbox
} from "../../../core/state/workspace-kit-sqlite.js";
import type { CanonicalStateEventV1 } from "../task-state-events/canonical-state-events.js";
import { taskIdsTouchedByEvent } from "../task-state-git/publish-task-state-events.js";

export const CANONICAL_EVENT_OUTBOX_STATUSES = [
  "pending",
  "publishing",
  "published",
  "failed",
  "conflict"
] as const;

export type CanonicalEventOutboxStatus = (typeof CANONICAL_EVENT_OUTBOX_STATUSES)[number];

export type CanonicalEventOutboxRow = {
  id: string;
  eventId: string;
  eventKind: string;
  event: CanonicalStateEventV1;
  touchedTaskIds: string[];
  expectedTaskVersions: Record<string, number>;
  status: CanonicalEventOutboxStatus;
  attempts: number;
  createdAt: string;
  updatedAt: string;
  lastAttemptAt: string | null;
  lastError: string | null;
  publishedHeadSha: string | null;
  publishedSequenceStart: number | null;
  publishedSequenceEnd: number | null;
};

export type EnqueueCanonicalEventMetadata = {
  touchedTaskIds?: string[];
  expectedTaskVersions?: Record<string, number>;
  now?: string;
  rowId?: string;
};

export type EnqueueCanonicalEventResult = {
  inserted: boolean;
  row: CanonicalEventOutboxRow;
};

export type CanonicalPublishResult = {
  headSha?: string | null;
  sequenceStart?: number | null;
  sequenceEnd?: number | null;
};

export type CanonicalEventOutboxCounts = {
  total: number;
  pending: number;
  publishing: number;
  published: number;
  failed: number;
  conflict: number;
};

export type CanonicalEventOutboxStatusSnapshot = {
  schemaVersion: 1;
  counts: CanonicalEventOutboxCounts;
  oldestPendingCreatedAt: string | null;
  latestAttemptAt: string | null;
  latestPublishedAt: string | null;
};

type CanonicalOutboxDbRow = {
  id: string;
  event_id: string;
  event_kind: string;
  event_json: string;
  touched_task_ids_json: string;
  expected_task_versions_json: string;
  status: string;
  attempts: number;
  created_at: string;
  updated_at: string;
  last_attempt_at: string | null;
  last_error: string | null;
  published_head_sha: string | null;
  published_sequence_start: number | null;
  published_sequence_end: number | null;
};

function asIsoNow(now?: string): string {
  return typeof now === "string" && now.trim() ? now.trim() : new Date().toISOString();
}

function assertOutboxAvailable(db: Database.Database): void {
  if (!kitSqliteHasCanonicalEventOutbox(db)) {
    throw new Error(`${KIT_CANONICAL_EVENT_OUTBOX_TABLE} is not available (kit SQLite user_version < 30)`);
  }
}

function normalizeIds(ids: readonly string[]): string[] {
  const seen = new Set<string>();
  for (const id of ids) {
    const value = typeof id === "string" ? id.trim() : "";
    if (!value) {
      continue;
    }
    seen.add(value);
  }
  return [...seen];
}

function normalizeTouchedTaskIds(event: CanonicalStateEventV1, touchedTaskIds?: readonly string[]): string[] {
  const ids = touchedTaskIds ?? taskIdsTouchedByEvent(event);
  return normalizeIds(ids).sort((a, b) => a.localeCompare(b));
}

function normalizeExpectedTaskVersions(
  expectedTaskVersions?: Record<string, number>
): Record<string, number> {
  if (!expectedTaskVersions) {
    return {};
  }
  const entries: Array<[string, number]> = [];
  for (const [taskId, version] of Object.entries(expectedTaskVersions)) {
    const key = taskId.trim();
    if (!key) {
      continue;
    }
    if (!Number.isFinite(version)) {
      continue;
    }
    entries.push([key, Math.max(0, Math.trunc(version))]);
  }
  entries.sort(([a], [b]) => a.localeCompare(b));
  return Object.fromEntries(entries);
}

function parseJson<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function parseStatus(raw: string): CanonicalEventOutboxStatus {
  const value = raw.trim();
  if ((CANONICAL_EVENT_OUTBOX_STATUSES as readonly string[]).includes(value)) {
    return value as CanonicalEventOutboxStatus;
  }
  return "failed";
}

function mapOutboxRow(row: CanonicalOutboxDbRow): CanonicalEventOutboxRow {
  return {
    id: row.id,
    eventId: row.event_id,
    eventKind: row.event_kind,
    event: parseJson<CanonicalStateEventV1>(row.event_json, {
      schemaVersion: 1,
      eventId: row.event_id,
      sequence: 0,
      parentEventId: null,
      recordedAt: row.created_at,
      actor: { id: "system", source: "system" },
      command: { name: "unknown" },
      kind: row.event_kind,
      payload: {}
    } as unknown as CanonicalStateEventV1),
    touchedTaskIds: parseJson<string[]>(row.touched_task_ids_json, []),
    expectedTaskVersions: parseJson<Record<string, number>>(row.expected_task_versions_json, {}),
    status: parseStatus(row.status),
    attempts: Number(row.attempts) || 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastAttemptAt: row.last_attempt_at,
    lastError: row.last_error,
    publishedHeadSha: row.published_head_sha,
    publishedSequenceStart:
      typeof row.published_sequence_start === "number"
        ? row.published_sequence_start
        : row.published_sequence_start === null
          ? null
          : Number(row.published_sequence_start),
    publishedSequenceEnd:
      typeof row.published_sequence_end === "number"
        ? row.published_sequence_end
        : row.published_sequence_end === null
          ? null
          : Number(row.published_sequence_end)
  };
}

function fetchByEventId(db: Database.Database, eventId: string): CanonicalEventOutboxRow {
  const row = db
    .prepare(
      `SELECT id, event_id, event_kind, event_json, touched_task_ids_json, expected_task_versions_json,
              status, attempts, created_at, updated_at, last_attempt_at, last_error,
              published_head_sha, published_sequence_start, published_sequence_end
       FROM ${KIT_CANONICAL_EVENT_OUTBOX_TABLE}
       WHERE event_id = ?`
    )
    .get(eventId) as CanonicalOutboxDbRow | undefined;
  if (!row) {
    throw new Error(`Outbox row missing for event_id=${eventId}`);
  }
  return mapOutboxRow(row);
}

function placeholdersForIds(ids: readonly string[]): string {
  return ids.map(() => "?").join(", ");
}

function runStatusUpdateByIds(
  db: Database.Database,
  ids: readonly string[],
  sqlSetClause: string,
  setParams: unknown[],
  allowedCurrentStatuses: readonly CanonicalEventOutboxStatus[]
): number {
  const normalized = normalizeIds(ids);
  if (normalized.length === 0) {
    return 0;
  }
  const currentStatusPlaceholders = allowedCurrentStatuses.map(() => "?").join(", ");
  const sql = `UPDATE ${KIT_CANONICAL_EVENT_OUTBOX_TABLE}
    SET ${sqlSetClause}
    WHERE id IN (${placeholdersForIds(normalized)})
      AND status IN (${currentStatusPlaceholders})`;
  const result = db
    .prepare(sql)
    .run(...setParams, ...normalized, ...allowedCurrentStatuses);
  return Number(result.changes) || 0;
}

export function canonicalEventOutboxTableAvailable(db: Database.Database): boolean {
  return kitSqliteHasCanonicalEventOutbox(db);
}

export function enqueueCanonicalEvent(
  db: Database.Database,
  event: CanonicalStateEventV1,
  metadata: EnqueueCanonicalEventMetadata = {}
): EnqueueCanonicalEventResult {
  assertOutboxAvailable(db);
  const eventId = typeof event.eventId === "string" ? event.eventId.trim() : "";
  if (!eventId) {
    throw new Error("enqueueCanonicalEvent requires event.eventId");
  }
  const now = asIsoNow(metadata.now);
  const touchedTaskIds = normalizeTouchedTaskIds(event, metadata.touchedTaskIds);
  const expectedTaskVersions = normalizeExpectedTaskVersions(metadata.expectedTaskVersions);
  const rowId =
    typeof metadata.rowId === "string" && metadata.rowId.trim()
      ? metadata.rowId.trim()
      : crypto.randomUUID();
  const result = db
    .prepare(
      `INSERT INTO ${KIT_CANONICAL_EVENT_OUTBOX_TABLE} (
         id, event_id, event_kind, event_json, touched_task_ids_json, expected_task_versions_json,
         status, attempts, created_at, updated_at
       ) VALUES (
         @id, @event_id, @event_kind, @event_json, @touched_task_ids_json, @expected_task_versions_json,
         'pending', 0, @created_at, @updated_at
       )
       ON CONFLICT(event_id) DO NOTHING`
    )
    .run({
      id: rowId,
      event_id: eventId,
      event_kind: event.kind,
      event_json: JSON.stringify(event),
      touched_task_ids_json: JSON.stringify(touchedTaskIds),
      expected_task_versions_json: JSON.stringify(expectedTaskVersions),
      created_at: now,
      updated_at: now
    });
  return {
    inserted: (Number(result.changes) || 0) > 0,
    row: fetchByEventId(db, eventId)
  };
}

export function listPendingCanonicalEvents(
  db: Database.Database,
  limit: number
): CanonicalEventOutboxRow[] {
  assertOutboxAvailable(db);
  const lim = Math.min(Math.max(Math.trunc(limit), 1), 500);
  const rows = db
    .prepare(
      `SELECT id, event_id, event_kind, event_json, touched_task_ids_json, expected_task_versions_json,
              status, attempts, created_at, updated_at, last_attempt_at, last_error,
              published_head_sha, published_sequence_start, published_sequence_end
       FROM ${KIT_CANONICAL_EVENT_OUTBOX_TABLE}
       WHERE status = 'pending'
       ORDER BY created_at ASC, id ASC
       LIMIT ?`
    )
    .all(lim) as CanonicalOutboxDbRow[];
  return rows.map(mapOutboxRow);
}

export function markPublishing(db: Database.Database, ids: readonly string[]): number {
  assertOutboxAvailable(db);
  const now = new Date().toISOString();
  return runStatusUpdateByIds(
    db,
    ids,
    "status = 'publishing', attempts = attempts + 1, last_attempt_at = ?, updated_at = ?, last_error = NULL",
    [now, now],
    ["pending"]
  );
}

export function markPublished(
  db: Database.Database,
  ids: readonly string[],
  publishResult: CanonicalPublishResult
): number {
  assertOutboxAvailable(db);
  const now = new Date().toISOString();
  const headSha =
    typeof publishResult.headSha === "string" && publishResult.headSha.trim()
      ? publishResult.headSha.trim()
      : null;
  const sequenceStart =
    typeof publishResult.sequenceStart === "number" && Number.isFinite(publishResult.sequenceStart)
      ? Math.trunc(publishResult.sequenceStart)
      : null;
  const sequenceEnd =
    typeof publishResult.sequenceEnd === "number" && Number.isFinite(publishResult.sequenceEnd)
      ? Math.trunc(publishResult.sequenceEnd)
      : null;
  return runStatusUpdateByIds(
    db,
    ids,
    "status = 'published', updated_at = ?, last_error = NULL, published_head_sha = ?, published_sequence_start = ?, published_sequence_end = ?",
    [now, headSha, sequenceStart, sequenceEnd],
    ["publishing"]
  );
}

export function markFailed(db: Database.Database, ids: readonly string[], error: string): number {
  assertOutboxAvailable(db);
  const now = new Date().toISOString();
  const message = error.trim() || "canonical-publish-failed";
  return runStatusUpdateByIds(
    db,
    ids,
    "status = 'failed', updated_at = ?, last_error = ?",
    [now, message],
    ["publishing"]
  );
}

export function markConflict(db: Database.Database, ids: readonly string[], conflict: string): number {
  assertOutboxAvailable(db);
  const now = new Date().toISOString();
  const message = conflict.trim() || "canonical-publish-conflict";
  return runStatusUpdateByIds(
    db,
    ids,
    "status = 'conflict', updated_at = ?, last_error = ?",
    [now, message],
    ["publishing"]
  );
}

export function resetStalePublishing(db: Database.Database, thresholdMs: number): number {
  assertOutboxAvailable(db);
  const threshold = Math.max(1, Math.trunc(thresholdMs));
  const nowMs = Date.now();
  const now = new Date(nowMs).toISOString();
  const cutoff = new Date(nowMs - threshold).toISOString();
  const result = db
    .prepare(
      `UPDATE ${KIT_CANONICAL_EVENT_OUTBOX_TABLE}
       SET status = 'pending', updated_at = ?, last_error = NULL
       WHERE status = 'publishing'
         AND COALESCE(last_attempt_at, updated_at) <= ?`
    )
    .run(now, cutoff);
  return Number(result.changes) || 0;
}

export function getOutboxStatus(db: Database.Database): CanonicalEventOutboxStatusSnapshot {
  assertOutboxAvailable(db);
  const counts: CanonicalEventOutboxCounts = {
    total: 0,
    pending: 0,
    publishing: 0,
    published: 0,
    failed: 0,
    conflict: 0
  };
  const grouped = db
    .prepare(
      `SELECT status, COUNT(*) AS count
       FROM ${KIT_CANONICAL_EVENT_OUTBOX_TABLE}
       GROUP BY status`
    )
    .all() as Array<{ status: string; count: number }>;
  for (const row of grouped) {
    const status = parseStatus(row.status);
    const count = Number(row.count) || 0;
    counts[status] += count;
    counts.total += count;
  }
  const oldestPending = db
    .prepare(
      `SELECT MIN(created_at) AS oldest_pending_created_at
       FROM ${KIT_CANONICAL_EVENT_OUTBOX_TABLE}
       WHERE status = 'pending'`
    )
    .get() as { oldest_pending_created_at: string | null } | undefined;
  const latestAttempt = db
    .prepare(
      `SELECT MAX(last_attempt_at) AS latest_attempt_at
       FROM ${KIT_CANONICAL_EVENT_OUTBOX_TABLE}`
    )
    .get() as { latest_attempt_at: string | null } | undefined;
  const latestPublished = db
    .prepare(
      `SELECT MAX(updated_at) AS latest_published_at
       FROM ${KIT_CANONICAL_EVENT_OUTBOX_TABLE}
       WHERE status = 'published'`
    )
    .get() as { latest_published_at: string | null } | undefined;
  return {
    schemaVersion: 1,
    counts,
    oldestPendingCreatedAt: oldestPending?.oldest_pending_created_at ?? null,
    latestAttemptAt: latestAttempt?.latest_attempt_at ?? null,
    latestPublishedAt: latestPublished?.latest_published_at ?? null
  };
}
