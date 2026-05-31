/**
 * HTTP wire contract for HostedApiBackend (Phase 125 / T-BE-205).
 * Maps REST resources to CanonicalStateSyncBackend semantics; no Git/VCS fields on generic types.
 */

import type {
  CanonicalPlanningVersionRow,
  CanonicalStateCompactResult,
  CanonicalStateEventEnvelopeV1,
  CanonicalStateHead,
  CanonicalStateSequence,
  CanonicalStateSnapshotResult,
  CanonicalStateSyncDiagnostics,
  CanonicalStateVerifyResult,
  CanonicalSyncConflictDetail,
  CanonicalSyncFailure,
  CanonicalTaskVersionRow,
  FetchEventsInput,
  PublishEventsInput
} from "./canonical-state-sync-backend.js";

export const HOSTED_API_BACKEND_CONTRACT_VERSION = 1 as const;

/** Maximum events per publish request (server may enforce lower). */
export const HOSTED_API_PUBLISH_BATCH_MAX = 256 as const;

/** Default and maximum page size for GET /events. */
export const HOSTED_API_FETCH_DEFAULT_LIMIT = 100 as const;
export const HOSTED_API_FETCH_MAX_LIMIT = 1000 as const;

/** Minimum idempotency replay window (seconds) servers should honor. */
export const HOSTED_API_IDEMPOTENCY_TTL_SEC = 86_400 as const;

export type HostedApiTokenKind = "personal" | "workspace" | "agent" | "org";

/** Opaque workspace tenancy key — never a Git remote or branch name. */
export type HostedApiWorkspaceId = string;

export type HostedApiAuthContextV1 = {
  tokenKind: HostedApiTokenKind;
  /** Stable subject id for audit (hashed at rest on server). */
  subjectId: string;
  workspaceId: HostedApiWorkspaceId;
  /** Optional org scope for enterprise tokens. */
  orgId?: string;
  scopes: readonly string[];
};

export type HostedApiRequestHeadersV1 = {
  authorization: `Bearer ${string}`;
  /** Required on POST publish and POST snapshots when client wants safe retries. */
  idempotencyKey?: string;
  /** Contract version negotiation; default v1 when omitted. */
  "x-workflow-cannon-contract"?: `hosted-api-v${typeof HOSTED_API_BACKEND_CONTRACT_VERSION}`;
};

/** GET /v1/canonical/head — success body mirrors CanonicalStateHead. */
export type HostedApiHeadResponseV1 = CanonicalStateHead;

/** GET /v1/canonical/events query params. */
export type HostedApiFetchEventsQueryV1 = FetchEventsInput;

/** GET /v1/canonical/events — success body. */
export type HostedApiFetchEventsResponseV1 = {
  contractVersion: typeof HOSTED_API_BACKEND_CONTRACT_VERSION;
  head: CanonicalStateHead;
  events: CanonicalStateEventEnvelopeV1[];
  taskVersions: CanonicalTaskVersionRow[];
  planningVersions: CanonicalPlanningVersionRow[];
  /** True when more events exist beyond this page. */
  hasMore: boolean;
  /** Pass as afterSequence on the next page when hasMore is true. */
  nextAfterSequence: CanonicalStateSequence | null;
  diagnostics?: CanonicalStateSyncDiagnostics;
};

/** POST /v1/canonical/events/publish — request body. */
export type HostedApiPublishEventsRequestV1 = PublishEventsInput & {
  /** Client-generated correlation id for support; optional. */
  clientRequestId?: string;
};

/** POST /v1/canonical/events/publish — success body. */
export type HostedApiPublishEventsResponseV1 = {
  contractVersion: typeof HOSTED_API_BACKEND_CONTRACT_VERSION;
  head: CanonicalStateHead;
  publishedEvents: CanonicalStateEventEnvelopeV1[];
  attempts: number;
  /** Present when Idempotency-Key replayed a prior success. */
  idempotencyReplayed?: boolean;
  diagnostics?: CanonicalStateSyncDiagnostics;
};

/** GET /v1/canonical/versions — success body (projection at head without event bodies). */
export type HostedApiVersionsResponseV1 = {
  contractVersion: typeof HOSTED_API_BACKEND_CONTRACT_VERSION;
  head: CanonicalStateHead;
  taskVersions: CanonicalTaskVersionRow[];
  planningVersions: CanonicalPlanningVersionRow[];
  diagnostics?: CanonicalStateSyncDiagnostics;
};

export type HostedApiSnapshotRequestV1 = {
  dryRun?: boolean;
  snapshotId?: string;
  /** When set, snapshot through this sequence; default = head.latestSequence. */
  throughSequence?: CanonicalStateSequence;
};

/** POST /v1/canonical/snapshots — success aligns with CanonicalStateSnapshotResult. */
export type HostedApiSnapshotResponseV1 = CanonicalStateSnapshotResult & {
  contractVersion: typeof HOSTED_API_BACKEND_CONTRACT_VERSION;
  idempotencyReplayed?: boolean;
};

/** GET /v1/canonical/snapshots/latest — pointer for hydrate tail. */
export type HostedApiLatestSnapshotResponseV1 = {
  contractVersion: typeof HOSTED_API_BACKEND_CONTRACT_VERSION;
  head: CanonicalStateHead;
  snapshotId: string | null;
  throughSequence: CanonicalStateSequence | null;
  throughEventId: string | null;
  contentDigest: string | null;
  diagnostics?: CanonicalStateSyncDiagnostics;
};

/** Standard error envelope for 4xx/5xx (conflicts use 409). */
export type HostedApiErrorResponseV1 = CanonicalSyncFailure & {
  contractVersion: typeof HOSTED_API_BACKEND_CONTRACT_VERSION;
  httpStatus: number;
  /** Machine route id, e.g. canonical.events.publish */
  route: string;
};

/** 409 conflict specialization — includes structured conflict detail. */
export type HostedApiConflictResponseV1 = HostedApiErrorResponseV1 & {
  httpStatus: 409;
  conflict: CanonicalSyncConflictDetail;
};

export type HostedApiRouteId =
  | "canonical.head.read"
  | "canonical.events.fetch"
  | "canonical.events.publish"
  | "canonical.versions.read"
  | "canonical.snapshots.create"
  | "canonical.snapshots.latest";

/** Maps HostedApiBackend HTTP resources to CanonicalStateSyncBackend methods. */
export const HOSTED_API_METHOD_COMPAT: Readonly<
  Record<
    HostedApiRouteId,
    {
      httpMethod: "GET" | "POST";
      path: string;
      backendMethod: keyof HostedApiBackendMethodMap;
      notes: string;
    }
  >
> = {
  "canonical.head.read": {
    httpMethod: "GET",
    path: "/v1/canonical/head",
    backendMethod: "readHead",
    notes: "backendRevision is the hosted revision token (Git tip SHA equivalent)."
  },
  "canonical.events.fetch": {
    httpMethod: "GET",
    path: "/v1/canonical/events",
    backendMethod: "fetchEvents",
    notes: "Query afterSequence/limit/refresh; pagination via hasMore + nextAfterSequence."
  },
  "canonical.events.publish": {
    httpMethod: "POST",
    path: "/v1/canonical/events/publish",
    backendMethod: "publishEvents",
    notes: "Idempotency-Key required for agent clients; batch events[] mirrors Git publish batch."
  },
  "canonical.versions.read": {
    httpMethod: "GET",
    path: "/v1/canonical/versions",
    backendMethod: "fetchEvents",
    notes: "Projection-only read at head; same taskVersions/planningVersions as fetch at head."
  },
  "canonical.snapshots.create": {
    httpMethod: "POST",
    path: "/v1/canonical/snapshots",
    backendMethod: "snapshot",
    notes: "Updates head.latestSnapshotId on success; idempotent via Idempotency-Key."
  },
  "canonical.snapshots.latest": {
    httpMethod: "GET",
    path: "/v1/canonical/snapshots/latest",
    backendMethod: "readHead",
    notes: "Combines head pointer with latest snapshot metadata for hydrate tail."
  }
};

export type HostedApiBackendMethodMap = {
  readHead: "GET /v1/canonical/head";
  fetchEvents: "GET /v1/canonical/events (+ optional GET /v1/canonical/versions)";
  publishEvents: "POST /v1/canonical/events/publish";
  verify: "not in v1 wire (operator/admin future)";
  compact: "not in v1 wire (server-side retention)";
  snapshot: "POST /v1/canonical/snapshots + GET /v1/canonical/snapshots/latest";
};

/** Validates idempotency key shape before sending on wire. */
export function assertHostedApiIdempotencyKey(value: unknown): asserts value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > 128) {
    throw new TypeError("Hosted API idempotency key must be a non-empty string ≤128 characters");
  }
}

/** Validates publish batch size for client-side guardrails. */
export function assertHostedApiPublishBatch(events: readonly unknown[]): void {
  if (!Array.isArray(events) || events.length === 0) {
    throw new TypeError("Hosted API publish requires at least one event");
  }
  if (events.length > HOSTED_API_PUBLISH_BATCH_MAX) {
    throw new RangeError(
      `Hosted API publish batch exceeds max ${HOSTED_API_PUBLISH_BATCH_MAX} events`
    );
  }
}

/** Narrows a generic API failure to a 409 conflict response. */
export function isHostedApiConflictResponse(
  value: HostedApiErrorResponseV1
): value is HostedApiConflictResponseV1 {
  return value.httpStatus === 409 && value.conflict !== undefined;
}

/** Maps hosted publish success to canonical PublishEventsSuccess (adapter helper). */
export function hostedPublishResponseToCanonical(
  response: HostedApiPublishEventsResponseV1
): {
  ok: true;
  head: CanonicalStateHead;
  publishedEvents: CanonicalStateEventEnvelopeV1[];
  attempts: number;
  diagnostics?: CanonicalStateSyncDiagnostics;
} {
  return {
    ok: true,
    head: response.head,
    publishedEvents: response.publishedEvents,
    attempts: response.attempts,
    diagnostics: response.diagnostics
  };
}

/** Maps hosted fetch success to canonical FetchEventsSuccess (single page). */
export function hostedFetchResponseToCanonical(
  response: HostedApiFetchEventsResponseV1
): {
  ok: true;
  head: CanonicalStateHead;
  events: CanonicalStateEventEnvelopeV1[];
  taskVersions: CanonicalTaskVersionRow[];
  planningVersions: CanonicalPlanningVersionRow[];
  diagnostics?: CanonicalStateSyncDiagnostics;
} {
  return {
    ok: true,
    head: response.head,
    events: response.events,
    taskVersions: response.taskVersions,
    planningVersions: response.planningVersions,
    diagnostics: response.diagnostics
  };
}

/** Optional verify/compact result slots for future admin routes. */
export type HostedApiVerifyResponseV1 = CanonicalStateVerifyResult & {
  contractVersion: typeof HOSTED_API_BACKEND_CONTRACT_VERSION;
};

export type HostedApiCompactResponseV1 = CanonicalStateCompactResult & {
  contractVersion: typeof HOSTED_API_BACKEND_CONTRACT_VERSION;
};
