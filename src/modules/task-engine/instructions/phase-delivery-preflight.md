<!--
agentCapsule|v=1|command=phase-delivery-preflight|module=task-engine|schema_only=pnpm exec wk run phase-delivery-preflight --schema-only '{}'
-->

# phase-delivery-preflight

Read-only audit for phase task delivery evidence before agents mark phase work complete.

## Usage

```
workspace-kit run phase-delivery-preflight '{}'
workspace-kit run phase-delivery-preflight '{"phaseKey":"74","includeInProgress":true}'
```

## Arguments

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `phaseKey` | string | no | Stable phase key to audit. Defaults to the canonical current phase from `kit_workspace_status`, then config fallback. |
| `includeInProgress` | boolean | no | Include `in_progress` tasks as "about to complete" candidates. Defaults to `true`; completed tasks are always checked. |

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

Success `data` includes `schemaVersion`, `phaseKey`, `checkedTaskCount`, `violationCount`, and `violations[]`. Each violation includes task identity, status, phase key, code, message, and `missingFields`.

## Related

- `workspace-kit run run-transition` — completion emits or enforces the same evidence requirement via the `delivery-evidence` guard.
- `.ai/playbooks/task-to-phase-branch.md` — PR-first task delivery flow.
