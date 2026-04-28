# release-evidence-manifest

Build a machine-readable release evidence manifest for phase closeout. This is a read-only command: it validates supplied approval/release-note/follow-up evidence and aggregates task delivery evidence from the task store.

## Usage

```
workspace-kit run release-evidence-manifest '{"phaseKey":"74","approval":{"actor":"maintainer@example.com","timestamp":"2026-04-28T07:00:00.000Z","rationale":"approved after reviewing scope and gates","scope":"phase-74 publish"},"releaseNotes":{"source":"release-notes-json","entries":["Phase 74 release evidence hardening"]},"followUpScan":{"scannedAt":"2026-04-28T07:00:00.000Z","rationale":"No unresolved follow-up tasks after transcript/friction scan"},"followUpTasks":[]}'
```

## Arguments

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `phaseKey` | string | no | Phase key used to collect completed task delivery evidence. |
| `releaseVersion` | string | no | Defaults to `package.json` `version` when omitted. |
| `packageName` | string | no | Defaults to `package.json` `name` when omitted. |
| `git` | object | no | Git refs/tags/SHAs relevant to the release. |
| `approval` | object | yes | Human publish approval, separate from Tier A/B `policyApproval`. Requires `actor`, `timestamp`, `rationale`, and `scope`. |
| `releaseNotes` | object | yes | Agent-readable changelog/release-note evidence. Requires `source` and non-empty `entries[]`. |
| `validations` | object[] | no | Validation command/artifact records. |
| `risks` | object[] | no | Known risks/caveats/migration/security notes. |
| `publishArtifacts` | object[] | no | Tag, GitHub release, npm package, CI publish run, or similar proof. May be empty before publish. |
| `followUpScan` | object | yes | Requires `scannedAt`. If `followUpTasks` is empty, also requires `rationale` so agents cannot claim zero follow-ups without evidence. |
| `followUpTasks` | object[] | no | Follow-up task references. Each `taskId` must exist in the task engine when supplied. |

## Returns

Success `data.manifest` includes:

- `schemaVersion`, `createdAt`, `releaseVersion`, `packageName`, `phaseKey`
- `git`, `approval`, `releaseNotes`, `validations`, `risks`, `publishArtifacts`
- `taskDeliveryEvidence[]` using the `metadata.deliveryEvidence` / `metadata.deliveryWaiver` vocabulary from `phase-delivery-preflight`
- `followUpScan`, `followUpTasks[]`, and `followUpSummary`

## Structured Failures

- `release-evidence-missing-approval`
- `release-evidence-missing-release-notes`
- `release-evidence-followup-scan-required`
- `release-evidence-followup-task-missing`
- `release-evidence-delivery-violations`
- `release-evidence-missing-version`
- `release-evidence-missing-package`

## Related

- `phase-delivery-preflight` — validates completed task delivery evidence before closeout.
- `.ai/RELEASING.md` — release evidence gates and human approval boundary.
- `.ai/playbooks/phase-closeout-and-release.md` — phase closeout workflow.
