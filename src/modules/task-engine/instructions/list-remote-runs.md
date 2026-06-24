<!--
agentCapsule|v=1|command=list-remote-runs|module=task-engine|schema_only=pnpm exec wk run list-remote-runs --schema-only '{}'
-->

# list-remote-runs

**Tier C** — read-only discovery for Cursor background-agent remote runs linked to **`T###`** tasks.

Phase 1 (T100334): **spec + read stub only**. Returns an empty `runs[]` projection with `persistence: "none"` until SQLite storage ships in Phase 2. Launch/write commands are **not** registered.

## Purpose

- List remote run metadata rows for operator/agent dashboards and delivery loops.
- Filter by `taskId` (`T###`) and optional `status`.
- Surface linkage fields required before `run-transition` `complete` evidence attach.

**Canon:** `.ai/adrs/ADR-cursor-remote-agent-handoff-v1.md`, `schemas/remote-run-metadata.v1.json`, `.ai/runbooks/cursor-remote-agent-handoff.md`.

## Arguments

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `taskId` | string | no | Filter to one execution task (`T###`). |
| `status` | string | no | Filter: `queued` \| `running` \| `needs_input` \| `completed` \| `failed` \| `cancelled` \| `handed_off`. |
| `hostProvider` | string | no | Default `cursor`. |
| `limit` | integer | no | Max rows (default 50, cap 200). |

## Response (`data`)

Aligned with `schemas/remote-run-metadata.v1.json` → `$defs/listRemoteRunsResponse`:

| Field | Description |
| --- | --- |
| `schemaVersion` | `1` |
| `count` | Number of runs returned |
| `runs[]` | List items: `remoteRunId`, `taskId`, `status`, `hostProvider`, `hostRunId`, `branch`, `updatedAt`, `evidenceCount`, `takeOverEligible` |
| `persistence` | `none` (Phase 1 stub) or `sqlite` (Phase 2) |
| `filters` | Echo of applied filters |

Full metadata document (Phase 2 persistence): `remoteRunId`, `taskId`, `status`, `hostProvider`, `hostRunId`, `hostHint`, `branch`, `worktreePath`, `baseBranch`, `launchedAt`, `updatedAt`, `completedAt`, `launchedBy`, `approvalRecord`, `evidenceRefs[]`, `handoffState`, `failureReason`, `metadata`.

## Example

```bash
pnpm exec wk run list-remote-runs '{}'
pnpm exec wk run list-remote-runs '{"taskId":"T100334"}'
pnpm exec wk run list-remote-runs '{"taskId":"T100334","status":"running"}'
```

## Deferred commands (Phase 2 — not registered)

| Command | Tier | Notes |
| --- | --- | --- |
| `launch-remote-run` | B | Requires JSON `policyApproval`; task `in_progress` |
| `sync-remote-run` | B | Poll provider status into kit SQLite |
| `attach-remote-run-evidence` | B | Append `evidenceRefs` for delivery |
| `cancel-remote-run` | B | Terminal `cancelled` state |

See ADR Phase 2 table before implementing any write path.
