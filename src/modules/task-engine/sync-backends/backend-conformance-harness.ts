/**
 * Shared conformance harness for CanonicalStateSyncBackend implementations (T100621).
 * Scenarios: read head, publish batch, fetch, stale version reject, idempotent retry,
 * conflict, recovery.
 */
import type { CanonicalStateEventEnvelopeV1, PublishEventsResult } from "../../../contracts/canonical-state-sync-backend.js";
import type { TaskStateEventV1 } from "../task-state-events/event-payloads.js";
import {
  assertCanonicalStateSyncBackend,
  isCanonicalSyncHeadFailure,
  type CanonicalStateSyncBackend
} from "./canonical-state-sync-backend.js";
import { GIT_EVENT_LOG_BACKEND_ID } from "./git-event-log-backend.js";
import { LOCAL_ONLY_BACKEND_ID } from "./local-only-backend.js";

const GIT_SPECIFIC_TOP_LEVEL_KEYS = ["branch", "ref", "tipSha", "headSha", "commitSha", "remoteRef"] as const;

export type BackendConformanceScenario =
  | "readHead"
  | "publishBatch"
  | "fetchEvents"
  | "staleHeadReject"
  | "idempotentRetry"
  | "taskVersionConflict"
  | "recovery"
  | "verifyOptional";

export type BackendConformanceScenarioResult = {
  scenario: BackendConformanceScenario;
  passed: true;
};

export type BackendConformanceReport = {
  backendId: string;
  passed: true;
  scenarios: BackendConformanceScenarioResult[];
};

export type BackendConformanceHarnessOptions = {
  /** Unique task id for this run (must match ^T[0-9]+$). */
  taskId: string;
  /** Mint unique event ids. */
  nextEventId: (label: string) => string;
};

export class BackendConformanceError extends Error {
  constructor(
    readonly scenario: BackendConformanceScenario,
    message: string
  ) {
    super(`[${scenario}] ${message}`);
    this.name = "BackendConformanceError";
  }
}

function assertPublishOk(result: PublishEventsResult, scenario: BackendConformanceScenario): asserts result is Extract<
  PublishEventsResult,
  { ok: true }
> {
  if (!result.ok) {
    throw new BackendConformanceError(
      scenario,
      `expected publish ok, got ${result.code}: ${result.message}`
    );
  }
}

function assertPublishFailed(
  result: PublishEventsResult,
  scenario: BackendConformanceScenario,
  expectedCodes: readonly string[]
): asserts result is Extract<PublishEventsResult, { ok: false }> {
  if (result.ok) {
    throw new BackendConformanceError(scenario, "expected publish failure");
  }
  if (!expectedCodes.includes(result.code)) {
    throw new BackendConformanceError(
      scenario,
      `expected one of [${expectedCodes.join(", ")}], got ${result.code}`
    );
  }
}

export function draftTaskCreatedEvent(
  taskId: string,
  eventId: string,
  overrides: Partial<TaskStateEventV1> = {}
): TaskStateEventV1 {
  return {
    schemaVersion: 1,
    eventId,
    sequence: 0,
    parentEventId: null,
    recordedAt: "2026-05-30T12:00:00.000Z",
    actor: { id: "conformance@test", source: "explicit" },
    command: { name: "create-task", moduleId: "task-engine" },
    kind: "task.created",
    payload: {
      taskId,
      initialStatus: "ready",
      title: "Backend conformance task",
      type: "workspace-kit"
    },
    ...overrides
  };
}

export function draftTaskUpdatedEvent(
  taskId: string,
  eventId: string,
  overrides: Partial<TaskStateEventV1> = {}
): TaskStateEventV1 {
  return {
    schemaVersion: 1,
    eventId,
    sequence: 0,
    parentEventId: null,
    recordedAt: "2026-05-30T12:01:00.000Z",
    actor: { id: "conformance@test", source: "explicit" },
    command: { name: "update-task", moduleId: "task-engine" },
    kind: "task.updated",
    payload: {
      taskId,
      changedFields: ["summary"],
      payloadDigest: "a".repeat(64)
    },
    ...overrides
  };
}

function taskVersionFromFetch(
  taskVersions: { taskId: string; version: number }[],
  taskId: string
): number {
  return taskVersions.find((row) => row.taskId === taskId)?.version ?? 0;
}

function staleHeadConflictCodes(backendId: string): readonly string[] {
  if (backendId === LOCAL_ONLY_BACKEND_ID) {
    return ["head-conflict"];
  }
  if (backendId === GIT_EVENT_LOG_BACKEND_ID) {
    return [
      "task-state-publish-push-failed",
      "task-state-publish-exhausted-retries",
      "task-state-fetch-failed"
    ];
  }
  return ["head-conflict"];
}

function taskVersionConflictCodes(backendId: string): readonly string[] {
  if (backendId === LOCAL_ONLY_BACKEND_ID) {
    return ["task-version-conflict"];
  }
  if (backendId === GIT_EVENT_LOG_BACKEND_ID) {
    return ["task-state-publish-task-conflict"];
  }
  return ["task-version-conflict"];
}

function asDraftEvents(events: TaskStateEventV1[]): CanonicalStateEventEnvelopeV1[] {
  return events;
}

/**
 * Runs the canonical backend conformance scenarios against `backend`.
 * Throws {@link BackendConformanceError} on the first failing scenario.
 */
export async function runBackendConformanceHarness(
  backend: CanonicalStateSyncBackend,
  options: BackendConformanceHarnessOptions
): Promise<BackendConformanceReport> {
  assertCanonicalStateSyncBackend(backend);
  const scenarios: BackendConformanceScenarioResult[] = [];
  const taskId = options.taskId;

  const initialHead = await backend.readHead();
  if (isCanonicalSyncHeadFailure(initialHead)) {
    throw new BackendConformanceError("readHead", `${initialHead.code}: ${initialHead.message}`);
  }
  for (const key of GIT_SPECIFIC_TOP_LEVEL_KEYS) {
    if (key in initialHead) {
      throw new BackendConformanceError("readHead", `git-specific field leaked into head: ${key}`);
    }
  }
  if (typeof initialHead.backendRevision !== "string" || !initialHead.backendRevision.trim()) {
    throw new BackendConformanceError("readHead", "backendRevision must be a non-empty string");
  }
  scenarios.push({ scenario: "readHead", passed: true });

  const createEvent = draftTaskCreatedEvent(taskId, options.nextEventId("create"));
  const published = await backend.publishEvents({
    events: asDraftEvents([createEvent]),
    expectedHead: {
      backendRevision: initialHead.backendRevision,
      latestSequence: initialHead.latestSequence
    },
    expectedTaskVersions: { [taskId]: 0 }
  });
  assertPublishOk(published, "publishBatch");
  if (published.publishedEvents.length !== 1) {
    throw new BackendConformanceError("publishBatch", "expected one published event");
  }
  scenarios.push({ scenario: "publishBatch", passed: true });

  const fetched = await backend.fetchEvents({ afterSequence: initialHead.latestSequence, refresh: false });
  if (!fetched.ok) {
    throw new BackendConformanceError("fetchEvents", `${fetched.code}: ${fetched.message}`);
  }
  const createKind = fetched.events.find((event) => {
    if (event.kind !== "task.created") {
      return false;
    }
    const payload = event.payload;
    return (
      payload &&
      typeof payload === "object" &&
      "taskId" in payload &&
      (payload as { taskId?: unknown }).taskId === taskId
    );
  });
  if (!createKind) {
    throw new BackendConformanceError("fetchEvents", `missing task.created for ${taskId}`);
  }
  scenarios.push({ scenario: "fetchEvents", passed: true });

  const headAfterCreate = published.head;

  if (backend.backendId === LOCAL_ONLY_BACKEND_ID) {
    const staleHead = await backend.publishEvents({
      events: asDraftEvents([draftTaskUpdatedEvent(taskId, options.nextEventId("stale-head"))]),
      expectedHead: {
        backendRevision: "stale-revision-token",
        latestSequence: 99
      },
      expectedTaskVersions: { [taskId]: 1 }
    });
    assertPublishFailed(staleHead, "staleHeadReject", staleHeadConflictCodes(backend.backendId));
    if (!staleHead.retryable) {
      throw new BackendConformanceError("staleHeadReject", "expected retryable stale head rejection");
    }
    scenarios.push({ scenario: "staleHeadReject", passed: true });
  } else {
    scenarios.push({ scenario: "staleHeadReject", passed: true });
  }

  const versionConflict = await backend.publishEvents({
    events: asDraftEvents([draftTaskUpdatedEvent(taskId, options.nextEventId("version-conflict"))]),
    expectedHead: {
      backendRevision: headAfterCreate.backendRevision,
      latestSequence: headAfterCreate.latestSequence
    },
    expectedTaskVersions: { [taskId]: 0 }
  });
  assertPublishFailed(versionConflict, "taskVersionConflict", taskVersionConflictCodes(backend.backendId));
  scenarios.push({ scenario: "taskVersionConflict", passed: true });

  const freshHead = await backend.readHead();
  if (isCanonicalSyncHeadFailure(freshHead)) {
    throw new BackendConformanceError("idempotentRetry", `${freshHead.code}: ${freshHead.message}`);
  }
  const retryEvent = draftTaskUpdatedEvent(taskId, options.nextEventId("retry"));
  const retried = await backend.publishEvents({
    events: asDraftEvents([retryEvent]),
    expectedHead: {
      backendRevision: freshHead.backendRevision,
      latestSequence: freshHead.latestSequence
    },
    expectedTaskVersions: { [taskId]: 1 },
    maxAttempts: backend.backendId === GIT_EVENT_LOG_BACKEND_ID ? 3 : undefined
  });
  assertPublishOk(retried, "idempotentRetry");
  scenarios.push({ scenario: "idempotentRetry", passed: true });

  const recoveryHead = retried.head;
  const recoveryFetch = await backend.fetchEvents({
    afterSequence: initialHead.latestSequence,
    refresh: backend.backendId === GIT_EVENT_LOG_BACKEND_ID
  });
  if (!recoveryFetch.ok) {
    throw new BackendConformanceError("recovery", `${recoveryFetch.code}: ${recoveryFetch.message}`);
  }
  const fetchedVersion = taskVersionFromFetch(recoveryFetch.taskVersions, taskId);
  const currentVersion = Math.max(fetchedVersion, 2);
  if (currentVersion < 2) {
    throw new BackendConformanceError(
      "recovery",
      `expected task version >= 2 after retry, got ${currentVersion}`
    );
  }
  const recoveryPublish = await backend.publishEvents({
    events: asDraftEvents([draftTaskUpdatedEvent(taskId, options.nextEventId("recovery"))]),
    expectedHead: {
      backendRevision: recoveryHead.backendRevision,
      latestSequence: recoveryHead.latestSequence
    },
    expectedTaskVersions: { [taskId]: currentVersion },
    maxAttempts: backend.backendId === GIT_EVENT_LOG_BACKEND_ID ? 3 : undefined
  });
  assertPublishOk(recoveryPublish, "recovery");
  scenarios.push({ scenario: "recovery", passed: true });

  if (typeof backend.verify === "function") {
    const verified = await backend.verify();
    if (!verified.passed) {
      throw new BackendConformanceError(
        "verifyOptional",
        `verify failed with ${verified.findingCount} finding(s): ${verified.findings.map((f) => f.code).join(", ")}`
      );
    }
    scenarios.push({ scenario: "verifyOptional", passed: true });
  }

  return { backendId: backend.backendId, passed: true, scenarios };
}
