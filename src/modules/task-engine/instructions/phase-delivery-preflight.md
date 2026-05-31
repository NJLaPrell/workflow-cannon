<!--
agentCapsule|v=1|command=phase-delivery-preflight|module=task-engine|schema_only=pnpm exec wk run phase-delivery-preflight --schema-only '{}'
-->

# phase-delivery-preflight

Read-only audit for phase task delivery evidence before agents mark phase work complete.

## Usage

```
workspace-kit run phase-delivery-preflight '{}'
workspace-kit run phase-delivery-preflight '{"phaseKey":"74","includeInProgress":true}'
workspace-kit run phase-delivery-preflight '{"phaseKey":"74","includeInProgress":false,"baseRef":"origin/release/phase-74"}'
```

## Arguments

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `phaseKey` | string | no | Stable phase key to audit. Defaults to the canonical current phase from `kit_workspace_status`, then config fallback. |
| `includeInProgress` | boolean | no | Include `in_progress` tasks as "about to complete" candidates. Defaults to `true`; completed tasks are always checked. |
| `baseRef` | string | no | Git ref used by stranded-work detection. Defaults to `origin/release/phase-<phaseKey>` when a phase key is known, otherwise `origin/main`. |

Evaluation uses each task’s **resolved maintainer delivery policy** (same resolver as **`resolve-maintainer-delivery-policy`**) so GitHub PR tasks and **manual / local-reviewed-merge** tasks in the same phase can each satisfy different evidence shapes.

Preflight also embeds `data.readiness` from **`phase-closeout-readiness`**, `data.strandedWork` from the git stranded-work detector, `data.serviceSync` when **`tasks.canonicalAuthority`** is **`git-event-log`** and **`dashboard.dataSource`** is **`service`** or **`auto`**, and **`data.phaseProjection`** when git-event-log is active (local vs canonical phase delivery task count regression guard). Service sync findings cover dashboard service health (strict when `service`), drained canonical event outbox, fresh local projection, and no failed/conflict outbox rows. Delivery evidence alone is not enough for closeout: unfinished phase tasks, undrained outbox backlog, completed tasks with local-only implementation files, and phase projection count drift are blocking findings that agents must resolve before release prep continues.

## Delivery Evidence Metadata

Phased execution tasks must carry either `metadata.deliveryEvidence` or `metadata.deliveryWaiver` before completion.

`metadata.deliveryEvidence`:

```json
{
  "schemaVersion": 1,
  "branchName": "feature/T971-delivery-evidence-gate",
  "prUrl": "https://github.com/org/repo/pull/123",
  "prNumber": 123,
  "baseBranch": "release/phase-74",
  "mergeSha": "abc123...",
  "checks": [
    { "name": "test", "conclusion": "success" }
  ],
  "validationCommands": [
    { "command": "pnpm run test", "exitCode": 0 }
  ]
}
```

`metadata.deliveryWaiver`:

```json
{
  "schemaVersion": 1,
  "actor": "maintainer@example.com",
  "rationale": "local-only task; no PR evidence applies",
  "timestamp": "2026-04-28T07:00:00.000Z",
  "scope": "T971"
}
```

For non-shipping/local-only tasks, set `metadata.deliveryEvidenceRequired` to `false` or `metadata.localOnly` / `metadata.nonShipping` to `true`.

## Returns

Success `data` includes `schemaVersion`, `phaseKey`, `checkedTaskCount`, `violationCount`, `violations[]`, `readiness`, `strandedWork`, `serviceSync`, and `blockingFindingCount`. Each evidence violation includes task identity, status, phase key, code, message, and `missingFields`.

Service sync finding codes (when `data.serviceSync.active` is true):

- `service-sync-service-not-running` — blocking when `dashboard.dataSource` is `service`; warning when `auto` (CLI fallback).
- `service-sync-service-unhealthy` — `/health` probe failed while service mode requires the daemon.
- `service-sync-outbox-not-drained` — pending or publishing outbox rows remain.
- `service-sync-projection-not-fresh` — local projection is not `fresh`.
- `service-sync-conflict-rows` — failed/conflict outbox rows or conflict sync posture.

Stranded-work findings use stable codes:

- `stranded-local-work` — completed task evidence or touched-file metadata points at files that differ from `baseRef`.
- `stranded-work-base-unavailable` — the requested base ref is missing; fetch or choose a valid integration branch before closeout.
- `stranded-work-git-unavailable` — the command did not run inside a git worktree.

## Related

- `workspace-kit run run-transition` — completion emits or enforces the same evidence requirement via the `delivery-evidence` guard.
- `workspace-kit run phase-closeout-readiness` — unfinished phase task audit used by this preflight.
- `.ai/playbooks/task-to-phase-branch.md` — PR-first task delivery flow.
