# ADR: Hosted API backend contract (v1)

## Status

Accepted — Phase **125** (**T100620** / T-BE-205). Design only; full hosted service implementation stays out of scope until a follow-on task approves build-out.

## Context

**T100616** introduced **`CanonicalStateSyncBackend`** — a backend-agnostic interface for canonical task-state sync (`readHead`, `fetchEvents`, `publishEvents`, optional `verify` / `compact` / `snapshot`). **GitEventLogBackend** maps Git branch layout to that interface today.

Multi-agent and team workflows need a hosted canonical authority that preserves the same semantics without requiring every client to push to a shared Git branch. The hosted API must:

- Mirror current Git optimistic concurrency (expected head revision + expected task/planning versions).
- Support batched publish and paginated fetch.
- Provide idempotent writes for flaky agents and retries.
- Surface conflict details compatible with **`CanonicalSyncFailure`** / **`CanonicalSyncConflictDetail`**.
- Document auth, tenancy, and privacy expectations before any server ships.

## Decision

Define a versioned **HTTP wire contract** (`src/contracts/hosted-api-backend.ts`, schema version **1**) that a future **`HostedApiBackend`** adapter implements by translating HTTP requests/responses to **`CanonicalStateSyncBackend`** method calls.

### Resource model

| HTTP | Maps to | Purpose |
| --- | --- | --- |
| `GET /v1/canonical/head` | `readHead()` | Latest sequence, event id, backend revision, snapshot id |
| `GET /v1/canonical/events` | `fetchEvents()` | Paginated event stream after a sequence cursor |
| `POST /v1/canonical/events/publish` | `publishEvents()` | Append one or more events with optimistic concurrency |
| `GET /v1/canonical/versions` | (projection slice of `fetchEvents` at head) | Task + planning version rows without replaying events |
| `POST /v1/canonical/snapshots` | `snapshot()` | Materialize snapshot through a sequence |
| `GET /v1/canonical/snapshots/latest` | head + snapshot metadata | Latest snapshot pointer for hydrate tail |

Optional admin paths (`verify`, `compact`) may be added in v2; v1 clients rely on operator tooling or Git-parity maintenance jobs.

### Git semantic parity

| Git concept | Hosted API equivalent |
| --- | --- |
| Branch tip SHA | `backendRevision` on **`CanonicalStateHead`** |
| `expectedHeadSha` on publish | `expectedHead.backendRevision` + `expectedHead.latestSequence` |
| `expectedTaskVersions` | Same record shape on publish body |
| JSONL segment fetch after sequence | `GET /events?afterSequence=N&limit=L` |
| Manifest `latestSnapshotId` | `head.latestSnapshotId` + `GET /snapshots/latest` |
| Conflict / stale tip | HTTP **409** with **`HostedApiConflictResponseV1`** (`retryable: true`) |

Diagnostics (tenant id, region, storage shard) stay in response **`diagnostics`** — never required for generic clients.

### Batching and pagination

- **Publish:** request body accepts **`events[]`** (1–256 envelopes per request; servers may enforce a lower cap and return **413**).
- **Fetch:** `afterSequence` (exclusive lower bound), optional `throughSequence` (inclusive upper bound), `limit` (default 100, max 1000).
- **Versions:** optional standalone read for dashboards; must match replayed projection at the same `backendRevision`.

### Idempotency

- Clients send **`Idempotency-Key`** (UUID or opaque string ≤128 chars) on **`POST .../events/publish`** and **`POST .../snapshots`**.
- Server stores `(tenantId, route, idempotencyKey) → storedResponse` for **24 hours** minimum.
- Replays with the same key and **identical** request body return the original **2xx** response and **`Idempotency-Replayed: true`** header.
- Same key with a **different** body returns **422** (`idempotency-key-mismatch`, not retryable).

### Concurrency and conflicts

Publish validates, in order:

1. `expectedHead.backendRevision` and `expectedHead.latestSequence` match server head (else **409** `head-revision-mismatch`).
2. `expectedTaskVersions` / `expectedPlanningVersions` match server projection (else **409** `task-version-mismatch` or `planning-version-mismatch` with per-row detail).
3. Event parent chain is consistent with admitted sequence (else **409** `sequence-gap` or `parent-mismatch`).

All conflict responses use **`HostedApiErrorResponseV1`** with **`retryable: true`** unless the payload is permanently invalid (**422**, `retryable: false`).

### Authentication and authorization

| Token kind | Typical use | Scope |
| --- | --- | --- |
| **personal** | Maintainer laptop / CLI | Read + write for owned workspaces |
| **workspace** | Shared team workspace | Read + write within one workspace id |
| **agent** | Autonomous agent runtime | Write limited to task-engine event kinds; read head/events |
| **org** | Enterprise SSO / service account | Admin verify/compact (future); read/write per org policy |

Wire format: **`Authorization: Bearer <token>`**. Servers must reject missing or malformed credentials with **401**; valid token lacking scope with **403**.

Tokens must not appear in URLs, logs, or error **`message`** fields. Clients should prefer environment or secret-store injection.

### Privacy and security

- **Transport:** HTTPS only in production; TLS 1.2+; certificate pinning optional for embedded agents.
- **Tenancy:** Every record is keyed by **`workspaceId`** (or org + workspace composite). Cross-tenant ids in URLs return **404**, not **403**, to avoid enumeration.
- **Payload minimization:** Event bodies follow existing canonical event schemas; hosted operators must not index or expose task **`description`** / free-text fields in analytics without explicit workspace policy.
- **Retention:** Snapshot and event retention policies are operator-configured; compact is server-side only — clients cannot delete another agent's history without admin scope.
- **Audit:** Server should append immutable audit metadata (token id hash, source IP region) server-side — not echoed to generic clients.
- **Rate limits:** Return **429** with **`Retry-After`**; clients treat as retryable.

## Consequences

- **`HostedApiBackend`** (future implementation task) implements **`CanonicalStateSyncBackend`** by calling this HTTP contract.
- Conformance tests can mock HTTP and assert mapping to canonical result types.
- Git remains the default **`canonicalBackend.type: git`**; hosted config is opt-in when implemented.
- No SQLite or jsonl artifacts are introduced by this design task.

## Non-goals

- Running or deploying a hosted service.
- OAuth/OIDC provider selection (document token kinds only).
- Replacing Git event-log authority for solo/offline workflows.

## References

- `src/contracts/canonical-state-sync-backend.ts` — backend-agnostic sync types
- `src/contracts/hosted-api-backend.ts` — HTTP wire contract v1
- `src/modules/task-engine/sync-backends/git-method-compat.ts` — Git → interface mapping (parity reference)
- `BACKEND.md` § T-BE-205 (maintainer planning artifact; not agent bootstrap)
